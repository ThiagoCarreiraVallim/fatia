import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import type { AgentRecognizedItem } from '../ai/agent.adapter';
import { HostedAiService } from '../ai/hosted-ai.service';
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
 * Plano, cota, a chamada ao agente e o custo no livro-caixa são do
 * `HostedAiService` (`ai/`), o mesmo do chat e do ditado.
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

/**
 * Teto da imagem **já decodificada**. Foto de celular reduzida para 1024 px de
 * lado dá algumas centenas de kB; 4 MB é folga para quem manda a original.
 */
export const MAX_FOTO_BYTES = 4 * 1024 * 1024;

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
  constructor(
    private readonly foods: FoodService,
    private readonly hostedAi: HostedAiService,
  ) {}

  /** `true` quando o app deve mostrar a entrada por foto. */
  async isAvailable(): Promise<boolean> {
    return this.hostedAi.configured() && (await this.hostedAi.capabilities()).vision;
  }

  /**
   * Foto → alimentos candidatos, já casados com a TACO quando houve
   * correspondência. **Não persiste nada.**
   */
  async recognize(userId: string, photo: Buffer): Promise<ReconhecimentoDaFoto> {
    if (photo.length === 0) {
      throw new BadRequestException('Nenhuma imagem foi enviada.');
    }
    if (photo.length > MAX_FOTO_BYTES) {
      throw new PayloadTooLargeException(
        `A foto tem ${photo.length} bytes e o limite é ${MAX_FOTO_BYTES}. Reduza a resolução.`,
      );
    }

    // Antes de qualquer coisa que saia daqui: metadados fora. Ver strip-exif.ts.
    let withoutMetadata: Buffer;
    try {
      withoutMetadata = removerMetadadosDoJpeg(photo);
    } catch (erro) {
      if (erro instanceof NaoEhJpegError) {
        throw new BadRequestException('A imagem precisa ser um JPEG.');
      }
      throw erro;
    }

    // Plano e cota antes do agente (ADR 024), e o custo depois: Free recebe 402
    // e nada sai daqui.
    const { items, note } = await this.hostedAi.recognizeMeal(userId, withoutMetadata);
    return {
      itens: await this.casarComOCatalogo(userId, items),
      observacao: note,
    };
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
    itens: AgentRecognizedItem[],
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
