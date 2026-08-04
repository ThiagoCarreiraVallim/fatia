import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FoodService } from './food.service';
import { calcMacrosFromFood } from './helpers/calc-macros';
import { NaoEhJpegError, removerMetadadosDoJpeg } from './helpers/strip-exif';
import { normalizeSearchText } from '../common/search-text';

/**
 * Reconhecimento de refeição por foto (#139).
 *
 * **A propriedade que faz o desenho valer: este serviço não grava nada.** Ele
 * devolve uma sugestão; quem grava é o caminho manual que já existe
 * (`MealService`, `MealItemService`). Isso resolve três itens do escopo da issue
 * de graça, e não por disciplina:
 *
 * - a **tela de confirmação obrigatória** passa a ser a única forma de gravar;
 * - a **idempotência e o `CONFLICT`** continuam sendo os já implementados, sem
 *   caminho de escrita novo a cobrir;
 * - **alimento não reconhecido cai no fluxo manual** porque nunca saiu dele.
 *
 * **A foto nunca toca disco.** Chega como Buffer, é limpa de metadados, vira
 * base64 na chamada ao agente e some com o fim da requisição — ADR 004.
 *
 * **O casamento com a TACO acontece aqui, e não no agente.** O plano da issue
 * previa o grafo chamando `search_food` pelo MCP com o Bearer do usuário; ficou
 * aqui porque este processo já tem o catálogo, já tem o `FoodService` e já tem a
 * normalização de busca (`common/search-text.ts`) — a mesma que a pessoa usa
 * digitando. Assim, o que ela acha digitando é o que o modelo acha
 * reconhecendo, sem um segundo ranqueamento para sair de sincronia. E o token do
 * usuário não precisa viajar para um serviço que não faria nada com ele.
 */

/** Um item candidato depois de passar pelo catálogo. */
export interface ItemReconhecido {
  /** Nome que o modelo deu. Fica visível para a pessoa poder discordar. */
  nomeReconhecido: string;
  /** `null` quando não houve correspondência na TACO — item livre. */
  foodId: number | null;
  /**
   * Nome do alimento do catálogo que casou. É **diferente** de
   * `nomeReconhecido` de propósito: "mandioca frita" casa com "Mandioca, frita",
   * e o nome da tabela carrega o preparo que decide o macro. Esconder qual
   * entrada foi escolhida transformaria um erro corrigível num macro errado
   * gravado em silêncio — e é por isso que a tela mostra os dois nomes.
   */
  nomeDoCatalogo: string | null;
  grams: number;
  /** Confiança auto-relatada pelo modelo. Serve para ordenar e para avisar. */
  confidence: number;
  /** `true` quando os macros vieram do modelo, não da TACO. */
  estimado: boolean;
  /** `null` quando nem a TACO nem o modelo souberam dizer. */
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface ReconhecimentoDaFoto {
  itens: ItemReconhecido[];
  /** Frase curta do modelo sobre a foto, ou `null`. */
  observacao: string | null;
}

/** Resposta do agente, antes do catálogo. Espelha `schemas/recognized_meal.py`. */
interface ItemDoAgente {
  name: string;
  grams: number;
  confidence: number;
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

interface RespostaDoAgente {
  items: ItemDoAgente[];
  note?: string | null;
}

/**
 * Teto da imagem **já decodificada**. Foto de celular reduzida para 1024 px de
 * lado dá algumas centenas de kB; 4 MB é folga para quem manda a original.
 */
export const MAX_FOTO_BYTES = 4 * 1024 * 1024;

/**
 * Visão em CPU local leva de 20 a 60 s, e o gemma local já passou de 100 s com
 * uma foto de 342×268. Um timeout curto aqui vira "a IA falhou" com a inferência
 * paga do mesmo jeito — o risco de timeout em cascata registrado na issue. O
 * cliente e o proxy reverso precisam acomodar este número, não o contrário.
 */
const TIMEOUT_PADRAO_MS = 180_000;

/** `/capabilities` não faz inferência: pode (e deve) desistir rápido. */
const TIMEOUT_DE_STATUS_MS = 3_000;

/**
 * Quantos candidatos pedir ao catálogo — o teto que `FoodService.search` aceita.
 *
 * Não é folga estética: a segunda condição de `melhorCorrespondencia` decide
 * pela **quantidade** de entradas que competem pelo nome, e uma lista cortada
 * cedo demais faria um nome ambíguo parecer único. Pedir o teto é o que mantém
 * a competição visível — a identidade mais populosa da TACO ("carne") tem 60
 * entradas e continua ambígua com folga mesmo truncada em 50.
 */
const LIMITE_DE_CANDIDATOS = 50;

/**
 * A **identidade** de um nome de catálogo: o segmento antes da primeira vírgula.
 *
 * Os nomes da TACO são `"<Alimento>, <qualificador>, <qualificador>"` — "Arroz,
 * integral, cozido", "Frango, coxa, com pele, assada". O primeiro segmento é o
 * alimento; o resto é preparo, corte ou variedade. Essa separação é o que
 * permite dizer que "maçã" não é "macaúba" sem manter uma lista de exceções.
 */
function identidadeDoCatalogo(nome: string): string {
  return normalizeSearchText(nome.split(',')[0] ?? '');
}

@Injectable()
export class MealRecognitionService {
  private readonly logger = new Logger(MealRecognitionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly foods: FoodService,
  ) {}

  /** `true` quando o app deve mostrar a entrada por foto. */
  async disponivel(): Promise<boolean> {
    const base = this.baseDoAgente();
    if (!base) return false;

    try {
      const resposta = await fetch(`${base}/capabilities`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_DE_STATUS_MS),
      });
      if (!resposta.ok) return false;
      const corpo: unknown = await resposta.json();
      // Não basta o agente estar no ar: sem `AI_MODEL_VISION` ele sobe saudável
      // e recusa toda inferência. Mostrar o botão nesse estado leva a pessoa a
      // tirar uma foto para receber um erro.
      const modelo = (corpo as { capabilities?: { vision?: unknown } })?.capabilities?.vision;
      return typeof modelo === 'string' && modelo.length > 0;
    } catch (erro) {
      this.logger.warn(`Agente de IA inacessível: ${(erro as Error).message}`);
      return false;
    }
  }

  /**
   * Foto → alimentos candidatos, já casados com a TACO quando houve
   * correspondência. **Não persiste nada.**
   */
  async reconhecer(userId: string, foto: Buffer): Promise<ReconhecimentoDaFoto> {
    if (foto.length === 0) {
      throw new BadRequestException('Nenhuma imagem foi enviada.');
    }
    if (foto.length > MAX_FOTO_BYTES) {
      throw new PayloadTooLargeException(
        `A foto tem ${foto.length} bytes e o limite é ${MAX_FOTO_BYTES}. Reduza a resolução.`,
      );
    }

    // Antes de qualquer coisa que saia daqui: metadados fora. Ver strip-exif.ts.
    let semMetadados: Buffer;
    try {
      semMetadados = removerMetadadosDoJpeg(foto);
    } catch (erro) {
      if (erro instanceof NaoEhJpegError) {
        throw new BadRequestException('A imagem precisa ser um JPEG.');
      }
      throw erro;
    }

    const resposta = await this.chamarAgente(semMetadados);
    return {
      itens: await this.casarComOCatalogo(userId, resposta.items),
      observacao: resposta.note ?? null,
    };
  }

  private baseDoAgente(): string | null {
    const bruto = this.config.get<string>('AGENT_BASE_URL', '').trim();
    return bruto ? bruto.replace(/\/+$/, '') : null;
  }

  private async chamarAgente(foto: Buffer): Promise<RespostaDoAgente> {
    const base = this.baseDoAgente();
    if (!base) {
      throw new ServiceUnavailableException(
        'O reconhecimento por foto não está configurado nesta instância. ' +
          'Registre a refeição manualmente — nada do produto depende de IA.',
      );
    }

    const chave = this.config.get<string>('AGENT_API_KEY', '').trim();
    const timeout = Number(this.config.get<string>('AGENT_TIMEOUT_MS', '')) || TIMEOUT_PADRAO_MS;

    let http: Response;
    try {
      http = await fetch(`${base}/recognize-meal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(chave ? { 'X-Fatia-Agent-Key': chave } : {}),
        },
        // Só a foto e o formato. **Nada do usuário viaja** — nem id, nem token,
        // nem o dia da refeição. Há teste fixando isso.
        body: JSON.stringify({
          image_base64: foto.toString('base64'),
          media_type: 'image/jpeg',
        }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (erro) {
      const causa = erro as Error;
      // Sem nada da foto na mensagem: ela vai para log.
      this.logger.warn(`Agente de IA falhou: ${causa.name}: ${causa.message}`);
      if (causa.name === 'TimeoutError' || causa.name === 'AbortError') {
        throw new GatewayTimeoutException(
          'O reconhecimento demorou demais. Tente de novo ou registre manualmente.',
        );
      }
      throw new ServiceUnavailableException(
        'O reconhecimento por foto está fora do ar. Registre manualmente — o caminho continua o mesmo.',
      );
    }

    if (!http.ok) throw await this.traduzirErroDoAgente(http);

    const corpo: unknown = await http.json().catch(() => null);
    const itens = (corpo as RespostaDoAgente | null)?.items;
    if (!Array.isArray(itens)) {
      throw new BadGatewayException('O reconhecimento devolveu uma resposta inesperada.');
    }
    return corpo as RespostaDoAgente;
  }

  /**
   * `code` do agente → exceção do Nest.
   *
   * A tradução é pelo **código**, nunca pela mensagem: o código é contrato
   * estável do `apps/agent`, a mensagem em prosa muda sem aviso.
   */
  private async traduzirErroDoAgente(http: Response): Promise<Error> {
    const corpo = (await http.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const code = corpo?.error?.code ?? '';
    this.logger.warn(`Agente de IA respondeu ${http.status} (${code || 'sem code'})`);

    const manual = 'Registre a refeição manualmente enquanto isso.';

    // 401/403 do agente é **erro de configuração**, e ele chega sem `code`
    // porque quem recusa é a camada de credencial, antes do handler. Caindo no
    // `default`, virava "o reconhecimento por foto falhou" — uma falha de
    // operação vestida de falha do modelo, que manda quem opera procurar no
    // lugar errado. Os dois lados precisam concordar sobre `AGENT_API_KEY`.
    if (http.status === 401 || http.status === 403) {
      return new ServiceUnavailableException(
        'O reconhecimento por foto está mal configurado nesta instância: a API não conseguiu ' +
          `se autenticar no agente de IA. ${manual}`,
      );
    }

    switch (code) {
      case 'AI_PROVIDER_NOT_CONFIGURED':
        return new ServiceUnavailableException(
          `O reconhecimento por foto não está configurado nesta instância. ${manual}`,
        );
      case 'AI_PROVIDER_TIMEOUT':
        return new GatewayTimeoutException(`O modelo não respondeu a tempo. ${manual}`);
      case 'AI_RESPONSE_UNPARSEABLE':
      case 'AI_RESPONSE_TRUNCATED':
        return new BadGatewayException(
          `Não consegui entender o que o modelo devolveu para esta foto. ${manual}`,
        );
      default:
        return new BadGatewayException(`O reconhecimento por foto falhou. ${manual}`);
    }
  }

  /**
   * Cada nome candidato vira um item de refeição, com `foodId` quando casa.
   *
   * **Casou: quem manda é a TACO.** O macro sai de `calcMacrosFromFood`, a mesma
   * regra do registro manual e do scanner. É isto que separa a funcionalidade de
   * um chute com aparência de precisão — a estimativa do modelo é descartada.
   */
  private async casarComOCatalogo(
    userId: string,
    itens: ItemDoAgente[],
  ): Promise<ItemReconhecido[]> {
    const casados: ItemReconhecido[] = [];

    for (const item of itens) {
      const alimento = await this.melhorCorrespondencia(userId, item.name);

      if (alimento) {
        const macros = calcMacrosFromFood(alimento, item.grams);
        casados.push({
          nomeReconhecido: item.name,
          foodId: alimento.id,
          nomeDoCatalogo: alimento.name,
          grams: item.grams,
          confidence: item.confidence,
          estimado: false,
          ...macros,
        });
        continue;
      }

      casados.push({
        nomeReconhecido: item.name,
        foodId: null,
        nomeDoCatalogo: null,
        grams: item.grams,
        confidence: item.confidence,
        estimado: true,
        // `?? null` e não `?? 0`: macro que o modelo não soube dizer some da UI
        // como campo a preencher. Virando zero, ele entraria na refeição como
        // "este alimento não tem caloria", que é indistinguível de um dado real.
        kcal: item.kcal ?? null,
        proteinG: item.protein_g ?? null,
        carbsG: item.carbs_g ?? null,
        fatG: item.fat_g ?? null,
      });
    }

    return casados;
  }

  /**
   * O alimento da TACO que o nome reconhecido **determina**, ou `null`.
   *
   * Determina, e não "mais se parece com". A regra anterior era um piso de
   * `MatchRank` e não protegia o que dizia proteger: como todo nome da TACO
   * começa pela identidade, um termo de uma palavra casa em `Prefix` com
   * qualquer entrada que **comece** por ele, e o desempate por nome mais curto
   * escolhia uma arbitrária. Contra o catálogo real isso dava "maçã" →
   * "Macaúba, crua" (525 kcal em 130 g no lugar de ~73), "sal" → "Salame",
   * "frango" → "Frango, fígado, cru" — todos com `estimado: false`, ou seja,
   * apresentados como confirmados pela tabela.
   *
   * Duas condições, as duas necessárias:
   *
   * 1. **Identidade.** O termo tem de cobrir o segmento antes da primeira
   *    vírgula, que é o alimento. "maçã" não cobre "macaúba"; "leite de coco"
   *    cobre o "leite" de "Leite, de coco" e "coco" não cobre.
   * 2. **Unicidade.** Se mais de uma entrada passa em (1), o nome não escolheu
   *    entre elas — e nós também não escolhemos. "arroz" vale igualmente para
   *    "Arroz, integral, cru" (360 kcal/100 g) e "Arroz, tipo 1, cozido" (128);
   *    chutar é exatamente o macro errado gravado sem sintoma. Vira item livre
   *    estimado, que a pessoa corrige em um toque e vê marcado na tela.
   */
  private async melhorCorrespondencia(userId: string, nome: string) {
    const termo = normalizeSearchText(nome);
    if (!termo) return null;

    // O `search` já filtra por dono (catálogo público + customs do usuário) e já
    // ranqueia. O que ele não faz — nem deve — é recusar: para quem digita, o
    // resultado mais ou menos parecido é útil, porque quem escolhe é a pessoa.
    // Aqui não há quem escolha, então a recusa é nossa.
    const candidatos = await this.foods.search(userId, {
      q: nome,
      limit: LIMITE_DE_CANDIDATOS,
    });

    const elegiveis = candidatos.filter((alimento) => {
      const identidade = identidadeDoCatalogo(alimento.name);
      return identidade === termo || termo.startsWith(`${identidade} `);
    });

    return elegiveis.length === 1 ? elegiveis[0] : null;
  }
}
