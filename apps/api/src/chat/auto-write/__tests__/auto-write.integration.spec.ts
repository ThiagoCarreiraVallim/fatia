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
import {
  AUTO_WRITE_MAX_PER_ANSWER,
  AUTO_WRITE_NEEDS_OK,
  AUTO_WRITE_UNDO_MS,
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
      ].map((t) => modulo.get<McpToolDef>(t, { strict: false })),
      new SaveMemoryTool(memorias),
      new ForgetMemoryTool(memorias),
    ];
    const registry = {
      useAutoWriter: () => undefined,
      entidades: () => tools,
      buscar: (nome: string) => tools.find((t) => t.name === nome),
    } as unknown as McpToolRegistry;
    auto = new AutoWriteService(prisma, registry, new PreviaDaAcaoService(registry, prisma));
  });

  afterAll(async () => {
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

  const ctx = (
    p: { userId: string; conversationId: string },
    runId = 'run-1',
    toolCallId: string = randomUUID(),
  ) => ({
    userId: p.userId,
    timezone: 'America/Sao_Paulo',
    autoWrite: { conversationId: p.conversationId, runId, toolCallId },
  });

  const agua = { ml: 500, date: '2026-11-16' };

  /** Todas as linhas da pessoa nas tabelas que as tools tocam, sem carimbo de gravação. */
  async function estado(userId: string) {
    const [meals, waters, weights, goals, sessions, memories] = await Promise.all([
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
    ]);
    return JSON.parse(JSON.stringify({ meals, waters, weights, goals, sessions, memories }));
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
    expect(modos.auto).toEqual(['log_meal', 'log_water', 'update_meal_item', 'update_weight_log']);
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
    for (let i = 0; i < AUTO_WRITE_MAX_PER_ANSWER; i += 1) {
      await auto.run(tool('log_water'), agua, ctx(p, 'run-a'));
    }
    await precisaDeOk(auto.run(tool('log_water'), agua, ctx(p, 'run-a')));
    await auto.run(tool('log_water'), agua, ctx(p, 'run-b'));
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(6);
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

  it('a mesma chamada não grava duas vezes', async () => {
    const p = await pessoa();
    await automatico(p.userId, 'DAY_LOG');
    await auto.run(tool('log_water'), agua, ctx(p, 'run-1', 'call-1'));
    await expect(auto.run(tool('log_water'), agua, ctx(p, 'run-1', 'call-1'))).rejects.toThrow(
      ConflictException,
    );
    expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(1);
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

    it('memória guardada', async () => {
      const p = await pessoa();
      await automatico(p.userId, 'MEMORIES');
      await desfazDepoisDe(p, 'save_memory', { content: 'Treina às 18h.', category: 'ROUTINE' });
    });

    it('só o dono desfaz, uma vez só, e dentro do prazo', async () => {
      const p = await pessoa();
      const outra = await pessoa();
      await automatico(p.userId, 'DAY_LOG');
      const { artifact } = await auto.run(tool('log_water'), agua, ctx(p));
      const id = String(artifact.autoWriteId);
      await expect(auto.undo(outra.userId, id)).rejects.toThrow(NotFoundException);
      expect(await prisma.waterLog.count({ where: { userId: p.userId } })).toBe(1);
      await auto.undo(p.userId, id);
      await expect(auto.undo(p.userId, id)).rejects.toThrow(ConflictException);

      const segunda = await auto.run(tool('log_water'), agua, ctx(p));
      await prisma.aiAutoWrite.update({
        where: { id: String(segunda.artifact.autoWriteId) },
        data: { createdAt: new Date(Date.now() - AUTO_WRITE_UNDO_MS - 1000) },
      });
      await expect(auto.undo(p.userId, String(segunda.artifact.autoWriteId))).rejects.toThrow(
        ConflictException,
      );
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
