import { AsaasError, AsaasProvider } from '../asaas/asaas.provider';

const CHAVE = '$aact_chave_de_teste_que_nao_existe';
const TOKEN_DE_WEBHOOK = 'segredo-do-painel';

const provider = () =>
  new AsaasProvider({
    baseUrl: 'https://api-sandbox.asaas.example/x',
    apiKey: CHAVE,
    webhookToken: TOKEN_DE_WEBHOOK,
  });

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;

/** Resposta fingida do provedor. Nenhum teste deste arquivo abre socket. */
const responde = (status: number, corpo: unknown): FetchMock =>
  jest.fn(async (_url: string, _init: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(corpo), { status })),
  );

const corpoEnviado = (mock: FetchMock): Record<string, unknown> =>
  JSON.parse(mock.mock.calls[0][1].body as string) as Record<string, unknown>;

const headersEnviados = (mock: FetchMock): Record<string, string> =>
  mock.mock.calls[0][1].headers as Record<string, string>;

describe('AsaasProvider', () => {
  const fetchOriginal = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it('recusa nascer do ambiente em NODE_ENV=test', () => {
    // A chave só entraria pelo ambiente. Com esta guarda, um teste que aponte
    // para o Asaas de verdade falha na primeira execução dizendo o que fazer —
    // em vez de aparecer como cobrança criada por engano.
    expect(() => AsaasProvider.fromEnv({ NODE_ENV: 'test' })).toThrow(/proibido em NODE_ENV=test/);
  });

  it('exige as três variáveis para nascer do ambiente', () => {
    expect(() =>
      AsaasProvider.fromEnv({ NODE_ENV: 'production', ASAAS_BASE_URL: 'https://x' }),
    ).toThrow(/ASAAS_BASE_URL, ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN/);
  });

  describe('createCharge', () => {
    it('manda centavo como real e vencimento no dia local do provedor', async () => {
      const fetchMock = responde(200, { id: 'pay_1', invoiceUrl: 'https://pay/1' });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const resultado = await provider().createCharge({
        providerCustomerId: 'cus_1',
        amountCents: 12345,
        // 11/08 às 02h UTC é ainda 10/08 às 23h no Brasil. Formatar em UTC
        // adiantaria o vencimento em um dia — e o dia do vencimento é o que
        // decide juro, multa e o `PAYMENT_OVERDUE` que degrada a academia.
        dueAt: new Date('2026-08-11T02:00:00Z'),
        description: 'Fatia — julho/2026 — 42 alunos ativos',
        externalReference: 'fatura-abc',
      });

      const corpo = corpoEnviado(fetchMock);
      expect(corpo.value).toBe(123.45);
      expect(corpo.dueDate).toBe('2026-08-10');
      expect(corpo.customer).toBe('cus_1');
      expect(corpo.externalReference).toBe('fatura-abc');
      expect(corpo.billingType).toBe('UNDEFINED');
      expect(fetchMock.mock.calls[0][0]).toBe('https://api-sandbox.asaas.example/x/v3/payments');
      expect(resultado).toEqual({ providerChargeId: 'pay_1', url: 'https://pay/1' });
    });

    it('autentica no header que o Asaas lê', async () => {
      const fetchMock = responde(200, { id: 'pay_1' });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await provider().createCharge({
        providerCustomerId: 'cus_1',
        amountCents: 100,
        dueAt: new Date('2026-08-10T12:00:00Z'),
        description: 'x',
        externalReference: 'fatura-abc',
      });

      // Conferido contra o sandbox: com outro nome de header a API devolve 401
      // sem sequer olhar o valor.
      expect(headersEnviados(fetchMock).access_token).toBe(CHAVE);
    });
  });

  it('cria o cliente com o grupo como referência externa', async () => {
    const fetchMock = responde(200, { id: 'cus_9' });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const resultado = await provider().ensureCustomer({
      groupId: 'grupo-1',
      name: 'Academia X',
      taxId: '12345678000199',
      email: 'financeiro@academia.example',
    });

    expect(corpoEnviado(fetchMock)).toEqual({
      name: 'Academia X',
      cpfCnpj: '12345678000199',
      email: 'financeiro@academia.example',
      externalReference: 'grupo-1',
    });
    expect(resultado.providerCustomerId).toBe('cus_9');
  });

  describe('erro do provedor', () => {
    it('traduz o envelope de erro sem carregar o segredo junto', async () => {
      // Este corpo é o que o sandbox devolveu de fato para uma chave inválida.
      const fetchMock = responde(401, {
        errors: [
          {
            code: 'invalid_access_token_format',
            description: 'O valor fornecido não parece ser uma chave de API válida do Asaas.',
          },
        ],
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const erro = await provider()
        .getCharge('pay_1')
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(AsaasError);
      const asaas = erro as AsaasError;
      expect(asaas.status).toBe(401);
      expect(asaas.code).toBe('invalid_access_token_format');
      // Chave de pagamento não vaza pela mensagem de erro — que é o texto que
      // vai parar no log e no relatório de exceção.
      expect(asaas.message).not.toContain(CHAVE);
    });

    it('não engole corpo que não é JSON', async () => {
      globalThis.fetch = jest.fn(
        async () => new Response('<html>502</html>', { status: 200 }),
      ) as unknown as typeof fetch;

      await expect(provider().getCharge('pay_1')).rejects.toBeInstanceOf(AsaasError);
    });
  });

  describe('getCharge', () => {
    it.each([
      ['RECEIVED', 'PAID'],
      ['CONFIRMED', 'PAID'],
      ['RECEIVED_IN_CASH', 'PAID'],
      ['PENDING', 'PENDING'],
      ['OVERDUE', 'OVERDUE'],
      ['REFUNDED', 'VOID'],
      ['CHARGEBACK_REQUESTED', 'VOID'],
      ['STATUS_QUE_AINDA_NAO_EXISTE', 'UNKNOWN'],
      [undefined, 'UNKNOWN'],
    ])('traduz %s para %s', async (bruto, esperado) => {
      globalThis.fetch = responde(200, {
        id: 'pay_1',
        status: bruto,
      }) as unknown as typeof fetch;

      expect((await provider().getCharge('pay_1')).status).toBe(esperado);
    });

    it('converte a data de pagamento para meia-noite no fuso do provedor', async () => {
      globalThis.fetch = responde(200, {
        id: 'pay_1',
        status: 'RECEIVED',
        paymentDate: '2026-08-10',
      }) as unknown as typeof fetch;

      const cobranca = await provider().getCharge('pay_1');

      expect(cobranca.paidAt?.toISOString()).toBe('2026-08-10T03:00:00.000Z');
    });
  });

  describe('verifyWebhook', () => {
    const evento = JSON.stringify({
      id: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_1', status: 'RECEIVED' },
    });

    it('aceita o evento com o token do painel', () => {
      expect(provider().verifyWebhook({ 'asaas-access-token': TOKEN_DE_WEBHOOK }, evento)).toEqual({
        ok: true,
        eventId: 'evt_1',
        chargeId: 'pay_1',
        status: 'PAID',
        event: 'PAYMENT_RECEIVED',
      });
    });

    it('aceita o header em qualquer caixa', () => {
      // O Express entrega minúsculo, mas o painel do provedor e a documentação
      // escrevem misto — e um mock com a grafia da doc passaria verde sobre um
      // caminho que erraria em produção.
      const resultado = provider().verifyWebhook(
        { 'Asaas-Access-Token': TOKEN_DE_WEBHOOK },
        evento,
      );

      expect(resultado.ok).toBe(true);
    });

    it('recusa token errado, ausente ou de tamanho diferente', () => {
      for (const headers of [
        { 'asaas-access-token': 'errado' },
        { 'asaas-access-token': `${TOKEN_DE_WEBHOOK}x` },
        { 'asaas-access-token': undefined },
        {},
      ]) {
        expect(provider().verifyWebhook(headers, evento)).toEqual({
          ok: false,
          motivo: 'token_invalido',
        });
      }
    });

    it('recusa corpo que não é JSON ou que não identifica a cobrança', () => {
      const ok = { 'asaas-access-token': TOKEN_DE_WEBHOOK };

      expect(provider().verifyWebhook(ok, 'nao é json')).toEqual({
        ok: false,
        motivo: 'payload_invalido',
      });
      expect(provider().verifyWebhook(ok, JSON.stringify({ event: 'PAYMENT_RECEIVED' }))).toEqual({
        ok: false,
        motivo: 'payload_invalido',
      });
      // Sem `id` de evento não há como ser idempotente na reentrega.
      expect(provider().verifyWebhook(ok, JSON.stringify({ payment: { id: 'pay_1' } }))).toEqual({
        ok: false,
        motivo: 'payload_invalido',
      });
    });

    it('aceita status desconhecido como UNKNOWN, sem explodir e sem virar pago', () => {
      // O Asaas reentrega por design: transformar status novo em 500 criaria
      // laço de reentrega, e traduzi-lo para "pago" seria inventar dinheiro.
      const resultado = provider().verifyWebhook(
        { 'asaas-access-token': TOKEN_DE_WEBHOOK },
        JSON.stringify({
          id: 'evt_2',
          event: 'PAYMENT_ALGO_NOVO',
          payment: { id: 'p', status: 'X' },
        }),
      );

      expect(resultado).toMatchObject({ ok: true, status: 'UNKNOWN', event: 'PAYMENT_ALGO_NOVO' });
    });

    it('não toca a rede para verificar webhook', () => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      provider().verifyWebhook({ 'asaas-access-token': TOKEN_DE_WEBHOOK }, evento);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
