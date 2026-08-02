import { Injectable, Logger } from '@nestjs/common';
import { mapearProdutoDoOff, type ResultadoDoMapeamento } from './off-mapper';

/**
 * Consulta ao Open Food Facts por código de barras (issue #140, ADR 017).
 *
 * Três decisões estão embutidas aqui e valem mais que o código:
 *
 * 1. **Sob demanda, um código por vez.** Não é importação de base — a ADR 016
 *    recusou isso. O que sai daqui é um número de código de barras e nada mais.
 * 2. **Nada do usuário viaja.** Sem `Authorization`, sem cookie, sem id, sem
 *    corpo. O OFF é um terceiro e o produto trata dado de saúde; o que ele
 *    recebe é indistinguível de uma consulta anônima. Há teste fixando isso.
 * 3. **Falha do OFF nunca trava o registro de refeição.** Timeout curto, e
 *    qualquer problema vira `unavailable`, que a UI traduz em cadastro manual.
 */

const OFF_BASE_URL = 'https://world.openfoodfacts.org';

/**
 * O OFF pede User-Agent identificando a aplicação, e bloqueia quem usa o padrão
 * das bibliotecas HTTP. É a única coisa que identifica o Fatia na requisição —
 * o app, não a pessoa.
 */
const USER_AGENT = 'Fatia/0.1 (https://github.com/ThiagoCarreiraVallim/fatia)';

/**
 * Só os campos que o mapper lê. Pedir a ficha inteira traz dezenas de kB de
 * ingredientes, fotos e tags por produto, e todos seriam descartados.
 */
const CAMPOS = [
  'code',
  'product_name',
  'product_name_pt',
  'product_name_pt_br',
  'generic_name',
  'brands',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'nutrition_data_per',
  'nutriments',
].join(',');

/** O OFF é serviço comunitário e às vezes fica lento. Cinco segundos e desiste. */
const TIMEOUT_MS = 5_000;

/**
 * Cache em memória, com validade e teto.
 *
 * É paliativo declarado: o cache que a issue pede é em `Food`, e ele depende de
 * colunas que esta PR não pode criar (`schema.prisma` congelado — a proposta
 * está no corpo da PR). Enquanto isso, este Map evita que a câmera, que dispara
 * a leitura várias vezes por segundo, vire várias requisições ao OFF, e que
 * reabrir o mesmo produto pague a rede de novo.
 *
 * Não é fonte de verdade e morre com o processo — que é justamente o que o torna
 * inofensivo: não há dado velho sobrevivendo a um deploy.
 */
const TTL_MS = 6 * 60 * 60 * 1000;
/** Exportado para o teste da evicção não repetir o número e sair de sincronia. */
export const MAX_ENTRADAS = 500;

/** Aceita EAN-8, EAN-13, UPC-A e GTIN-14. Só dígitos. */
const CODIGO_VALIDO = /^\d{8,14}$/;

export interface AtribuicaoDoOff {
  source: 'Open Food Facts';
  license: 'ODbL 1.0';
  /** Página do produto na base de origem, exigida pela atribuição da ODbL. */
  url: string;
}

/**
 * A ODbL exige atribuição visível a quem usa o dado. Ela viaja **dentro da
 * resposta**, e não como constante da UI, porque assim a tela que mostra o
 * produto tem o crédito em mãos e não há como esquecer de exibi-lo.
 */
export function atribuicaoDoOff(barcode: string): AtribuicaoDoOff {
  return {
    source: 'Open Food Facts',
    license: 'ODbL 1.0',
    url: `${OFF_BASE_URL}/product/${barcode}`,
  };
}

export type ResultadoDaConsulta =
  | ResultadoDoMapeamento
  | { status: 'invalid_barcode' }
  | { status: 'not_found' }
  | { status: 'unavailable' };

interface Entrada {
  resultado: ResultadoDaConsulta;
  expiraEm: number;
}

@Injectable()
export class OffFoodService {
  private readonly logger = new Logger(OffFoodService.name);
  private readonly cache = new Map<string, Entrada>();

  async lookup(barcode: string): Promise<ResultadoDaConsulta> {
    // Validar antes de montar a URL não é só higiene de entrada: o código entra
    // no caminho da URL, e um valor com barra ou `..` mudaria o endpoint
    // chamado no serviço de terceiro.
    if (!CODIGO_VALIDO.test(barcode)) return { status: 'invalid_barcode' };

    const emCache = this.doCache(barcode);
    if (emCache) return emCache;

    const resultado = await this.consultarOff(barcode);
    // `unavailable` não entra no cache: é falha momentânea, e guardá-la faria a
    // próxima tentativa da pessoa falhar sem nem tentar.
    if (resultado.status !== 'unavailable') this.guardar(barcode, resultado);
    return resultado;
  }

  private async consultarOff(barcode: string): Promise<ResultadoDaConsulta> {
    const url = `${OFF_BASE_URL}/api/v2/product/${barcode}.json?fields=${CAMPOS}`;

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (erro) {
      // Sem o código de barras na mensagem: log não precisa saber o que a
      // pessoa escaneou (ver docs/DATA_RETENTION.md).
      this.logger.warn(`Open Food Facts inacessível: ${(erro as Error).message}`);
      return { status: 'unavailable' };
    }

    // 404 do OFF também é "produto não cadastrado lá", e o corpo vem com
    // `status: 0` — os dois caminhos levam ao mesmo lugar.
    if (resposta.status === 404) return { status: 'not_found' };
    if (!resposta.ok) {
      this.logger.warn(`Open Food Facts respondeu ${resposta.status}`);
      return { status: 'unavailable' };
    }

    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch {
      return { status: 'unavailable' };
    }

    const encontrado =
      typeof corpo === 'object' && corpo !== null && (corpo as { status?: unknown }).status === 1;
    if (!encontrado) return { status: 'not_found' };

    return mapearProdutoDoOff(corpo, barcode);
  }

  private doCache(barcode: string): ResultadoDaConsulta | null {
    const entrada = this.cache.get(barcode);
    if (!entrada) return null;
    if (entrada.expiraEm <= Date.now()) {
      this.cache.delete(barcode);
      return null;
    }
    return entrada.resultado;
  }

  private guardar(barcode: string, resultado: ResultadoDaConsulta): void {
    // Descarta a entrada mais antiga ao encher. `Map` preserva ordem de
    // inserção, então a primeira chave é a mais velha.
    if (this.cache.size >= MAX_ENTRADAS) {
      const maisAntiga = this.cache.keys().next().value;
      if (maisAntiga !== undefined) this.cache.delete(maisAntiga);
    }
    this.cache.set(barcode, { resultado, expiraEm: Date.now() + TTL_MS });
  }
}
