import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SessionSetService } from '../session-set.service';
import { WorkoutPlanService } from '../workout-plan.service';
import { WorkoutSessionService } from '../workout-session.service';

/**
 * Treino livre e histórico (#381) contra o Postgres: o tipo de cada sessão, o
 * histórico com totais e filtro, "Salvar como plano" (cardio vira meta de
 * cardio) e o recorde de distância somado por sessão.
 */
describe('treino livre e histórico #381 (banco real)', () => {
  const prisma = new PrismaService();
  const sessions = new WorkoutSessionService(prisma);
  const plans = new WorkoutPlanService(prisma);
  const sets = new SessionSetService(prisma);
  const stamp = `t381-${Date.now()}`;
  let userId: string;
  let otherId: string;
  let benchId: number;
  let runId: number;
  let planId: string;
  let pushId: string;
  let runSessionId: string;
  let openId: string;

  const at = (iso: string) => new Date(iso);

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
    const [bench, run] = await Promise.all([
      prisma.exercise.create({
        data: { name: `${stamp}-supino`, muscleGroup: 'peito', createdByUserId: userId },
      }),
      prisma.exercise.create({
        data: { name: `${stamp}-esteira`, muscleGroup: 'cardio', createdByUserId: userId },
      }),
    ]);
    benchId = bench.id;
    runId = run.id;
    const plan = await prisma.workoutPlan.create({
      data: {
        userId,
        name: 'Push',
        exercises: { create: { exerciseId: benchId, order: 1, targetSets: 3, targetReps: '8-10' } },
      },
    });
    planId = plan.id;

    // Push (52 min, 1.000 kg), esteira antiga (4,6 km em duas séries) e esteira nova (5,1 km).
    const push = await prisma.workoutSession.create({
      data: {
        userId,
        planId,
        startedAt: at('2026-11-02T21:00:00Z'),
        completedAt: at('2026-11-02T21:52:00Z'),
        feeling: 2,
        notes: 'Joelho ok',
        sets: {
          create: [
            { exerciseId: benchId, setNumber: 1, weightKg: 50, reps: 10, rpe: 7 },
            { exerciseId: benchId, setNumber: 2, weightKg: 50, reps: 10, rpe: 8 },
          ],
        },
      },
    });
    pushId = push.id;
    await prisma.workoutSession.create({
      data: {
        userId,
        startedAt: at('2026-10-20T10:00:00Z'),
        completedAt: at('2026-10-20T10:30:00Z'),
        sets: {
          create: [
            { exerciseId: runId, setNumber: 1, distanceMeters: 3000, durationSeconds: 1200 },
            { exerciseId: runId, setNumber: 2, distanceMeters: 1600, durationSeconds: 600 },
          ],
        },
      },
    });
    const runSession = await prisma.workoutSession.create({
      data: {
        userId,
        startedAt: at('2026-11-03T10:00:00Z'),
        completedAt: at('2026-11-03T10:32:00Z'),
        feeling: 3,
        notes: 'Calor na academia',
        sets: {
          create: [
            {
              exerciseId: runId,
              setNumber: 1,
              distanceMeters: 5100,
              durationSeconds: 1920,
              avgHeartRate: 146,
              kcalBurned: 340,
            },
          ],
        },
      },
    });
    runSessionId = runSession.id;
    // Aberta: não entra no histórico nem nos totais.
    const open = await prisma.workoutSession.create({
      data: { userId, startedAt: at('2026-11-04T10:00:00Z') },
    });
    openId = open.id;
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.workoutPlan.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.exercise.deleteMany({ where: { createdByUserId: userId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  describe('tipo da sessão', () => {
    it('a lista diz o tipo de cada sessão e filtra por ele', async () => {
      const all = await sessions.list(userId, {});
      const kinds = new Map(all.map((s) => [s.id, s.kind]));
      expect(kinds.get(pushId)).toBe('plan');
      expect(kinds.get(runSessionId)).toBe('free');

      const free = await sessions.list(userId, { kind: 'free' });
      expect(free.every((s) => s.planId === null)).toBe(true);
      expect(free.map((s) => s.id)).toContain(runSessionId);
      expect(await sessions.list(userId, { kind: 'circuit' })).toEqual([]);
    });
  });

  describe('histórico', () => {
    it('totais e linhas só das sessões concluídas, mais recente primeiro', async () => {
      const h = await sessions.history(userId, {});
      expect(h.items.map((i) => i.id)).not.toContain(openId);
      expect(h.items[0]).toMatchObject({
        id: runSessionId,
        kind: 'free',
        title: null,
        feeling: 3,
        cardio: { distanceMeters: 5100, avgHeartRate: 146 },
      });
      expect(h.items[1]).toMatchObject({ id: pushId, kind: 'plan', title: 'Push', volumeKg: 1000 });
      // 3 sessões: 52 + 30 + 32 = 114 min → média 38. Volume só de força.
      expect(h.totals).toEqual({ sessions: 3, avgDurationMinutes: 38, volumeKg: 1000 });
      expect(h.nextCursor).toBeNull();
    });

    it('o filtro vale para a lista e para os totais', async () => {
      const h = await sessions.history(userId, { kind: 'plan' });
      expect(h.items.map((i) => i.id)).toEqual([pushId]);
      expect(h.totals).toEqual({ sessions: 1, avgDurationMinutes: 52, volumeKg: 1000 });
    });

    it('pagina pelo cursor', async () => {
      const first = await sessions.history(userId, { limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toBe(first.items[1]!.id);
      const rest = await sessions.history(userId, { limit: 2, cursor: first.nextCursor! });
      expect(rest.items).toHaveLength(1);
      expect(rest.nextCursor).toBeNull();
    });

    it('outra pessoa vê um histórico vazio, com totais zerados', async () => {
      await expect(sessions.history(otherId, {})).resolves.toEqual({
        totals: { sessions: 0, avgDurationMinutes: null, volumeKg: 0 },
        items: [],
        nextCursor: null,
      });
    });
  });

  describe('detalhe', () => {
    it('o resumo traz o tipo, as kcal e o recorde de distância com o de antes', async () => {
      const s = await sessions.summary(userId, runSessionId);
      expect(s.kind).toBe('free');
      expect(s.exercises[0]!.best).toMatchObject({ distanceMeters: 5100, kcalBurned: 340 });
      expect(s.records[0]).toMatchObject({
        exerciseId: runId,
        previous: { distanceMeters: 4600 },
      });
    });
  });

  describe('salvar como plano', () => {
    it('a esteira vira plano com a meta de cardio por distância', async () => {
      const plan = await plans.createFromSession(userId, runSessionId, {});
      expect(plan.userId).toBe(userId);
      expect(plan.name).toBe(`${stamp}-esteira`);
      expect(plan.exercises).toHaveLength(1);
      expect(plan.exercises[0]).toMatchObject({
        exerciseId: runId,
        targetSets: 1,
        cardioTarget: 'DISTANCE',
        cardioDistanceMeters: 5100,
        cardioDurationSeconds: 1920,
      });
    });

    it('o nome pode vir de quem salva; força guarda séries, faixa e carga', async () => {
      const plan = await plans.createFromSession(userId, pushId, { name: 'Push de novo' });
      expect(plan.name).toBe('Push de novo');
      expect(plan.exercises[0]).toMatchObject({
        exerciseId: benchId,
        targetSets: 2,
        targetReps: '10',
        startLoadKg: 50,
      });
    });

    it('sessão de outra pessoa é 404, igual a inexistente', async () => {
      await expect(plans.createFromSession(otherId, runSessionId, {})).rejects.toThrow(
        NotFoundException,
      );
      expect(await prisma.workoutPlan.count({ where: { userId: otherId } })).toBe(0);
    });

    it('sessão sem série não tem o que virar plano', async () => {
      const empty = await prisma.workoutSession.create({
        data: {
          userId,
          startedAt: at('2026-10-01T10:00:00Z'),
          completedAt: at('2026-10-01T10:05:00Z'),
        },
      });
      await expect(plans.createFromSession(userId, empty.id, {})).rejects.toThrow(
        BadRequestException,
      );
      await prisma.workoutSession.delete({ where: { id: empty.id } });
    });
  });

  describe('recordes', () => {
    it('o recorde de distância do cardio soma as séries da sessão', async () => {
      const records = await sets.listPersonalRecords(userId);
      const run = records.find((r) => r.exerciseId === runId);
      expect(run).toMatchObject({ type: 'cardio', maxDistanceMeters: 5100 });

      // Uma sessão de 3 séries curtas (2 + 2 + 2 km) bate a de 5,1 km em uma.
      const s = await prisma.workoutSession.create({
        data: {
          userId,
          startedAt: at('2026-11-05T10:00:00Z'),
          completedAt: at('2026-11-05T10:40:00Z'),
          sets: {
            create: [1, 2, 3].map((n) => ({
              exerciseId: runId,
              setNumber: n,
              distanceMeters: 2000,
              durationSeconds: 700,
            })),
          },
        },
      });
      const after = (await sets.listPersonalRecords(userId)).find((r) => r.exerciseId === runId);
      expect(after).toMatchObject({ maxDistanceMeters: 6000, bestDurationSeconds: 2100 });
      await prisma.workoutSession.delete({ where: { id: s.id } });
    });
  });
});
