import { createHash, timingSafeEqual } from 'node:crypto';
import { dateInTz, dayBoundsInTz } from '../../progress/helpers/date-tz';
import type {
  BillingProvider,
  EntradaDeCliente,
  EntradaDeCobranca,
  ResultadoDeWebhook,
  StatusDaCobranca,
} from '../billing-provider.port';
import {
  traduzStatus,
  type AsaasBillingType,
  type AsaasCliente,
  type AsaasCobranca,
  type AsaasErro,
  type AsaasEventoDeWebhook,
} from './asaas.types';

/**
 * O único arquivo do repositório que sabe que o provedor se chama Asaas (#158).
 *
 * **Sem dependência nova.** `fetch` é global no Node 24 (o `engines` do
 * monorepo), e `undici`/`axios` entrariam para fazer o que a plataforma já faz —
 * com o custo de mais uma biblioteca no caminho de um segredo de pagamento.
 *
 * Sem `@Injectable`: enquanto não existe controller de cobrança (depende da
 * persistência, que esta fatia não entrega), registrar o provider no módulo
 * faria o Nest construí-lo em todo boot, inclusive no de teste — e a construção
 * a partir do ambiente é justamente o que recusa rodar em teste.
 */

/** Fuso da conta no provedor. O Asaas é brasileiro e datas dele são locais. */
const FUSO_DO_PROVEDOR = 'America/Sao_Paulo';

/** Teto de uma chamada. Cobrança é job mensal: melhor falhar do que pendurar. */
const TIMEOUT_PADRAO_MS = 20_000;

export interface ConfiguracaoAsaas {
  baseUrl: string;
  apiKey: string;
  /** Segredo configurado no painel do Asaas e devolvido no header do webhook. */
  webhookToken: string;
  timeoutMs?: number;
}

/**
 * Falha vinda do provedor, já sem o segredo.
 *
 * A mensagem carrega `code` e `description` do Asaas — que são úteis — e nunca a
 * chave, nem os headers: um `JSON.stringify(request)` num log de erro é como
 * chave de produção vaza sem ninguém escrever "console.log(apiKey)".
 */
export class AsaasError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    descricao: string,
  ) {
    super(`Asaas ${status} ${code}: ${descricao}`);
    this.name = 'AsaasError';
  }
}

export class AsaasProvider implements BillingProvider {
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfiguracaoAsaas) {
    if (!config.baseUrl || !config.apiKey || !config.webhookToken) {
      throw new Error('AsaasProvider exige baseUrl, apiKey e webhookToken');
    }
    this.timeoutMs = config.timeoutMs ?? TIMEOUT_PADRAO_MS;
  }

  /**
   * Constrói a partir do ambiente — e **recusa em `NODE_ENV=test`**.
   *
   * É aqui que a recusa mora, e não no construtor, porque é aqui que uma chave
   * de verdade entraria. Um teste que apontasse para o Asaas real precisaria da
   * chave no CI; com esta guarda, ele falha na primeira execução com uma
   * mensagem que diz o que fazer, em vez de aparecer como cobrança de sandbox
   * criada por engano — ou, pior, de produção.
   *
   * O construtor continua público e testável: o spec o chama com valores
   * explícitos e `fetch` fingido, sem que nenhum segredo real exista.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): AsaasProvider {
    if (env.NODE_ENV === 'test') {
      throw new Error(
        'AsaasProvider.fromEnv é proibido em NODE_ENV=test — use o FakeBillingProvider',
      );
    }

    const { ASAAS_BASE_URL, ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN } = env;
    if (!ASAAS_BASE_URL || !ASAAS_API_KEY || !ASAAS_WEBHOOK_TOKEN) {
      throw new Error(
        'Cobrança exige ASAAS_BASE_URL, ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no ambiente',
      );
    }

    return new AsaasProvider({
      baseUrl: ASAAS_BASE_URL,
      apiKey: ASAAS_API_KEY,
      webhookToken: ASAAS_WEBHOOK_TOKEN,
    });
  }

  async ensureCustomer(entrada: EntradaDeCliente): Promise<{ providerCustomerId: string }> {
    const cliente = await this.request<AsaasCliente>('POST', '/v3/customers', {
      name: entrada.name,
      cpfCnpj: entrada.taxId,
      email: entrada.email,
      externalReference: entrada.groupId,
    });

    return { providerCustomerId: cliente.id };
  }

  async createCharge(
    entrada: EntradaDeCobranca,
  ): Promise<{ providerChargeId: string; url?: string }> {
    // `UNDEFINED` deixa a academia escolher entre boleto, Pix e cartão na página
    // de pagamento. Fixar `BOLETO` aqui seria decidir pelo cliente, e a decisão
    // de meio de pagamento é do dono — que é quem paga a taxa.
    const billingType: AsaasBillingType = 'UNDEFINED';

    const cobranca = await this.request<AsaasCobranca>('POST', '/v3/payments', {
      customer: entrada.providerCustomerId,
      billingType,
      // O Asaas recebe reais decimais; o resto do sistema só conhece centavo
      // inteiro. A conversão acontece nesta linha e em nenhuma outra.
      value: Number((entrada.amountCents / 100).toFixed(2)),
      dueDate: dateInTz(entrada.dueAt, FUSO_DO_PROVEDOR),
      description: entrada.description,
      externalReference: entrada.externalReference,
    });

    return { providerChargeId: cobranca.id, url: cobranca.invoiceUrl };
  }

  async getCharge(providerChargeId: string): Promise<{ status: StatusDaCobranca; paidAt?: Date }> {
    const cobranca = await this.request<AsaasCobranca>(
      'GET',
      `/v3/payments/${encodeURIComponent(providerChargeId)}`,
    );

    return {
      status: traduzStatus(cobranca.status),
      paidAt: dataDoProvedor(cobranca.paymentDate ?? cobranca.confirmedDate),
    };
  }

  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): ResultadoDeWebhook {
    // Os headers chegam do Express em minúsculas, mas normalizar é barato e
    // impede que um mock com a grafia da documentação (`asaas-access-token` vs
    // `Asaas-Access-Token`) passe verde sobre um caminho que erraria em produção.
    const recebido = Object.entries(headers).find(
      ([nome]) => nome.toLowerCase() === 'asaas-access-token',
    )?.[1];

    if (!segredoConfere(recebido, this.config.webhookToken)) {
      return { ok: false, motivo: 'token_invalido' };
    }

    let evento: AsaasEventoDeWebhook;
    try {
      evento = JSON.parse(rawBody) as AsaasEventoDeWebhook;
    } catch {
      return { ok: false, motivo: 'payload_invalido' };
    }

    // Sem id de evento não há idempotência possível, e sem id de cobrança não há
    // o que atualizar. Os dois são obrigatórios para aceitar.
    if (!evento?.id || !evento.payment?.id) return { ok: false, motivo: 'payload_invalido' };

    return {
      ok: true,
      eventId: evento.id,
      chargeId: evento.payment.id,
      status: traduzStatus(evento.payment.status),
      event: evento.event ?? 'UNKNOWN',
    };
  }

  private async request<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T> {
    const resposta = await fetch(`${this.config.baseUrl}${caminho}`, {
      method: metodo,
      headers: {
        // Confirmado contra o sandbox: com outro nome de header a API responde
        // 401 sem sequer olhar o valor.
        access_token: this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const texto = await resposta.text();

    if (!resposta.ok) {
      const erro = parseJson<AsaasErro>(texto)?.errors?.[0];
      throw new AsaasError(
        resposta.status,
        erro?.code ?? 'sem_codigo',
        erro?.description ?? 'sem descrição',
      );
    }

    const dados = parseJson<T>(texto);
    if (dados === null) {
      throw new AsaasError(resposta.status, 'resposta_invalida', 'corpo não é JSON');
    }

    return dados;
  }
}

function parseJson<T>(texto: string): T | null {
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

/**
 * Comparação de segredo em tempo constante.
 *
 * O `sha256` antes do `timingSafeEqual` não é paranoia: `timingSafeEqual` lança
 * quando os buffers têm tamanhos diferentes, e um `try/catch` em volta faria o
 * tamanho do token vazar pelo tempo de resposta. Comparar digests iguala o
 * tamanho e resolve os dois problemas de uma vez.
 */
function segredoConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** `YYYY-MM-DD` do provedor vira meia-noite no fuso dele. */
function dataDoProvedor(ymd: string | undefined): Date | undefined {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  return dayBoundsInTz(ymd, FUSO_DO_PROVEDOR).start;
}
