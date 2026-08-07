import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma.service';
import { AiQuotaExceededException } from '../ai-quota';
import { AiUsageService } from '../ai-usage.service';

/**
 * A metade com banco da cota da #135 (#249).
 *
 * A decisão em si já tem teste próprio em `ai-quota.spec.ts` e é pura. O que
 * falta cobrir — e é onde dá para errar em silêncio — é o que este serviço
 * **pergunta ao banco** e o que ele **grava**: uma janela errada, um `where` com
 * `userId` a mais ou a menos, ou um custo não medido gravado como zero fazem a
 * cota continuar respondendo "pode" para sempre, sem erro nenhum à vista.
 */

const AGORA = new Date('2026-08-06T15:30:00.000Z');
const INICIO_DA_JANELA = new Date('2026-08-06T00:00:00.000Z');

const TABELA = { 'gateway/modelo': { in: 3_000_000, out: 15_000_000 } };

type Aggregate = { _sum: { costMicros: number | null } };

function montar(opcoes: {
  gastoDoUsuario?: number | null;
  gastoDaInstancia?: number | null;
  semPreco?: number;
  env?: Record<string, unknown>;
}) {
  const aggregate = jest.fn(
    async (args: { where: { userId?: string; createdAt: { gte: Date } } }): Promise<Aggregate> => ({
      _sum: {
        costMicros:
          args.where.userId === undefined
            ? (opcoes.gastoDaInstancia ?? null)
            : (opcoes.gastoDoUsuario ?? null),
      },
    }),
  );
  const count = jest.fn(
    async (_args: {
      where: { userId?: string; pricingKnown?: boolean; createdAt: { gte: Date } };
    }) => opcoes.semPreco ?? 0,
  );
  const create = jest.fn(async (_args: { data: Record<string, unknown> }) => undefined);

  const prisma = { aiUsage: { aggregate, count, create } } as unknown as PrismaService;

  const valores: Record<string, unknown> = {
    AI_QUOTA_DAILY_MICROS: 0,
    AI_QUOTA_GLOBAL_DAILY_MICROS: 0,
    AI_QUOTA_UNPRICED_DAILY_CALLS: 20,
    AI_PRICE_TABLE: TABELA,
    ...opcoes.env,
  };
  const config = {
    get: (chave: string, padrao?: unknown) => valores[chave] ?? padrao,
  } as unknown as ConfigService;

  return { service: new AiUsageService(prisma, config), aggregate, count, create };
}

describe('AiUsageService.gastoDaJanela', () => {
  it('soma a partir da meia-noite UTC do dia corrente', async () => {
    const { service, aggregate, count } = montar({ gastoDoUsuario: 10, gastoDaInstancia: 90 });

    await service.gastoDaJanela('user-a', AGORA);

    for (const chamada of aggregate.mock.calls) {
      expect(chamada[0].where.createdAt).toEqual({ gte: INICIO_DA_JANELA });
    }
    expect(count.mock.calls[0][0]).toMatchObject({
      where: { createdAt: { gte: INICIO_DA_JANELA } },
    });
  });

  it('separa o gasto do usuário do gasto da instância', async () => {
    const { service, aggregate } = montar({ gastoDoUsuario: 10, gastoDaInstancia: 90 });

    const gasto = await service.gastoDaJanela('user-a', AGORA);

    expect(gasto.userMicros).toBe(10);
    expect(gasto.globalMicros).toBe(90);
    // Uma consulta com `userId` e outra sem. Se as duas tivessem `userId`, o teto
    // global viraria uma segunda cota por usuário e não protegeria contra mil
    // usuários novos no mesmo dia — que é a razão de ele existir.
    const comUsuario = aggregate.mock.calls.filter((c) => c[0].where.userId === 'user-a');
    const semUsuario = aggregate.mock.calls.filter((c) => c[0].where.userId === undefined);
    expect(comUsuario).toHaveLength(1);
    expect(semUsuario).toHaveLength(1);
  });

  it('janela vazia é gasto zero, e não `null` vazando para a conta', async () => {
    const { service } = montar({ gastoDoUsuario: null, gastoDaInstancia: null });
    expect(await service.gastoDaJanela('user-a', AGORA)).toEqual({
      userMicros: 0,
      globalMicros: 0,
      unpricedCalls: 0,
    });
  });

  it('conta as chamadas sem preço da INSTÂNCIA, não as do usuário', async () => {
    const { service, count } = montar({ semPreco: 7 });

    const gasto = await service.gastoDaJanela('user-a', AGORA);

    expect(gasto.unpricedCalls).toBe(7);
    // O que essa guarda protege é a capacidade de medir, e a tabela de preço é
    // uma só. Contando por usuário, cada conta nova ganharia a tolerância inteira
    // de novo e a medição quebrada nunca chegaria ao limite que a desliga.
    expect(count.mock.calls[0][0].where).not.toHaveProperty('userId');
    expect(count.mock.calls[0][0].where).toMatchObject({ pricingKnown: false });
  });
});

describe('AiUsageService.assertDentroDaCota', () => {
  it('deixa passar quando nenhuma cota está configurada', async () => {
    const { service } = montar({ gastoDoUsuario: 9e9, gastoDaInstancia: 9e9, semPreco: 999 });
    await expect(service.assertDentroDaCota('user-a', AGORA)).resolves.toBeUndefined();
  });

  it('barra com 429 nomeado quando o teto do usuário estourou', async () => {
    const { service } = montar({
      gastoDoUsuario: 100_000,
      gastoDaInstancia: 100_000,
      env: { AI_QUOTA_DAILY_MICROS: 100_000 },
    });

    await expect(service.assertDentroDaCota('user-a', AGORA)).rejects.toThrow(
      AiQuotaExceededException,
    );
  });

  it('barra quando a medição se perdeu, mesmo com gasto somando zero', async () => {
    // É o modo de falha que a #135 escreveu que queria evitar: modelo trocado no
    // painel, custo estimado 0, soma 0, cota liberando para sempre.
    const { service } = montar({
      gastoDoUsuario: 0,
      gastoDaInstancia: 0,
      semPreco: 20,
      env: { AI_QUOTA_GLOBAL_DAILY_MICROS: 1_000_000 },
    });

    await expect(service.assertDentroDaCota('user-a', AGORA)).rejects.toThrow(
      AiQuotaExceededException,
    );
  });
});

describe('AiUsageService.registrar', () => {
  it('precifica pelo modelo quando ele está na tabela', async () => {
    const { service, create } = montar({});

    await service.registrar('user-a', {
      feature: 'chat',
      model: 'gateway/modelo',
      units: { inputUnits: 1_000_000, outputUnits: 0 },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-a',
        feature: 'chat',
        model: 'gateway/modelo',
        costMicros: 3_000_000,
        pricingKnown: true,
      },
    });
  });

  it('sem modelo reportado grava custo NÃO MEDIDO, não custo zero', async () => {
    const { service, create } = montar({});

    await service.registrar('user-a', { feature: 'chat', model: null, units: {} });

    const dados = create.mock.calls[0][0].data;
    // Os dois juntos são o ponto: `costMicros: 0` sozinho é indistinguível de uma
    // chamada de graça, e é `pricingKnown: false` que impede esse zero de virar
    // cota infinita.
    expect(dados.costMicros).toBe(0);
    expect(dados.pricingKnown).toBe(false);
    expect(dados.model).toBe('');
  });

  it('modelo fora da tabela de preço também é custo não medido', async () => {
    const { service, create } = montar({});

    await service.registrar('user-a', {
      feature: 'chat',
      model: 'modelo/trocado-no-painel',
      units: { inputUnits: 5_000, outputUnits: 5_000 },
    });

    expect(create.mock.calls[0][0].data).toMatchObject({ costMicros: 0, pricingKnown: false });
  });

  it('unidade ausente com modelo conhecido também é custo não medido', async () => {
    // `usage` sem `inputUnits` acontece de verdade em streaming. Tratar ausência
    // como zero faria a chamada mais cara do dia entrar como grátis.
    const { service, create } = montar({});

    await service.registrar('user-a', {
      feature: 'chat',
      model: 'gateway/modelo',
      units: { outputUnits: 300 },
    });

    expect(create.mock.calls[0][0].data).toMatchObject({ costMicros: 0, pricingKnown: false });
  });
});
