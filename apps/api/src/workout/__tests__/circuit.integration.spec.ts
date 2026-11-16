import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CircuitSessionService } from '../circuit-session.service';
import { WorkoutPlanService } from '../workout-plan.service';
import { WorkoutSessionService } from '../workout-session.service';
import type { SaveCircuitDto } from '../dto/circuit.dto';

/**
 * Circuito de ponta a ponta no banco (#380): criar o AMRAP 12 com 4
 * exercícios, começar, guardar os toques, encerrar, e ver rounds, tempo por
 * round e a comparação no "Treino feito". É o critério de pronto da issue.
 */
describe('circuitos (banco real)', () => {
  const prisma = new PrismaService();
  const plans = new WorkoutPlanService(prisma);
  const sessions = new WorkoutSessionService(prisma);
  const circuits = new CircuitSessionService(prisma);
  const stamp = `circuito-${Date.now()}`;
  let userId: string;
  let otherId: string;
  let exerciseIds: number[];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
    userId = (
      await prisma.user.create({
        data: { logtoSub: stamp, email: `${stamp}@test.local`, name: 'Circuito' },
      })
    ).id;
    otherId = (
      await prisma.user.create({
        data: { logtoSub: `${stamp}-b`, email: `${stamp}-b@test.local`, name: 'Vizinho' },
      })
    ).id;
    const catalog = await prisma.exercise.findMany({
      where: { createdByUserId: null, groupOwned: false },
      orderBy: { id: 'asc' },
      take: 4,
      select: { id: true },
    });
    exerciseIds = catalog.map((e) => e.id);
    if (exerciseIds.length < 4) throw new Error('Rode o seed:exercises no banco de teste.');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  const amrap = (): SaveCircuitDto => ({
    name: 'AMRAP 12',
    format: 'AMRAP',
    durationSeconds: 720,
    rounds: 9, // de outro formato: some
    exercises: [
      { exerciseId: exerciseIds[0], unit: 'REPS', target: 15 },
      { exerciseId: exerciseIds[1], unit: 'REPS', target: 10 },
      { exerciseId: exerciseIds[2], unit: 'REPS', target: 8 },
      { exerciseId: exerciseIds[3], unit: 'SECONDS', target: 30 },
    ],
  });

  it('cria o circuito como plano CIRCUIT, com a configuração só do formato', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    expect(plan.kind).toBe('CIRCUIT');
    expect(plan.circuit).toMatchObject({ format: 'AMRAP', durationSeconds: 720, rounds: null });
    expect(plan.exercises.map((e) => [e.targetReps, e.repUnit])).toEqual([
      ['15', 'REPS'],
      ['10', 'REPS'],
      ['8', 'REPS'],
      ['30', 'SECONDS'],
    ]);
    const listed = await plans.list(userId);
    expect(listed.find((p) => p.id === plan.id)?.circuit?.format).toBe('AMRAP');
  });

  it('recusa formato sem o campo dele e exercício repetido', async () => {
    await expect(
      plans.createCircuit(userId, { ...amrap(), durationSeconds: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const dto = amrap();
    dto.exercises[1] = dto.exercises[0];
    await expect(plans.createCircuit(userId, dto)).rejects.toThrow(/já está no circuito/);
  });

  it('editar troca formato e exercícios; plano de séries não vira circuito por aqui', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const edited = await plans.replaceCircuit(userId, plan.id, {
      name: 'For Time 3',
      format: 'FOR_TIME',
      rounds: 3,
      restBetweenRoundsSeconds: 60,
      exercises: [{ exerciseId: exerciseIds[1], unit: 'REPS', target: 12 }],
    });
    expect(edited.circuit).toMatchObject({
      format: 'FOR_TIME',
      rounds: 3,
      restBetweenRoundsSeconds: 60,
      durationSeconds: null,
    });
    expect(edited.exercises).toHaveLength(1);
    const strength = await plans.create(userId, { name: 'Push' });
    await expect(plans.replaceCircuit(userId, strength.id, amrap())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('AMRAP de ponta a ponta: começar, toques, encerrar, Treino feito e a comparação', async () => {
    const plan = await plans.createCircuit(userId, amrap());

    // Primeira vez: 3 rounds.
    const first = await sessions.start(userId, { planId: plan.id });
    const json = first.circuit as { definition: { exercises: unknown[] }; events: unknown[] };
    expect(json.definition.exercises).toHaveLength(4);
    await circuits.finish(userId, first.id, {
      events: [],
      result: {
        roundsCompleted: 3,
        partialExercises: 0,
        roundSeconds: [200, 220, 240],
        partialRoundSeconds: 60,
        elapsedSeconds: 720,
        completed: true,
      },
    });

    // Segunda vez: 4 rounds e 2 exercícios.
    const second = await sessions.start(userId, { planId: plan.id });
    const t = new Date(second.startedAt).getTime();
    await circuits.saveProgress(userId, second.id, [
      { type: 'mark', at: t + 30_000 },
      { type: 'pause', at: t + 40_000 },
    ]);
    const reread = await sessions.findById(userId, second.id);
    expect((reread.circuit as { events: unknown[] }).events).toHaveLength(2);

    const finished = await circuits.finish(userId, second.id, {
      events: [{ type: 'mark', at: t + 30_000 }],
      result: {
        roundsCompleted: 4,
        partialExercises: 2,
        roundSeconds: [138, 144, 151, 160],
        partialRoundSeconds: 127,
        elapsedSeconds: 720,
        completed: true,
      },
      feeling: 5,
    });
    expect(finished.result.totalReps).toBe(4 * 33 + 15 + 10);

    // Uma série por exercício por round, mais as do round parcial.
    const sets = await prisma.sessionSet.findMany({ where: { sessionId: second.id } });
    expect(sets).toHaveLength(4 * 4 + 2);

    // Repetir o "Encerrar" não duplica.
    const again = await circuits.finish(userId, second.id, {
      events: [],
      result: { ...finishedResult(), roundsCompleted: 9 },
    });
    expect(again.alreadyFinished).toBe(true);
    expect(await prisma.sessionSet.count({ where: { sessionId: second.id } })).toBe(18);

    const summary = await sessions.summary(userId, second.id);
    expect(summary.circuit).toMatchObject({
      format: 'AMRAP',
      roundsCompleted: 4,
      partialExercises: 2,
      roundSeconds: [138, 144, 151, 160],
      partialRoundSeconds: 127,
      averageRoundSeconds: 148,
      previous: { sessionId: first.id, roundsCompleted: 3 },
      comparison: { verdict: 'better', roundsDelta: 1 },
    });
    expect(summary.circuit?.stoppedAt?.exerciseId).toBe(exerciseIds[2]);
    expect(summary.feeling).toBe(5);

    // Progresso depois do fim não reabre nada.
    await expect(circuits.saveProgress(userId, second.id, [])).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('confere o resultado contra o circuito', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const s = await sessions.start(userId, { planId: plan.id });
    await expect(
      circuits.finish(userId, s.id, {
        events: [],
        result: { ...finishedResult(), partialExercises: 4 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      circuits.saveProgress(userId, s.id, [{ type: 'mark', at: Date.now() + 3_600_000 }]),
    ).rejects.toThrow(/fora do circuito/);
    await sessions.delete(userId, s.id);
  });

  it('registrar sem relógio (MCP) cria a sessão terminada com as séries', async () => {
    const plan = await plans.createCircuit(userId, {
      name: 'Tabata',
      format: 'TABATA',
      workSeconds: 20,
      restSeconds: 10,
      intervals: 8,
      exercises: [
        { exerciseId: exerciseIds[0], unit: 'SECONDS', target: 20 },
        { exerciseId: exerciseIds[1], unit: 'REPS', target: 10 },
      ],
    });
    const logged = await circuits.log(userId, { planId: plan.id });
    expect(logged.result).toMatchObject({
      intervalsCompleted: 8,
      elapsedSeconds: 240,
      completed: true,
    });
    const session = await prisma.workoutSession.findUniqueOrThrow({
      where: { id: logged.sessionId },
    });
    expect(session.completedAt).not.toBeNull();
    expect(await prisma.sessionSet.count({ where: { sessionId: logged.sessionId } })).toBe(8);
  });

  it('outra pessoa não lê, não começa, não edita e não encerra o circuito', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    await expect(plans.replaceCircuit(otherId, plan.id, amrap())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(sessions.start(otherId, { planId: plan.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(circuits.log(otherId, { planId: plan.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const mine = await sessions.start(userId, { planId: plan.id });
    await expect(circuits.saveProgress(otherId, mine.id, [])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      circuits.finish(otherId, mine.id, { events: [], result: finishedResult() }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      circuits.log(otherId, { planId: plan.id, sessionId: mine.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await sessions.delete(userId, mine.id);
  });
});

function finishedResult() {
  return {
    roundsCompleted: 1,
    partialExercises: 0,
    roundSeconds: [100],
    partialRoundSeconds: null,
    elapsedSeconds: 720,
    completed: true,
  };
}
