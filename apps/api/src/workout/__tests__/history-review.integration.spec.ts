import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { WorkoutPlanService } from '../workout-plan.service';
import { WorkoutSessionService } from '../workout-session.service';

/**
 * Correções do review da #381 contra o Postgres: o tipo da sessão sobrevive à
 * exclusão do plano, "Salvar como plano" é idempotente, só aceita treino
 * terminado e sai na ordem do detalhe, e o cursor do histórico não termina a
 * lista cedo nem aceita a sessão de outra pessoa.
 */
describe('histórico e salvar como plano — correções do review #381 (banco real)', () => {
  const prisma = new PrismaService();
  const sessions = new WorkoutSessionService(prisma);
  const plans = new WorkoutPlanService(prisma);
  const stamp = `t381r-${Date.now()}`;
  let userId: string;
  let otherId: string;
  let lowId: number;
  let highId: number;

  const at = (iso: string) => new Date(iso);

  /** Sessão terminada com uma série em cada exercício, na ordem dada. */
  async function doneSession(startedAt: string, exerciseIds: number[], owner = userId) {
    return prisma.workoutSession.create({
      data: {
        userId: owner,
        startedAt: at(startedAt),
        completedAt: new Date(at(startedAt).getTime() + 30 * 60_000),
        sets: {
          create: exerciseIds.map((exerciseId) => ({
            exerciseId,
            setNumber: 1,
            weightKg: 20,
            reps: 10,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
    const [user, other] = await Promise.all([
      prisma.user.create({
        data: { logtoSub: `${stamp}-a`, email: `${stamp}-a@test.local`, name: 'Aluna' },
      }),
      prisma.user.create({
        data: { logtoSub: `${stamp}-b`, email: `${stamp}-b@test.local`, name: 'Vizinha' },
      }),
    ]);
    userId = user.id;
    otherId = other.id;
    const low = await prisma.exercise.create({
      data: { name: `${stamp}-agachamento`, muscleGroup: 'pernas', createdByUserId: userId },
    });
    const high = await prisma.exercise.create({
      data: { name: `${stamp}-remada`, muscleGroup: 'costas', createdByUserId: userId },
    });
    lowId = low.id;
    highId = high.id;
  });

  afterEach(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.workoutPlan.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  });

  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { createdByUserId: userId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  describe('a sessão de um plano excluído segue sendo de plano', () => {
    it('tipo e título vêm do retrato tirado ao começar', async () => {
      const plan = await prisma.workoutPlan.create({
        data: {
          userId,
          name: 'Pernas',
          exercises: { create: { exerciseId: lowId, order: 1, targetSets: 3, targetReps: '8' } },
        },
      });
      const started = await sessions.start(userId, {
        planId: plan.id,
        startedAt: '2026-11-10T10:00:00Z',
      });
      await prisma.sessionSet.create({
        data: { sessionId: started.id, exerciseId: lowId, setNumber: 1, weightKg: 60, reps: 8 },
      });
      await sessions.finish(userId, started.id, { completedAt: '2026-11-10T10:40:00Z' });

      await plans.delete(userId, plan.id);

      const h = await sessions.history(userId, {});
      expect(h.items[0]).toMatchObject({ id: started.id, kind: 'plan', title: 'Pernas' });
      expect((await sessions.history(userId, { kind: 'plan' })).items.map((i) => i.id)).toEqual([
        started.id,
      ]);
      expect((await sessions.history(userId, { kind: 'free' })).items).toEqual([]);
      const summary = await sessions.summary(userId, started.id);
      expect(summary).toMatchObject({ kind: 'plan', planId: null, planName: 'Pernas' });
      const [listed] = await sessions.list(userId, {});
      expect(listed).toMatchObject({ id: started.id, kind: 'plan' });
    });

    it('o título acompanha o nome do plano enquanto ele existe', async () => {
      const plan = await prisma.workoutPlan.create({ data: { userId, name: 'Antigo' } });
      const started = await sessions.start(userId, { planId: plan.id });
      await sessions.finish(userId, started.id, {});
      await prisma.workoutPlan.update({ where: { id: plan.id }, data: { name: 'Novo' } });
      expect((await sessions.history(userId, {})).items[0]).toMatchObject({ title: 'Novo' });
    });
  });

  describe('salvar como plano', () => {
    it('é idempotente: salvar de novo devolve o mesmo plano', async () => {
      const s = await doneSession('2026-11-08T10:00:00Z', [lowId]);
      const first = await plans.createFromSession(userId, s.id, {});
      const again = await plans.createFromSession(userId, s.id, { name: 'Outro nome' });
      expect(again.id).toBe(first.id);
      expect(await prisma.workoutPlan.count({ where: { userId } })).toBe(1);
    });

    it('dois pedidos ao mesmo tempo criam um plano só', async () => {
      const s = await doneSession('2026-11-08T10:00:00Z', [lowId]);
      const [a, b] = await Promise.all([
        plans.createFromSession(userId, s.id, {}),
        plans.createFromSession(userId, s.id, {}),
      ]);
      expect(a.id).toBe(b.id);
      expect(await prisma.workoutPlan.count({ where: { userId } })).toBe(1);
    });

    it('o resumo diz qual plano a sessão virou', async () => {
      const s = await doneSession('2026-11-08T10:00:00Z', [lowId]);
      expect((await sessions.summary(userId, s.id)).savedPlanId).toBeNull();
      const plan = await plans.createFromSession(userId, s.id, {});
      expect((await sessions.summary(userId, s.id)).savedPlanId).toBe(plan.id);
      // Excluído o plano, a sessão volta a poder virar plano.
      await plans.delete(userId, plan.id);
      expect((await sessions.summary(userId, s.id)).savedPlanId).toBeNull();
    });

    it('treino em andamento não vira plano: 409', async () => {
      const open = await prisma.workoutSession.create({
        data: {
          userId,
          startedAt: at('2026-11-09T10:00:00Z'),
          sets: { create: { exerciseId: lowId, setNumber: 1, weightKg: 20, reps: 10 } },
        },
      });
      const attempt = plans.createFromSession(userId, open.id, {});
      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow('Termine o treino antes de salvar como plano');
      expect(await prisma.workoutPlan.count({ where: { userId } })).toBe(0);
    });

    it('o plano sai na ordem do detalhe', async () => {
      // As séries chegam no banco com o exercício de id maior primeiro.
      const s = await doneSession('2026-11-08T10:00:00Z', [highId, lowId]);
      const summary = await sessions.summary(userId, s.id);
      const plan = await plans.createFromSession(userId, s.id, {});
      expect(plan.exercises.map((e) => e.exerciseId)).toEqual(
        summary.exercises.map((e) => e.exerciseId),
      );
    });

    it('a ordem escolhida ao começar o treino livre vale para o detalhe e para o plano', async () => {
      const started = await sessions.start(userId, {
        startedAt: '2026-11-08T10:00:00Z',
        exerciseOrder: [highId, lowId],
      });
      expect(started.exerciseOrder).toEqual([highId, lowId]);
      await prisma.sessionSet.createMany({
        data: [lowId, highId].map((exerciseId) => ({
          sessionId: started.id,
          exerciseId,
          setNumber: 1,
          weightKg: 20,
          reps: 10,
        })),
      });
      await sessions.finish(userId, started.id, {});
      const summary = await sessions.summary(userId, started.id);
      expect(summary.exercises.map((e) => e.exerciseId)).toEqual([highId, lowId]);
      const plan = await plans.createFromSession(userId, started.id, {});
      expect(plan.exercises.map((e) => e.exerciseId)).toEqual([highId, lowId]);
    });
  });

  describe('cursor do histórico', () => {
    it('apagar a sessão do cursor não termina a lista', async () => {
      const a = await doneSession('2026-11-03T10:00:00Z', [lowId]);
      const b = await doneSession('2026-11-02T10:00:00Z', [lowId]);
      const c = await doneSession('2026-11-01T10:00:00Z', [lowId]);
      const first = await sessions.history(userId, { limit: 1 });
      expect(first.items.map((i) => i.id)).toEqual([a.id]);
      await sessions.delete(userId, a.id);
      const rest = await sessions.history(userId, { limit: 5, cursor: first.nextCursor! });
      expect(rest.items.map((i) => i.id)).toEqual([b.id, c.id]);
    });

    it('a sessão de outra pessoa não serve de cursor', async () => {
      await doneSession('2026-11-03T10:00:00Z', [lowId]);
      const theirs = await doneSession('2026-11-04T10:00:00Z', [lowId], otherId);
      await expect(sessions.history(userId, { cursor: theirs.id })).rejects.toThrow(
        BadRequestException,
      );
      await expect(sessions.list(userId, { cursor: theirs.id })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('a lista do MCP pagina por id sem perder ninguém, mesmo apagando o cursor', async () => {
      const a = await doneSession('2026-11-03T10:00:00Z', [lowId]);
      const b = await doneSession('2026-11-02T10:00:00Z', [lowId]);
      const first = await sessions.list(userId, { limit: 1 });
      expect(first.map((s) => s.id)).toEqual([a.id]);
      const rest = await sessions.list(userId, { limit: 5, cursor: a.id });
      expect(rest.map((s) => s.id)).toEqual([b.id]);
    });

    it('sessões com o mesmo início paginam sem repetir nem pular', async () => {
      const same = '2026-11-05T10:00:00Z';
      const made = await Promise.all([1, 2, 3, 4].map(() => doneSession(same, [lowId])));
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await sessions.history(userId, { limit: 1, cursor });
        seen.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toHaveLength(4);
      expect(new Set(seen)).toEqual(new Set(made.map((m) => m.id)));
    });
  });
});
