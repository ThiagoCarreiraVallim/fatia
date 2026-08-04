import type {
  BillingProvider,
  EntradaDeCliente,
  EntradaDeCobranca,
  ResultadoDeWebhook,
  StatusDaCobranca,
} from '../billing-provider.port';

/**
 * O provedor que os testes usam. **Nenhum teste do repositório toca a rede.**
 *
 * Vive em `__tests__/` de propósito: um fake exportado do código de produção é
 * um fake que alguém acaba injetando em produção.
 */
export class FakeBillingProvider implements BillingProvider {
  readonly clientes: EntradaDeCliente[] = [];
  readonly cobrancas: EntradaDeCobranca[] = [];
  private readonly status = new Map<string, { status: StatusDaCobranca; paidAt?: Date }>();

  constructor(private readonly webhookToken = 'token-de-teste') {}

  async ensureCustomer(entrada: EntradaDeCliente): Promise<{ providerCustomerId: string }> {
    this.clientes.push(entrada);
    return { providerCustomerId: `cus_${entrada.groupId}` };
  }

  async createCharge(
    entrada: EntradaDeCobranca,
  ): Promise<{ providerChargeId: string; url?: string }> {
    this.cobrancas.push(entrada);
    const providerChargeId = `pay_${entrada.externalReference}`;
    this.status.set(providerChargeId, { status: 'PENDING' });
    return { providerChargeId, url: `https://sandbox.example/${providerChargeId}` };
  }

  async getCharge(providerChargeId: string): Promise<{ status: StatusDaCobranca; paidAt?: Date }> {
    return this.status.get(providerChargeId) ?? { status: 'UNKNOWN' };
  }

  /** Simula o provedor confirmando o pagamento, sem HTTP. */
  marcarPago(providerChargeId: string, paidAt: Date): void {
    this.status.set(providerChargeId, { status: 'PAID', paidAt });
  }

  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): ResultadoDeWebhook {
    if (headers['asaas-access-token'] !== this.webhookToken) {
      return { ok: false, motivo: 'token_invalido' };
    }

    try {
      const evento = JSON.parse(rawBody) as {
        id?: string;
        event?: string;
        payment?: { id?: string; status?: StatusDaCobranca };
      };
      if (!evento.id || !evento.payment?.id) return { ok: false, motivo: 'payload_invalido' };

      return {
        ok: true,
        eventId: evento.id,
        chargeId: evento.payment.id,
        status: evento.payment.status ?? 'UNKNOWN',
        event: evento.event ?? 'UNKNOWN',
      };
    } catch {
      return { ok: false, motivo: 'payload_invalido' };
    }
  }
}
