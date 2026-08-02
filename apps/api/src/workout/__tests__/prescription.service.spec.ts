import { NotFoundException } from '@nestjs/common';
import { PrescriptionService } from '../prescription.service';
import type { PrismaService } from '../../common/prisma.service';
import type { SessionSetService } from '../session-set.service';

type MockPrisma = {
  exercise: { findFirst: jest.Mock };
  workoutSession: { findMany: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  exercise: { findFirst: jest.fn() },
  workoutSession: { findMany: jest.fn() },
});

const strengthExercise = {
  id: 1,
  name: 'Supino reto',
  muscleGroup: 'peito',
  mechanic: 'compound',
  createdByUserId: null,
  clonedFromId: null,
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

/** Duas sessões iguais, o mínimo que a prescrição aceita. */
const twoSessions = (weightKg: number, reps: number, rpe: number | null) => [
  { startedAt: new Date(now), sets: [{ weightKg, reps, rpe }] },
  { startedAt: new Date(now - 10 * DAY), sets: [{ weightKg, reps, rpe }] },
];

describe('PrescriptionService', () => {
  let prisma: MockPrisma;
  let sets: { getPersonalRecord: jest.Mock };
  let service: PrescriptionService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    sets = { getPersonalRecord: jest.fn().mockResolvedValue(null) };
    service = new PrescriptionService(
      prisma as unknown as PrismaService,
      sets as unknown as SessionSetService,
    );
    prisma.exercise.findFirst.mockResolvedValue(strengthExercise);
    prisma.workoutSession.findMany.mockResolvedValue([]);
  });

  it('não vaza histórico de outro usuário', async () => {
    prisma.workoutSession.findMany.mockResolvedValue(twoSessions(60, 12, 7));

    await service.forExercise(userId, 1);

    const where = prisma.workoutSession.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(userId);
    // Sem RLS no Postgres (ADR 010), este filtro é a única barreira que existe.
    expect(JSON.stringify(where)).toContain(userId);
  });

  it('só encontra exercício público ou do próprio usuário', async () => {
    await service.forExercise(userId, 1).catch(() => undefined);

    expect(prisma.exercise.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
    });
  });

  it('responde NOT_FOUND para exercício inexistente ou de outra conta', async () => {
    // Mesmo erro nos dois casos: o id de `Exercise` é inteiro sequencial, e um
    // 403 aqui viraria oráculo de existência (#92).
    prisma.exercise.findFirst.mockResolvedValue(null);

    await expect(service.forExercise(userId, 999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('não prescreve carga para exercício de cardio', async () => {
    prisma.exercise.findFirst.mockResolvedValue({
      ...strengthExercise,
      id: 2,
      muscleGroup: 'cardio',
    });

    await expect(service.forExercise(userId, 2)).resolves.toEqual({ status: 'cardio_exercise' });
    expect(prisma.workoutSession.findMany).not.toHaveBeenCalled();
  });

  it('devolve insufficient_history quando o exercício tem uma sessão só', async () => {
    prisma.workoutSession.findMany.mockResolvedValue([
      { startedAt: new Date(now), sets: [{ weightKg: 60, reps: 12, rpe: 7 }] },
    ]);

    await expect(service.forExercise(userId, 1)).resolves.toEqual({
      status: 'insufficient_history',
    });
  });

  it('limita a busca às últimas 3 sessões, ordenadas da mais recente', async () => {
    await service.forExercise(userId, 1);

    const args = prisma.workoutSession.findMany.mock.calls[0][0];
    expect(args.take).toBe(3);
    expect(args.orderBy).toEqual({ startedAt: 'desc' });
  });

  it('descarta série sem carga ou sem repetição na origem', async () => {
    await service.forExercise(userId, 1);

    const args = prisma.workoutSession.findMany.mock.calls[0][0];
    expect(args.where.sets.some).toMatchObject({
      weightKg: { not: null },
      reps: { not: null },
    });
    // O mesmo filtro precisa valer no carregamento das séries: sem ele, uma
    // sessão de força com uma série de cardio no meio traria `weightKg: null`
    // para dentro da aritmética.
    expect(args.select.sets.where).toMatchObject({
      weightKg: { not: null },
      reps: { not: null },
    });
  });

  it('herda o histórico do exercício de origem quando o exercício é um clone', async () => {
    // Clonar para renomear cria um id novo; sem seguir `clonedFromId`, a
    // prescrição sumiria no dia em que a pessoa edita o nome do exercício.
    prisma.exercise.findFirst.mockResolvedValue({
      ...strengthExercise,
      id: 501,
      createdByUserId: userId,
      clonedFromId: 1,
    });

    await service.forExercise(userId, 501);

    const args = prisma.workoutSession.findMany.mock.calls[0][0];
    expect(args.where.sets.some.exerciseId).toEqual({ in: [501, 1] });
  });

  it('busca só o próprio exercício quando ele não é clone', async () => {
    await service.forExercise(userId, 1);

    const args = prisma.workoutSession.findMany.mock.calls[0][0];
    expect(args.where.sets.some.exerciseId).toEqual({ in: [1] });
  });

  it('reusa o recorde pessoal como teto absoluto da sugestão', async () => {
    prisma.workoutSession.findMany.mockResolvedValue(twoSessions(100, 12, 6));
    // Recorde abaixo da base — só acontece no clone, porque
    // `getPersonalRecord` olha só o id pedido. É o caso em que o teto morde.
    sets.getPersonalRecord.mockResolvedValue({
      weightKg: 90,
      reps: 5,
      sessionDate: new Date(now),
    });

    await expect(service.forExercise(userId, 1)).resolves.toMatchObject({
      status: 'ok',
      weightKg: 100,
      capped: true,
    });
    expect(sets.getPersonalRecord).toHaveBeenCalledWith(userId, 1);
  });

  it('prescreve a partir do histórico e da faixa alvo recebida', async () => {
    prisma.workoutSession.findMany.mockResolvedValue(twoSessions(60, 12, 7));

    await expect(service.forExercise(userId, 1, '8-12')).resolves.toEqual({
      status: 'ok',
      weightKg: 62.5,
      reps: 8,
      restSeconds: 90,
      basis: 'rpe',
      action: 'increase_load',
      capped: false,
    });
  });

  it('trata recorde de cardio como recorde ausente', async () => {
    // `getPersonalRecord` devolve uma união; o ramo de cardio não tem `weightKg`
    // e não pode virar `undefined` dentro da aritmética.
    prisma.workoutSession.findMany.mockResolvedValue(twoSessions(60, 12, 7));
    sets.getPersonalRecord.mockResolvedValue({
      distanceMeters: 5000,
      durationSeconds: 1800,
      sessionDate: new Date(now),
    });

    await expect(service.forExercise(userId, 1)).resolves.toMatchObject({ weightKg: 62.5 });
  });
});
