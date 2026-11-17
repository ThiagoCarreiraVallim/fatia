import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { McpToolDef } from '../../../common/decorators/tool.decorator';
import { PrismaService } from '../../../common/prisma.service';
import { CompleteGoalTool } from '../../../goals/mcp/complete-goal.tool';
import { CreateGoalTool } from '../../../goals/mcp/create-goal.tool';
import { UpdateGoalTool } from '../../../goals/mcp/update-goal.tool';
import type { McpToolRegistry } from '../../../mcp/mcp-tool.registry';
import { montarModuloDeTools } from '../../../mcp/__tests__/support/modulo-de-tools';
import { LogMealTool } from '../../../nutrition/mcp/log-meal.tool';
import { UpdateMealItemTool } from '../../../nutrition/mcp/update-meal-item.tool';
import { DeleteWaterLogTool } from '../../../progress/mcp/delete-water-log.tool';
import { LogWaterTool } from '../../../progress/mcp/log-water.tool';
import { UpdateWeightLogTool } from '../../../progress/mcp/update-weight-log.tool';
import { CreateGroupPostTool } from '../../../sharing/mcp/create-group-post.tool';
import { LogSetTool } from '../../../workout/mcp/log-set.tool';
import { StartWorkoutSessionTool } from '../../../workout/mcp/start-workout-session.tool';
import { ForgetMemoryTool } from '../../memory/mcp/forget-memory.tool';
import { SaveMemoryTool } from '../../memory/mcp/save-memory.tool';
import { MemoryService } from '../../memory/memory.service';
import { PreviaDaAcaoService } from '../../previa/previa-da-acao.service';
import { ChatRunRegistry, type ChatRun } from '../../chat-run.registry';
import { LogStepsTool } from '../../../progress/mcp/log-steps.tool';
import { UpdateStepLogTool } from '../../../progress/mcp/update-step-log.tool';
import {
  AUTO_WRITE_CHANGED,
  AUTO_WRITE_EXPIRED,
  AUTO_WRITE_UNDONE,
  AUTO_WRITE_MAX_PER_ANSWER,
  AUTO_WRITE_NEEDS_OK,
  AUTO_WRITE_UNDO_MS,
  AUTO_WRITE_UNKNOWN,
  AutoWriteService,
} from '../auto-write.service';

/**
 * Os testes obrigatórios da ADR 039 (#385), no Postgres real: Automático executa sem pausa;
 * apagar e RESTRICTED nunca; o limite por resposta e por ação; e o Desfazer restaura **exatamente**
 * o estado de antes — comparando as linhas do banco antes da gravação e depois do Desfazer.
 */
describe('gravação automática da IA (integração, ADR 039)', () => {
  const prisma = new PrismaService();
  let modulo: TestingModule;
  let tools: McpToolDef[];
  let auto: AutoWriteService;
  const runs = new ChatRunRegistry();
  /** A resposta em andamento de cada conversa (o `ChatRun` que o turno abriu na API). */
  const abertas = new Map<string, ChatRun>();
  const stamp = `auto-write-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;

  const tool = (nome: string) => {
    const achada = tools.find((t) => t.name === nome);
    if (!achada) throw new Error(`tool ${nome} fora do teste`);
    return achada;
  };

  beforeAll(async () => {
    modulo = await montarModuloDeTools();
    const memorias = new MemoryService(prisma);
    tools = [
      ...[
        LogWaterTool,
        DeleteWaterLogTool,
        LogMealTool,
        UpdateMealItemTool,
        UpdateWeightLogTool,
        CreateGoalTool,
        UpdateGoalTool,
        CompleteGoalTool,
        StartWorkoutSessionTool,
        LogSetTool,
        CreateGroupPostTool,
        LogStepsTool,
        UpdateStepLogTool,
      ].map((t) => modulo.get<McpToolDef>(t, { strict: false })),
      new SaveMemoryTool(memorias),
      new ForgetMemoryTool(memorias),
    ];
    const registry = {
      useAutoWriter: () => undefined,
      entidades: () => tools,
      buscar: (nome: string) => tools.find((t) => t.name === nome),
    } as unknown as McpToolRegistry;
    auto = new AutoWriteService(prisma, registry, new PreviaDaAcaoService(registry, prisma), runs);
  });

  afterAll(async () => {
    for (const run of abertas.values()) runs.finish(run);
    runs.onModuleDestroy();
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await modulo.close();
    await prisma.$disconnect();
  });

  async function pessoa() {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `P${n}` },
    });
    criados.push(user.id);
    const conversa = await prisma.conversation.create({ data: { userId: user.id } });
    return { userId: user.id, conversationId: conversa.id };
  }

  /**
   * Abre a resposta seguinte da conversa, como o `POST /chat` faz. `continua` é a retomada de uma
   * pausa ou o "Continuar": o teto de 5 conta junto com a resposta anterior.
   */
  function resposta(p: { userId: string; conversationId: string }, continua = false): ChatRun {
    const anterior = abertas.get(p.conversationId);
    if (anterior) runs.finish(anterior);
    const run = runs.start(p.userId, p.conversationId, { continues: continua });
    abertas.set(p.conversationId, run);
    return run;
  }

  const ctx = (
    p: { userId: string; conversationId: string },
    toolCallId: string = randomUUID(),
  ) => {
    const run = abertas.get(p.conversationId) ?? resposta(p);
    return {
      userId: p.userId,
      timezone: 'America/Sao_Paulo',
      autoWrite: { conversationId: p.conversationId, runId: run.token, toolCallId },
    };
  };

  const agua = { ml: 500, date: '2026-11-16' };

  /** Todas as linhas da pessoa nas tabelas que as tools tocam, sem carimbo de gravação. */
  async function estado(userId: string) {
    const [meals, waters, weights, goals, sessions, memories, steps] = await Promise.all([
      prisma.meal.findMany({ where: { userId }, include: { items: true }, orderBy: { id: 'asc' } }),
      prisma.waterLog.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      prisma.weightLog.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      prisma.goal.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      prisma.workoutSession.findMany({
        where: { userId },
        include: { sets: { orderBy: { id: 'asc' } } },
        orderBy: { id: 'asc' },
      }),
      prisma.userMemory.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      prisma.stepLog.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    ]);
    return JSON.parse(JSON.stringify({ meals, waters, weights, goals, sessions, memories, steps }));
  }

  async function automatico(
    userId: string,
    ...categorias: ('DAY_LOG' | 'WORKOUT' | 'GOALS' | 'MEMORIES')[]
  ) {
    for (const c of categorias) await auto.setMode(userId, c, 'AUTO');
  }

  async function precisaDeOk(promessa: Promise<unknown>) {
    const erro = await promessa.then(
      () => null,
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ConflictException);
    expect(String((erro as Error).message)).toContain(AUTO_WRITE_NEEDS_OK);
  }

  it('o padrão é Perguntar antes em todas as categorias', async () => {
    const p = await pessoa();
    expect(await auto.modes(p.userId)).toEqual({
      DAY_LOG: 'ASK',
      WORKOUT: 'ASK',
      GOALS: 'ASK',
      MEMORIES: 'ASK',
    });
    expect(await auto.turnModes(p.userId)).toEqual({ auto: [], off: [] });
  });

  it('em Perguntar antes, a gravação automática é recusada e nada é gravado', async () => {
    const p = await pessoa();
    await precisaDeOk(auto.run(tool('log_water'), agua, ctx(p)));
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(0);
  });

  it('em Automático, grava sem pausa e devolve o cartão "Gravado" com Desfazer', async () => {
    const p = await pessoa();
    await automatico(p.userId, 'DAY_LOG');
    const { data, artifact } = await auto.run(tool('log_water'), agua, ctx(p));
    expect(data).toMatchObject({ totalMlForDate: 500 });
    expect(artifact).toMatchObject({ kind: 'saved', undoable: true });
    expect(typeof artifact.autoWriteId).toBe('string');
    expect(artifact.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ after: expect.stringContaining('500') })]),
    );
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(1);
  });

  it('Desligado tira as escritas da categoria do turno; Automático lista só as que têm Desfazer', async () => {
    const p = await pessoa();
    await auto.setMode(p.userId, 'MEMORIES', 'OFF');
    await automatico(p.userId, 'DAY_LOG');
    const modos = await auto.turnModes(p.userId);
    expect(modos.off).toEqual(['forget_memory', 'save_memory']);
    expect(modos.auto).toEqual([
      'log_meal',
      'log_steps',
      'log_water',
      'update_meal_item',
      'update_step_log',
      'update_weight_log',
    ]);
  });

  it('apagar e o que não é confirmável nunca gravam sozinhos, mesmo com tudo em Automático', async () => {
    const p = await pessoa();
    await automatico(p.userId, 'DAY_LOG', 'WORKOUT', 'GOALS', 'MEMORIES');
    const log = await auto.run(tool('log_water'), agua, ctx(p));
    const waterLogId = (log.data as { waterLogId: string }).waterLogId;
    await precisaDeOk(auto.run(tool('delete_water_log'), { id: waterLogId }, ctx(p)));
    const memoria = await prisma.userMemory.create({ data: { userId: p.userId, content: 'x' } });
    await precisaDeOk(auto.run(tool('forget_memory'), { id: memoria.id }, ctx(p)));
    await precisaDeOk(
      auto.run(tool('create_group_post'), { groupId: randomUUID(), body: 'oi' }, ctx(p)),
    );
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(1);
    expect(await prisma.userMemory.count({ where: { userId: p.userId } })).toBe(1);
  });

  it('a sexta gravação da mesma resposta volta a pedir OK; outra resposta conta de novo', async () => {
    const p = await pessoa();
    await automatico(p.userId, 'DAY_LOG');
    resposta(p);
    for (let i = 0; i < AUTO_WRITE_MAX_PER_ANSWER; i += 1) {
      await auto.run(tool('log_water'), agua, ctx(p));
    }
    await precisaDeOk(auto.run(tool('log_water'), agua, ctx(p)));
    resposta(p);
    await auto.run(tool('log_water'), agua, ctx(p));
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(6);
  });

  it('o teto conta pela mensagem da pessoa, atravessando a retomada e o "Continuar"', async () => {
    const p = await pessoa();
    await automatico(p.userId, 'DAY_LOG');
    resposta(p);
    for (let i = 0; i < 3; i += 1) await auto.run(tool('log_water'), agua, ctx(p));
    resposta(p, true);
    for (let i = 0; i < 2; i += 1) await auto.run(tool('log_water'), agua, ctx(p));
    resposta(p, true);
    await precisaDeOk(auto.run(tool('log_water'), agua, ctx(p)));
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(5);
  });

  it('sem um turno ativo desta conversa e desta pessoa, nada grava sozinho', async () => {
    const p = await pessoa();
    const outra = await pessoa();
    await automatico(p.userId, 'DAY_LOG');
    const inventado = {
      userId: p.userId,
      timezone: 'America/Sao_Paulo',
      autoWrite: { conversationId: p.conversationId, runId: randomUUID(), toolCallId: 'c1' },
    };
    await precisaDeOk(auto.run(tool('log_water'), agua, inventado));
    // O token do turno de outra conversa não serve nesta.
    const alheio = resposta(outra);
    await precisaDeOk(
      auto.run(tool('log_water'), agua, {
        ...inventado,
        autoWrite: { ...inventado.autoWrite, runId: alheio.token },
      }),
    );
    // Turno encerrado também não.
    const encerrado = resposta(p);
    runs.finish(encerrado);
    await precisaDeOk(
      auto.run(tool('log_water'), agua, {
        ...inventado,
        autoWrite: { ...inventado.autoWrite, runId: encerrado.token },
      }),
    );
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(0);
  });

  it('Desligado também recusa no servidor', async () => {
    const p = await pessoa();
    await auto.setMode(p.userId, 'DAY_LOG', 'OFF');
    await precisaDeOk(auto.run(tool('log_water'), agua, ctx(p)));
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(0);
  });

  it('uma ação com mais de 10 itens volta a pedir OK', async () => {
    const p = await pessoa();
    await automatico(p.userId, 'DAY_LOG');
    const itens = Array.from({ length: 11 }, (_, i) => ({
      foodName: `Item ${i}`,
      grams: 10,
      kcal: 10,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
    }));
    await precisaDeOk(
      auto.run(
        tool('log_meal'),
        { mealType: 'LUNCH', eatenAt: '2026-11-16T12:00:00-03:00', items: itens },
        ctx(p),
      ),
    );
    expect(await prisma.meal.count({ where: { userId: p.userId } })).toBe(0);
  });

  it('a mesma chamada com o mesmo pedido devolve o mesmo "Gravado", sem gravar de novo', async () => {
    const p = await pessoa();
    await automatico(p.userId, 'DAY_LOG');
    const primeira = await auto.run(tool('log_water'), agua, ctx(p, 'call-1'));
    const segunda = await auto.run(tool('log_water'), agua, ctx(p, 'call-1'));
    expect(segunda.artifact.autoWriteId).toBe(primeira.artifact.autoWriteId);
    expect(segunda.data).toEqual(primeira.data);
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(1);
  });

  it('a mesma chamada com outro pedido volta a pedir OK (e não um 409 cru)', async () => {
    const p = await pessoa();
    await automatico(p.userId, 'DAY_LOG');
    await auto.run(tool('log_water'), agua, ctx(p, 'call-1'));
    await precisaDeOk(auto.run(tool('log_water'), { ...agua, ml: 900 }, ctx(p, 'call-1')));
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(1);
  });

  describe('falha no meio da gravação', () => {
    it('sem a linha de controle, a tool nem roda', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const espiao = jest
        .spyOn(prisma.aiAutoWrite, 'create')
        .mockRejectedValueOnce(new Error('banco caiu'));
      await expect(auto.run(tool('log_water'), agua, ctx(p))).rejects.toThrow('banco caiu');
      espiao.mockRestore();
      expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(0);
    });

    it('a tool que falha não deixa linha de controle para trás', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const c = ctx(p, 'falha-1');
      await expect(
        auto.run(tool('update_weight_log'), { weightLogId: randomUUID(), weightKg: 70 }, c),
      ).rejects.toThrow();
      expect(await prisma.aiAutoWrite.count({ where: { userId: p.userId } })).toBe(0);
    });

    it('a consulta pelo id da chamada acha a gravação feita, ou diz que não sabe', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const feita = await auto.run(tool('log_water'), agua, ctx(p, 'achada'));
      const achada = await auto.lookup(p.userId, p.conversationId, 'achada');
      expect(achada.artifact.autoWriteId).toBe(feita.artifact.autoWriteId);

      // Gravou, mas a linha não fechou: não dá para afirmar nada.
      const espiao = jest
        .spyOn(prisma.aiAutoWrite, 'update')
        .mockRejectedValueOnce(new Error('caiu depois'));
      await expect(auto.run(tool('log_water'), agua, ctx(p, 'pendente'))).rejects.toThrow();
      espiao.mockRestore();
      for (const id of ['pendente', 'nunca-houve']) {
        const erro = await auto.lookup(p.userId, p.conversationId, id).catch((e: Error) => e);
        expect(String((erro as Error).message)).toContain(AUTO_WRITE_UNKNOWN);
      }
      // De outra conversa, a mesma chamada não aparece.
      const outra = await pessoa();
      const alheia = await auto
        .lookup(outra.userId, outra.conversationId, 'achada')
        .catch((e: Error) => e);
      expect(String((alheia as Error).message)).toContain(AUTO_WRITE_UNKNOWN);
    });
  });

  describe('as cópias do dado de saúde', () => {
    const limpa = {
      input: null,
      result: null,
      before: null,
      after: null,
      card: null,
    };

    it('somem quando o prazo do Desfazer acaba, e o metadado fica', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const { artifact } = await auto.run(tool('log_water'), agua, ctx(p));
      const id = String(artifact.autoWriteId);
      await prisma.aiAutoWrite.update({
        where: { id },
        data: { createdAt: new Date(Date.now() - AUTO_WRITE_UNDO_MS - 1000) },
      });
      await auto.purge();
      const linha = await prisma.aiAutoWrite.findUniqueOrThrow({ where: { id } });
      expect(linha).toMatchObject({ ...limpa, tool: 'log_water', category: 'DAY_LOG' });
      expect(linha.clearedAt).not.toBeNull();
    });

    it('somem quando o registro é apagado pela tela, sem esperar o prazo', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const { data, artifact } = await auto.run(tool('log_water'), agua, ctx(p));
      await prisma.waterLog.delete({ where: { id: (data as { waterLogId: string }).waterLogId } });
      await auto.purge();
      const linha = await prisma.aiAutoWrite.findUniqueOrThrow({
        where: { id: String(artifact.autoWriteId) },
      });
      expect(linha).toMatchObject(limpa);
    });

    it('somem no Desfazer, os argumentos inclusive', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const { artifact } = await auto.run(tool('log_water'), agua, ctx(p));
      await auto.undo(p.userId, String(artifact.autoWriteId));
      const linha = await prisma.aiAutoWrite.findUniqueOrThrow({
        where: { id: String(artifact.autoWriteId) },
      });
      expect(linha).toMatchObject(limpa);
    });

    it('a gravação recente com o registro no lugar fica', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const { artifact } = await auto.run(tool('log_water'), agua, ctx(p));
      await auto.purge();
      const linha = await prisma.aiAutoWrite.findUniqueOrThrow({
        where: { id: String(artifact.autoWriteId) },
      });
      expect(linha.input).not.toBeNull();
      expect(linha.clearedAt).toBeNull();
    });
  });

  it('conversa de outra pessoa no pedido é 404, e nada é gravado', async () => {
    const dono = await pessoa();
    const outra = await pessoa();
    await automatico(outra.userId, 'DAY_LOG');
    await expect(
      auto.run(
        tool('log_water'),
        agua,
        ctx({ userId: outra.userId, conversationId: dono.conversationId }),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(await prisma.waterLog.count({ where: { userId: outra.userId } })).toBe(0);
  });

  describe('Desfazer restaura o estado exato', () => {
    async function desfazDepoisDe(
      p: { userId: string; conversationId: string },
      nome: string,
      input: Record<string, unknown>,
    ) {
      const antes = await estado(p.userId);
      const { artifact } = await auto.run(tool(nome), input, ctx(p));
      expect(await estado(p.userId)).not.toEqual(antes);
      await auto.undo(p.userId, String(artifact.autoWriteId));
      expect(await estado(p.userId)).toEqual(antes);
      return String(artifact.autoWriteId);
    }

    it('água criada', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      await desfazDepoisDe(p, 'log_water', agua);
    });

    it('refeição criada, com os itens', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      await desfazDepoisDe(p, 'log_meal', {
        mealType: 'LUNCH',
        eatenAt: '2026-11-16T12:00:00-03:00',
        items: [{ foodName: 'Arroz', grams: 120, kcal: 150, proteinG: 3, carbsG: 30, fatG: 1 }],
      });
    });

    it('item de refeição alterado, com micronutrientes e porção', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const meal = await prisma.meal.create({
        data: {
          userId: p.userId,
          mealType: 'LUNCH',
          eatenAt: new Date('2026-11-16T15:00:00Z'),
          items: {
            create: {
              foodName: 'Feijão',
              grams: 80,
              kcal: 60,
              proteinG: 4,
              carbsG: 10,
              fatG: 0.5,
              nutrients: { fiber_g: 6 },
              portionLabel: 'concha',
              portionQuantity: 1,
            },
          },
        },
        include: { items: true },
      });
      await desfazDepoisDe(p, 'update_meal_item', {
        id: meal.items[0].id,
        grams: 200,
        kcal: 150,
        nutrients: {},
      });
    });

    it('peso alterado', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const log = await prisma.weightLog.create({
        data: {
          userId: p.userId,
          weightKg: 80,
          loggedAt: new Date('2026-11-15T10:00:00Z'),
          notes: 'jejum',
        },
      });
      await desfazDepoisDe(p, 'update_weight_log', {
        weightLogId: log.id,
        weightKg: 79,
        notes: 'depois',
      });
    });

    it('meta criada, editada e concluída', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'GOALS');
      await desfazDepoisDe(p, 'create_goal', {
        kind: 'custom',
        title: 'Correr 5 km',
        targetValue: 5,
        unit: 'km',
      });
      const goal = await prisma.goal.create({
        data: {
          userId: p.userId,
          kind: 'custom',
          title: 'Ler',
          startValue: 0,
          targetValue: 10,
          unit: 'livros',
          deadline: new Date('2027-01-31T02:59:59Z'),
        },
      });
      await desfazDepoisDe(p, 'update_goal', {
        goalId: goal.id,
        title: 'Ler mais',
        targetValue: 12,
      });
      await desfazDepoisDe(p, 'complete_goal', { goalId: goal.id });
    });

    it('série de treino registrada', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'WORKOUT');
      const exercicio = await prisma.exercise.findFirstOrThrow({
        where: { muscleGroup: { not: 'cardio' } },
      });
      const sessao = await prisma.workoutSession.create({
        data: { userId: p.userId, startedAt: new Date('2026-11-16T10:00:00Z') },
      });
      await desfazDepoisDe(p, 'log_set', {
        sessionId: sessao.id,
        exerciseId: exercicio.id,
        weightKg: 40,
        reps: 10,
      });
    });

    it('passos registrados e alterados', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      await desfazDepoisDe(p, 'log_steps', { steps: 8000, date: '2026-11-16' });
      const log = await prisma.stepLog.create({
        data: { userId: p.userId, steps: 5000, date: '2026-11-15' },
      });
      await desfazDepoisDe(p, 'update_step_log', { stepLogId: log.id, steps: 6000 });
    });

    it('memória guardada', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'MEMORIES');
      await desfazDepoisDe(p, 'save_memory', { content: 'Treina às 18h.', category: 'ROUTINE' });
    });

    /** Grava, a pessoa mexe pela tela, e o Desfazer recusa sem mudar nada. */
    async function recusaDepoisDeMexer(
      p: { userId: string; conversationId: string },
      nome: string,
      input: Record<string, unknown>,
      mexer: (data: Record<string, unknown>) => Promise<unknown>,
    ) {
      // Cada caso numa resposta própria: o teto de 5 por resposta não é o que se testa aqui.
      resposta(p);
      const { data, artifact } = await auto.run(tool(nome), input, ctx(p));
      await mexer(data as Record<string, unknown>);
      const mexido = await estado(p.userId);
      const erro = await auto.undo(p.userId, String(artifact.autoWriteId)).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ConflictException);
      expect(JSON.stringify((erro as ConflictException).getResponse())).toContain(
        AUTO_WRITE_CHANGED,
      );
      expect(await estado(p.userId)).toEqual(mexido);
      const linha = await prisma.aiAutoWrite.findUniqueOrThrow({
        where: { id: String(artifact.autoWriteId) },
      });
      expect(linha.undoneAt).toBeNull();
    }

    describe('mexido depois pela pessoa, o Desfazer recusa (AUTO_WRITE_CHANGED)', () => {
      it('água criada e depois editada', async () => {
        const p = await pessoa();
        await automatico(p.userId, 'DAY_LOG');
        await recusaDepoisDeMexer(p, 'log_water', agua, (d) =>
          prisma.waterLog.update({ where: { id: String(d.waterLogId) }, data: { ml: 700 } }),
        );
      });

      it('refeição criada que ganhou outro item', async () => {
        const p = await pessoa();
        await automatico(p.userId, 'DAY_LOG');
        await recusaDepoisDeMexer(
          p,
          'log_meal',
          {
            mealType: 'LUNCH',
            eatenAt: '2026-11-16T12:00:00-03:00',
            items: [{ foodName: 'Arroz', grams: 120, kcal: 150, proteinG: 3, carbsG: 30, fatG: 1 }],
          },
          (d) =>
            prisma.mealItem.create({
              data: {
                mealId: String(d.id),
                foodName: 'Salada',
                grams: 50,
                kcal: 10,
                proteinG: 1,
                carbsG: 2,
                fatG: 0,
              },
            }),
        );
      });

      it('refeição criada com o item editado', async () => {
        const p = await pessoa();
        await automatico(p.userId, 'DAY_LOG');
        await recusaDepoisDeMexer(
          p,
          'log_meal',
          {
            mealType: 'LUNCH',
            eatenAt: '2026-11-16T12:00:00-03:00',
            items: [{ foodName: 'Arroz', grams: 120, kcal: 150, proteinG: 3, carbsG: 30, fatG: 1 }],
          },
          (d) =>
            prisma.mealItem.updateMany({ where: { mealId: String(d.id) }, data: { grams: 90 } }),
        );
      });

      it('treino começado que ganhou circuito, check-in ou série', async () => {
        const exercicio = await prisma.exercise.findFirstOrThrow({
          where: { muscleGroup: { not: 'cardio' } },
        });
        const mexidas: ((sessionId: string, userId: string) => Promise<unknown>)[] = [
          (id) => prisma.workoutSession.update({ where: { id }, data: { circuit: { rounds: 1 } } }),
          (id, userId) => prisma.workoutCheckin.create({ data: { sessionId: id, userId } }),
          (id) =>
            prisma.sessionSet.create({
              data: { sessionId: id, exerciseId: exercicio.id, setNumber: 1, reps: 5 },
            }),
        ];
        for (const mexer of mexidas) {
          const p = await pessoa();
          await automatico(p.userId, 'WORKOUT');
          await recusaDepoisDeMexer(p, 'start_workout_session', {}, (d) =>
            mexer(String(d.id), p.userId),
          );
        }
      });

      it('peso, item, meta, série, memória e passos mexidos depois', async () => {
        const p = await pessoa();
        await automatico(p.userId, 'DAY_LOG', 'GOALS', 'WORKOUT', 'MEMORIES');
        const peso = await prisma.weightLog.create({
          data: { userId: p.userId, weightKg: 80, loggedAt: new Date('2026-11-15T10:00:00Z') },
        });
        await recusaDepoisDeMexer(
          p,
          'update_weight_log',
          { weightLogId: peso.id, weightKg: 79 },
          () => prisma.weightLog.update({ where: { id: peso.id }, data: { notes: 'à mão' } }),
        );
        const meal = await prisma.meal.create({
          data: {
            userId: p.userId,
            mealType: 'LUNCH',
            eatenAt: new Date('2026-11-16T15:00:00Z'),
            items: {
              create: {
                foodName: 'Feijão',
                grams: 80,
                kcal: 60,
                proteinG: 4,
                carbsG: 10,
                fatG: 0.5,
              },
            },
          },
          include: { items: true },
        });
        const item = meal.items[0];
        await recusaDepoisDeMexer(p, 'update_meal_item', { id: item.id, grams: 100 }, () =>
          prisma.mealItem.update({ where: { id: item.id }, data: { grams: 110 } }),
        );
        const goal = await prisma.goal.create({
          data: {
            userId: p.userId,
            kind: 'custom',
            title: 'Ler',
            startValue: 0,
            targetValue: 10,
            unit: 'livros',
          },
        });
        await recusaDepoisDeMexer(p, 'update_goal', { goalId: goal.id, targetValue: 12 }, () =>
          prisma.goal.update({ where: { id: goal.id }, data: { title: 'Ler muito' } }),
        );
        await recusaDepoisDeMexer(p, 'complete_goal', { goalId: goal.id }, () =>
          prisma.goal.update({ where: { id: goal.id }, data: { status: 'active' } }),
        );
        await recusaDepoisDeMexer(
          p,
          'create_goal',
          { kind: 'custom', title: 'Correr', targetValue: 5, unit: 'km' },
          (d) => prisma.goal.update({ where: { id: String(d.id) }, data: { targetValue: 7 } }),
        );
        const exercicio = await prisma.exercise.findFirstOrThrow({
          where: { muscleGroup: { not: 'cardio' } },
        });
        const sessao = await prisma.workoutSession.create({
          data: { userId: p.userId, startedAt: new Date('2026-11-16T10:00:00Z') },
        });
        await recusaDepoisDeMexer(
          p,
          'log_set',
          { sessionId: sessao.id, exerciseId: exercicio.id, weightKg: 40, reps: 10 },
          (d) => prisma.sessionSet.update({ where: { id: String(d.id) }, data: { reps: 8 } }),
        );
        await recusaDepoisDeMexer(p, 'save_memory', { content: 'Treina cedo.' }, (d) =>
          prisma.userMemory.update({
            where: { id: String(d.id) },
            data: { content: 'Treina tarde.' },
          }),
        );
        await recusaDepoisDeMexer(p, 'log_steps', { steps: 8000, date: '2026-11-16' }, (d) =>
          prisma.stepLog.update({ where: { id: String(d.stepLogId) }, data: { steps: 9000 } }),
        );
      });

      it('duas mudanças em cadeia: a primeira só desfaz depois da segunda', async () => {
        const p = await pessoa();
        await automatico(p.userId, 'DAY_LOG');
        const peso = await prisma.weightLog.create({
          data: { userId: p.userId, weightKg: 80, loggedAt: new Date('2026-11-15T10:00:00Z') },
        });
        const antes = await estado(p.userId);
        const a = await auto.run(
          tool('update_weight_log'),
          { weightLogId: peso.id, weightKg: 79 },
          ctx(p),
        );
        const b = await auto.run(
          tool('update_weight_log'),
          { weightLogId: peso.id, weightKg: 78 },
          ctx(p),
        );
        const erro = await auto
          .undo(p.userId, String(a.artifact.autoWriteId))
          .catch((e: unknown) => e);
        expect(JSON.stringify((erro as ConflictException).getResponse())).toContain(
          AUTO_WRITE_CHANGED,
        );
        await auto.undo(p.userId, String(b.artifact.autoWriteId));
        await auto.undo(p.userId, String(a.artifact.autoWriteId));
        expect(await estado(p.userId)).toEqual(antes);
      });
    });

    it('a mudança mostra antes → depois no cartão', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const peso = await prisma.weightLog.create({
        data: { userId: p.userId, weightKg: 80, loggedAt: new Date('2026-11-15T10:00:00Z') },
      });
      const { artifact } = await auto.run(
        tool('update_weight_log'),
        { weightLogId: peso.id, weightKg: 79 },
        ctx(p),
      );
      expect(artifact.lines).toEqual([
        expect.objectContaining({
          before: expect.stringContaining('80'),
          after: expect.stringContaining('79'),
        }),
      ]);
    });

    it('só o dono desfaz, uma vez só, e dentro do prazo', async () => {
      const p = await pessoa();
      const outra = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const { artifact } = await auto.run(tool('log_water'), agua, ctx(p));
      const id = String(artifact.autoWriteId);
      await expect(auto.undo(outra.userId, id)).rejects.toThrow(NotFoundException);
      expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(1);
      expect(await auto.status(p.userId, id)).toEqual({ state: 'active' });
      await auto.undo(p.userId, id);
      const codigo = (e: unknown) =>
        JSON.stringify((e as ConflictException).getResponse()).match(/AUTO_WRITE_[A-Z_]+/)?.[0];
      // O código vai para a tela dizer por que não desfez; o estado sobrevive ao recarregar.
      expect(codigo(await auto.undo(p.userId, id).catch((e: unknown) => e))).toBe(
        AUTO_WRITE_UNDONE,
      );
      expect(await auto.status(p.userId, id)).toEqual({ state: 'undone' });
      await expect(auto.status(outra.userId, id)).rejects.toThrow(NotFoundException);

      const segunda = await auto.run(tool('log_water'), agua, ctx(p));
      await prisma.aiAutoWrite.update({
        where: { id: String(segunda.artifact.autoWriteId) },
        data: { createdAt: new Date(Date.now() - AUTO_WRITE_UNDO_MS - 1000) },
      });
      const vencida = String(segunda.artifact.autoWriteId);
      expect(codigo(await auto.undo(p.userId, vencida).catch((e: unknown) => e))).toBe(
        AUTO_WRITE_EXPIRED,
      );
      expect(await auto.status(p.userId, vencida)).toEqual({ state: 'expired' });
    });

    it('treino começado com série gravada depois não é apagado pelo Desfazer', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'WORKOUT');
      const { data, artifact } = await auto.run(tool('start_workout_session'), {}, ctx(p));
      const exercicio = await prisma.exercise.findFirstOrThrow({
        where: { muscleGroup: { not: 'cardio' } },
      });
      await prisma.sessionSet.create({
        data: {
          sessionId: (data as { id: string }).id,
          exerciseId: exercicio.id,
          setNumber: 1,
          reps: 5,
        },
      });
      await expect(auto.undo(p.userId, String(artifact.autoWriteId))).rejects.toThrow(
        ConflictException,
      );
      expect(await prisma.workoutSession.count({ where: { userId: p.userId } })).toBe(1);
      // A recusa devolve a linha: o Desfazer continua possível depois de apagar a série.
      const linha = await prisma.aiAutoWrite.findUniqueOrThrow({
        where: { id: String(artifact.autoWriteId) },
      });
      expect(linha.undoneAt).toBeNull();
    });
  });
});
