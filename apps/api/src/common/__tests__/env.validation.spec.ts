import { randomBytes } from 'node:crypto';
import { AppEnvSchema } from '../env.validation';

/**
 * Configuração de IA hospedada, validada no boot (issue #135).
 *
 * `AI_PRICE_TABLE` é JSON escrito à mão numa variável de ambiente, normalmente pelo painel do
 * Dokploy. Errar é fácil e o erro é mudo: sem validação no boot, o `JSON.parse` só aconteceria na
 * primeira chamada de IA — em produção, no meio da requisição de um usuário, longe de quem editou.
 */

// O mínimo que o schema exige hoje. Só as chaves de IA variam nos casos abaixo.
const BASE = {
  DATABASE_URL: 'postgresql://fatia:fatia@localhost:5432/fatia',
  LOGTO_ENDPOINT: 'http://localhost:3001',
  LOGTO_AUDIENCE: 'https://api.fatia.local',
  LOGTO_MCP_APP_ID: 'app',
  LOGTO_MCP_APP_SECRET: 'secret',
};

describe('AppEnvSchema — IA hospedada', () => {
  it('instância sem IA sobe sem preencher nada', () => {
    // É como o produto funciona hoje, e como uma instância auto-hospedada com modelo local vai
    // continuar funcionando. Nenhuma variável de IA pode ser obrigatória.
    const env = AppEnvSchema.parse(BASE);

    expect(env.AI_PRICE_TABLE).toEqual({});
    expect(env.AI_QUOTA_DAILY_MICROS).toBe(0);
    expect(env.AI_QUOTA_GLOBAL_DAILY_MICROS).toBe(0);
  });

  it('entrega a tabela já convertida, não a string', () => {
    // Se o schema devolvesse a string, cada consumidor faria o próprio `JSON.parse` — e o boot
    // teria validado uma coisa que ninguém usa.
    const env = AppEnvSchema.parse({
      ...BASE,
      AI_PRICE_TABLE: '{"gateway/m":{"in":3000000,"out":15000000}}',
    });

    expect(env.AI_PRICE_TABLE).toEqual({ 'gateway/m': { in: 3_000_000, out: 15_000_000 } });
  });

  it.each([
    ['JSON quebrado', '{"m":{"in":1,"out":2},}'],
    ['preço faltando "out"', '{"m":{"in":1}}'],
    ['preço fracionário', '{"m":{"in":1.5,"out":2}}'],
  ])('%s derruba o boot, com a mensagem do parser', (_caso, tabela) => {
    expect(() => AppEnvSchema.parse({ ...BASE, AI_PRICE_TABLE: tabela })).toThrow(/AI_PRICE_TABLE/);
  });

  it.each([
    ['negativo', '-1'],
    ['fracionário', '1.5'],
    ['texto', 'muito'],
  ])('teto diário %s não é aceito', (_caso, valor) => {
    // `z.coerce.number()` transforma "muito" em NaN silenciosamente sem o `.int()`; um teto NaN
    // nunca estoura, ou seja, a cota existiria no código e não no comportamento.
    expect(() => AppEnvSchema.parse({ ...BASE, AI_QUOTA_DAILY_MICROS: valor })).toThrow();
  });

  it('teto diário válido chega como número', () => {
    const env = AppEnvSchema.parse({ ...BASE, AI_QUOTA_DAILY_MICROS: '250000' });
    expect(env.AI_QUOTA_DAILY_MICROS).toBe(250_000);
  });

  it('a tolerância de chamadas sem preço nasce diferente de zero', () => {
    // Aqui o default **não** pode ser `0`, ao contrário dos dois tetos de dinheiro: `0` significa
    // "nenhuma tolerância", e uma instância que só preencheu os tetos perderia a IA na primeira
    // chamada de um modelo ainda não precificado, sem nunca ter pedido isso.
    expect(AppEnvSchema.parse(BASE).AI_QUOTA_UNPRICED_DAILY_CALLS).toBe(20);
    expect(
      AppEnvSchema.parse({ ...BASE, AI_QUOTA_UNPRICED_DAILY_CALLS: '0' })
        .AI_QUOTA_UNPRICED_DAILY_CALLS,
    ).toBe(0);
  });

  it.each([
    ['negativo', '-1'],
    ['fracionário', '2.5'],
    ['texto', 'algumas'],
  ])('tolerância %s não é aceita', (_caso, valor) => {
    // Mesma armadilha do teto: sem `.int()`, "algumas" viraria `NaN`, e `n >= NaN` é sempre
    // falso — a guarda existiria no código e não no comportamento.
    expect(() => AppEnvSchema.parse({ ...BASE, AI_QUOTA_UNPRICED_DAILY_CALLS: valor })).toThrow();
  });
});

describe('AppEnvSchema — cobrança (#158)', () => {
  it('instância que não cobra ninguém sobe sem preencher nada', () => {
    // É como a instância pública roda hoje. Tornar qualquer variável de cobrança
    // obrigatória impediria de subir quem nunca vai cobrar nada — o self-host
    // roda com AI_REQUIRES_PLAN=false e a IA liberada (ADR 024).
    const env = AppEnvSchema.parse(BASE);

    expect(env.ASAAS_BASE_URL).toBeUndefined();
    expect(env.ASAAS_API_KEY).toBeUndefined();
    expect(env.ASAAS_WEBHOOK_TOKEN).toBeUndefined();
  });

  it('aceita as três variáveis quando a cobrança é ligada', () => {
    const env = AppEnvSchema.parse({
      ...BASE,
      ASAAS_BASE_URL: 'https://api-sandbox.asaas.com',
      ASAAS_API_KEY: '$aact_exemplo',
      ASAAS_WEBHOOK_TOKEN: 'segredo',
    });

    expect(env.ASAAS_BASE_URL).toBe('https://api-sandbox.asaas.com');
  });

  it('derruba o boot se a base do provedor não for URL', () => {
    // Uma base torta só apareceria no fechamento do ciclo, uma vez por mês, com
    // a fatura já calculada e nenhuma cobrança criada.
    expect(() => AppEnvSchema.parse({ ...BASE, ASAAS_BASE_URL: 'api.asaas.com' })).toThrow();
  });
});

describe('AppEnvSchema — plano Free/PRO (ADR 024)', () => {
  it('sem nada preenchido, a IA não exige plano e o preço é o padrão', () => {
    const env = AppEnvSchema.parse(BASE);
    expect(env.AI_REQUIRES_PLAN).toBe(false);
    expect(env.BILLING_PRO_MONTHLY_CENTS).toBe(1990);
    expect(env.BILLING_PRO_YEARLY_CENTS).toBe(17900);
    expect(env.BILLING_SEAT_MONTHLY_CENTS).toBe(1490);
    expect(env.REVENUECAT_ENTITLEMENT_ID).toBe('pro');
  });

  it('`AI_REQUIRES_PLAN` aceita true/1 e recusa o que não é booleano', () => {
    expect(AppEnvSchema.parse({ ...BASE, AI_REQUIRES_PLAN: 'true' }).AI_REQUIRES_PLAN).toBe(true);
    expect(AppEnvSchema.parse({ ...BASE, AI_REQUIRES_PLAN: '1' }).AI_REQUIRES_PLAN).toBe(true);
    expect(AppEnvSchema.parse({ ...BASE, AI_REQUIRES_PLAN: 'false' }).AI_REQUIRES_PLAN).toBe(false);
    // "yes" ligaria ou desligaria? Melhor o boot recusar do que adivinhar.
    expect(() => AppEnvSchema.parse({ ...BASE, AI_REQUIRES_PLAN: 'yes' })).toThrow();
  });
});

describe('AppEnvSchema — segredo do descadastro (#398)', () => {
  const PROD = { ...BASE, NODE_ENV: 'production' };

  it('vazio desliga o e-mail de comunicado e sobe', () => {
    expect(
      AppEnvSchema.parse({ ...PROD, EMAIL_UNSUBSCRIBE_SECRET: '' }).EMAIL_UNSUBSCRIBE_SECRET,
    ).toBe('');
  });

  it.each([
    ['o placeholder do .env.example', 'troque-por-um-segredo-de-32-caracteres'],
    ['o placeholder de produção', 'CHANGE_ME_openssl_rand_hex_32'],
    ['curto', 'a1b2c3d4e5f6a7b8c9d0'],
    ['frase longa de baixa entropia', 'minha senha secreta do fatia que é bem comprida'],
    ['hex repetido', '3f'.repeat(32)],
  ])('em produção, %s derruba o boot', (_caso, segredo) => {
    expect(() => AppEnvSchema.parse({ ...PROD, EMAIL_UNSUBSCRIBE_SECRET: segredo })).toThrow(
      /EMAIL_UNSUBSCRIBE_SECRET/,
    );
  });

  it.each([
    [
      'hex de 32 bytes (openssl rand -hex 32)',
      'a0e5a77089216e0609d9d000b56d62bbabba1b39cbbeeea2e35966652063219b',
    ],
    [
      'base64 de 32 bytes (openssl rand -base64 32)',
      'tufqZX2NdseMLLdfJcvdhuo18zDvgGL3PuMqxwgtI8I=',
    ],
  ])('em produção, %s sobe', (_caso, segredo) => {
    expect(
      AppEnvSchema.parse({ ...PROD, EMAIL_UNSUBSCRIBE_SECRET: segredo }).EMAIL_UNSUBSCRIBE_SECRET,
    ).toBe(segredo);
  });

  it('fora de produção o segredo de teste continua valendo', () => {
    expect(() =>
      AppEnvSchema.parse({ ...BASE, EMAIL_UNSUBSCRIBE_SECRET: 'segredo-de-teste-1234567890' }),
    ).not.toThrow();
  });
});

describe('AppEnvSchema — segredo do link de convite (#401)', () => {
  const PROD = { ...BASE, NODE_ENV: 'production' };

  it('vazio sobe: o link só aparece na criação, como antes', () => {
    expect(AppEnvSchema.parse({ ...PROD, INVITE_LINK_SECRET: '' }).INVITE_LINK_SECRET).toBe('');
  });

  it('em produção, um segredo curto derruba o boot', () => {
    expect(() => AppEnvSchema.parse({ ...PROD, INVITE_LINK_SECRET: 'curto-demais' })).toThrow(
      /INVITE_LINK_SECRET precisa de pelo menos 32 bytes/,
    );
  });

  it('o placeholder derruba pelo texto de exemplo, mesmo com tamanho e variedade de sobra', () => {
    // 56 caracteres base64url, mais de 16 distintos: só a regra do placeholder pega.
    const placeholder = 'CHANGE_ME_openssl_rand_hex_32_abcdefghijklmnopqrstuvwxyz';
    expect(placeholder.length).toBeGreaterThanOrEqual(43);
    expect(() => AppEnvSchema.parse({ ...PROD, INVITE_LINK_SECRET: placeholder })).toThrow(
      /INVITE_LINK_SECRET é o valor de exemplo/,
    );
  });

  it('um bloco aleatório repetido não conta como 32 bytes', () => {
    const metade = randomBytes(16).toString('hex');
    expect(() => AppEnvSchema.parse({ ...PROD, INVITE_LINK_SECRET: metade + metade })).toThrow(
      /INVITE_LINK_SECRET/,
    );
    const quarto = randomBytes(8).toString('hex');
    expect(() =>
      AppEnvSchema.parse({ ...PROD, EMAIL_UNSUBSCRIBE_SECRET: quarto.repeat(4) }),
    ).toThrow(/EMAIL_UNSUBSCRIBE_SECRET/);
  });

  it('o segredo do convite não pode ser o mesmo do descadastro', () => {
    const segredo = randomBytes(32).toString('hex');
    expect(() =>
      AppEnvSchema.parse({
        ...PROD,
        INVITE_LINK_SECRET: segredo,
        EMAIL_UNSUBSCRIBE_SECRET: segredo,
      }),
    ).toThrow(/INVITE_LINK_SECRET/);
  });

  it('em produção, 32 bytes aleatórios sobem', () => {
    const segredo = randomBytes(32).toString('hex');
    expect(AppEnvSchema.parse({ ...PROD, INVITE_LINK_SECRET: segredo }).INVITE_LINK_SECRET).toBe(
      segredo,
    );
  });
});
