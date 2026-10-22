import { Logger } from '@nestjs/common';
import type { AiPaidBy } from '@prisma/client';
import { AiAccessService, AiPlanRequiredException } from '../ai-access.service';
import { AiQuotaExceededException } from '../ai-quota';
import type { AiUsageService } from '../ai-usage.service';
import { HostedAiService } from '../hosted-ai.service';
import { INSTANCIA_LIBERADA, type AiEntitlement } from '../../billing/ai-entitlement';
import { FakeAgentAdapter } from './fake-agent.adapter';

/**
 * A IA hospedada num módulo só: portão de plano e cota → quem paga → agente →
 * uso gravado.
 *
 * Substitui o teste por regex que conferia se cada arquivo que chamava o agente
 * também chamava `assertPodeUsar`. Aquele só via texto: não cobria o título, não
 * via se o uso era gravado nem com qual pagador. Aqui o agente é um adapter
 * falso, e o que se afirma é comportamento — quantas vezes ele foi chamado e o
 * que foi parar no livro-caixa.
 */

const USER = 'user-a';
const SEAT_GROUP = 'grupo-da-academia';

const FREE: AiEntitlement = {
  tier: 'FREE',
  source: null,
  motivo: 'sem_assinatura',
  degraded: false,
  subscription: null,
};

/** PRO pelo assento de uma comunidade: quem paga é ela (ADR 025). */
const SEAT: AiEntitlement = {
  tier: 'PRO',
  source: 'GROUP',
  motivo: 'ativa',
  degraded: false,
  subscription: {
    id: 'pool',
    source: 'GROUP',
    status: 'ACTIVE',
    interval: 'MONTHLY',
    currentPeriodEnd: null,
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(0),
    group: { id: SEAT_GROUP, name: 'Academia' },
  },
};

function build(entitlement: AiEntitlement = SEAT) {
  const agent = new FakeAgentAdapter();
  const usage = {
    assertDentroDaCota: jest.fn(async (_userId: string, _now?: Date): Promise<void> => undefined),
    record: jest.fn(
      async (
        _userId: string,
        _entry: {
          feature: string;
          model: string | null;
          units: Record<string, unknown>;
          paidBy: AiPaidBy;
          groupId: string | null;
        },
      ): Promise<void> => undefined,
    ),
  } satisfies Partial<AiUsageService>;
  const access = new AiAccessService(
    { aiTierForUser: async () => entitlement, exigePlano: () => true },
    usage as unknown as AiUsageService,
  );
  const service = new HostedAiService(access, usage as unknown as AiUsageService, agent);
  return { service, agent, usage };
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const turnInput = async () => ({
  bearer: 'tok',
  timezone: 'America/Sao_Paulo',
  conversationId: 'c1',
  history: [],
  message: 'oi',
});

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('HostedAiService — sem direito, o agente não é chamado', () => {
  const calls = {
    turno: (s: HostedAiService) => s.openTurn(USER, turnInput),
    ditado: (s: HostedAiService) => s.transcribe(USER, Buffer.from('áudio'), 'audio/webm'),
    foto: (s: HostedAiService) => s.recognizeMeal(USER, JPEG),
  };

  it.each(Object.entries(calls))(
    'Free no %s recebe 402, sem agente nem lançamento',
    async (_n, call) => {
      const { service, agent, usage } = build(FREE);

      await expect(call(service)).rejects.toBeInstanceOf(AiPlanRequiredException);

      expect(agent.openTurn).not.toHaveBeenCalled();
      expect(agent.transcribe).not.toHaveBeenCalled();
      expect(agent.recognizeMeal).not.toHaveBeenCalled();
      expect(usage.assertDentroDaCota).not.toHaveBeenCalled();
      expect(usage.record).not.toHaveBeenCalled();
    },
  );

  it.each(Object.entries(calls))(
    'cota estourada no %s recusa antes do agente',
    async (_n, call) => {
      const { service, agent, usage } = build();
      usage.assertDentroDaCota.mockRejectedValue(
        new AiQuotaExceededException({
          allowed: false,
          scope: 'global',
          spentMicros: 10,
          limitMicros: 10,
          resetsAt: new Date('2026-10-20T00:00:00Z'),
        }),
      );

      await expect(call(service)).rejects.toBeInstanceOf(AiQuotaExceededException);

      expect(agent.openTurn).not.toHaveBeenCalled();
      expect(agent.transcribe).not.toHaveBeenCalled();
      expect(agent.recognizeMeal).not.toHaveBeenCalled();
    },
  );

  it('o turno nem monta a entrada do agente quando o portão recusa', async () => {
    const { service } = build(FREE);
    const buildInput = jest.fn(turnInput);

    await expect(service.openTurn(USER, buildInput)).rejects.toBeInstanceOf(
      AiPlanRequiredException,
    );
    expect(buildInput).not.toHaveBeenCalled();
  });
});

describe('HostedAiService — toda chamada grava uso com quem pagou', () => {
  const comunidade = { paidBy: 'GROUP', groupId: SEAT_GROUP };

  it('foto sai precificada: modelo e unidades do agente, pago pela comunidade', async () => {
    const { service, usage } = build();

    await service.recognizeMeal(USER, JPEG);

    expect(usage.record).toHaveBeenCalledTimes(1);
    expect(usage.record).toHaveBeenCalledWith(USER, {
      feature: 'meal_photo',
      ...comunidade,
      model: 'z-ai/glm-5.3-flash',
      units: { inputUnits: 1200, outputUnits: 90 },
    });
  });

  it('foto sem usage do agente vira lançamento não medido, e não nenhum', async () => {
    const { service, agent, usage } = build();
    agent.recognizeMeal.mockResolvedValueOnce({ items: [], note: null, usage: null });

    await service.recognizeMeal(USER, JPEG);

    expect(usage.record).toHaveBeenCalledWith(USER, {
      feature: 'meal_photo',
      ...comunidade,
      model: null,
      units: {},
    });
  });

  it('ditado grava os segundos de áudio, com saída zero', async () => {
    const { service, usage } = build();

    await expect(service.transcribe(USER, Buffer.from('a'), 'audio/webm')).resolves.toEqual({
      text: 'registra 200 g de frango',
    });

    expect(usage.record).toHaveBeenCalledWith(USER, {
      feature: 'transcription',
      ...comunidade,
      model: 'whisper-1',
      units: { inputUnits: 3.4, outputUnits: 0 },
    });
  });

  it('turno grava um lançamento por modelo no fim, com a comunidade do assento', async () => {
    const { service, usage } = build();
    const buildInput = jest.fn(turnInput);

    const turn = await service.openTurn(USER, buildInput);
    await turn.finish(
      new Map([
        ['m', { inputUnits: 10, outputUnits: 2 }],
        ['caro', { inputUnits: 5 }],
      ]),
    );

    // O agente padrão da conversa sai do assento: o callback recebe a comunidade.
    expect(buildInput).toHaveBeenCalledWith(SEAT_GROUP);
    expect(usage.record.mock.calls).toEqual([
      [
        USER,
        { feature: 'chat', ...comunidade, model: 'm', units: { inputUnits: 10, outputUnits: 2 } },
      ],
      [USER, { feature: 'chat', ...comunidade, model: 'caro', units: { inputUnits: 5 } }],
    ]);
  });

  it('turno sem usage nenhum vira um lançamento não medido', async () => {
    const { service, usage } = build();

    const turn = await service.openTurn(USER, turnInput);
    await turn.finish(new Map());

    expect(usage.record).toHaveBeenCalledWith(USER, {
      feature: 'chat',
      ...comunidade,
      model: null,
      units: {},
    });
  });

  it('título herda o direito do turno: sem portão de novo, mesmo pagador', async () => {
    const { service, agent, usage } = build();
    agent.title.mockResolvedValueOnce({
      title: 'Almoço',
      usage: { model: 'm', inputUnits: 40, outputUnits: 5 },
    });

    const turn = await service.openTurn(USER, turnInput);
    usage.assertDentroDaCota.mockClear();
    await expect(turn.title('registra o almoço')).resolves.toBe('Almoço');

    expect(usage.assertDentroDaCota).not.toHaveBeenCalled();
    expect(usage.record).toHaveBeenCalledWith(USER, {
      feature: 'chat_title',
      ...comunidade,
      model: 'm',
      units: { inputUnits: 40, outputUnits: 5 },
    });
  });

  it('título que o agente não gerou não grava nada e devolve null', async () => {
    const { service, usage } = build();

    const turn = await service.openTurn(USER, turnInput);
    await expect(turn.title('oi')).resolves.toBeNull();

    expect(usage.record).not.toHaveBeenCalled();
  });

  it('PRO pessoal paga como USER; instância liberada, como INSTANCE', async () => {
    const pessoal = build({
      tier: 'PRO',
      source: 'ASAAS',
      motivo: 'ativa',
      degraded: false,
      subscription: null,
    });
    await pessoal.service.recognizeMeal(USER, JPEG);
    expect(pessoal.usage.record.mock.calls[0][1]).toMatchObject({ paidBy: 'USER', groupId: null });

    const instancia = build(INSTANCIA_LIBERADA);
    await instancia.service.recognizeMeal(USER, JPEG);
    expect(instancia.usage.record.mock.calls[0][1]).toMatchObject({
      paidBy: 'INSTANCE',
      groupId: null,
    });
  });

  it('agente que falha não gera lançamento — nada foi consumido', async () => {
    const { service, agent, usage } = build();
    agent.recognizeMeal.mockRejectedValueOnce(new Error('fora do ar'));

    await expect(service.recognizeMeal(USER, JPEG)).rejects.toThrow('fora do ar');
    expect(usage.record).not.toHaveBeenCalled();
  });
});

describe('HostedAiService — falha ao gravar não derruba a resposta', () => {
  it('foto, ditado, turno e título respondem mesmo com o banco fora', async () => {
    const { service, agent, usage } = build();
    usage.record.mockRejectedValue(new Error('banco caiu'));
    agent.recognizeMeal.mockResolvedValueOnce({
      items: [{ name: 'arroz', grams: 100, confidence: 0.9 }],
      note: 'ok',
      usage: { model: 'm', inputUnits: 1, outputUnits: 1 },
    });
    agent.title.mockResolvedValueOnce({ title: 'Almoço', usage: null });

    await expect(service.recognizeMeal(USER, JPEG)).resolves.toEqual({
      items: [{ name: 'arroz', grams: 100, confidence: 0.9 }],
      note: 'ok',
    });
    await expect(service.transcribe(USER, Buffer.from('a'), 'audio/webm')).resolves.toEqual({
      text: 'registra 200 g de frango',
    });
    const turn = await service.openTurn(USER, turnInput);
    await expect(turn.finish(new Map())).resolves.toBeUndefined();
    await expect(turn.title('oi')).resolves.toBe('Almoço');

    expect(usage.record).toHaveBeenCalledTimes(4);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringMatching(/Uso de IA não gravado \(meal_photo\)/),
    );
  });
});
