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
});
