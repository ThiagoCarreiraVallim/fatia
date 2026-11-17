import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CircuitSessionService } from '../circuit-session.service';
import { WorkoutPlanService } from '../workout-plan.service';
import { WorkoutSessionService } from '../workout-session.service';
import type { SaveCircuitDto } from '../dto/circuit.dto';
import { ExerciseService } from '../exercise.service';
import { PlanMaterializerService } from '../../sharing/plan-materializer.service';
import { buildPlanSnapshot, planSnapshotSchema } from '../../sharing/plan-snapshot';
import { AccountService } from '../../users/account.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import type { CheckpointPurgeService } from '../../chat/checkpoint-purge.service';

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

  /** Toques de N rounds completos do AMRAP 12 (4 exercícios), um por 10 s, desde `t`. */
  const roundsOfMarks = (t: number, rounds: number, extra = 0) =>
    Array.from({ length: rounds * 4 + extra }, (_, i) => ({
      type: 'mark' as const,
      at: t + (i + 1) * 10_000,
    }));

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

    // Primeira vez: 3 rounds de 40 s, e o tempo (12 min) acabou há tempo.
    const firstStart = new Date(Date.now() - 30 * 60_000);
    const first = await sessions.start(userId, {
      planId: plan.id,
      startedAt: firstStart.toISOString(),
    });
    const json = first.circuit as { definition: { exercises: unknown[] }; events: unknown[] };
    expect(json.definition.exercises).toHaveLength(4);
    const firstDone = await circuits.finish(userId, first.id, {
      events: roundsOfMarks(firstStart.getTime(), 3),
    });
    expect(firstDone.result).toMatchObject({ roundsCompleted: 3, completed: true });

    // Segunda vez: 4 rounds e 2 exercícios. A sessão já nasce com a última
    // vez, para a tela comparar no fim (Al-T4e) antes de salvar.
    const secondStart = new Date(Date.now() - 15 * 60_000);
    const second = await sessions.start(userId, {
      planId: plan.id,
      startedAt: secondStart.toISOString(),
    });
    expect((second.circuit as { previous: unknown }).previous).toMatchObject({
      roundsCompleted: 3,
      partialExercises: 0,
      finalTimeSeconds: null,
    });
    expect((first.circuit as { previous: unknown }).previous).toBeNull();
    const t = secondStart.getTime();
    await circuits.saveProgress(userId, second.id, [
      { type: 'mark', at: t + 30_000 },
      { type: 'pause', at: t + 40_000 },
    ]);
    const reread = await sessions.findById(userId, second.id);
    expect((reread.circuit as { events: unknown[] }).events).toHaveLength(2);

    const finished = await circuits.finish(userId, second.id, {
      events: roundsOfMarks(t, 4, 2),
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
      roundSeconds: [40, 40, 40, 40],
      partialRoundSeconds: 720 - 160,
      averageRoundSeconds: 40,
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

  it('a janela dos toques conta do começo da sessão, não do relógio do servidor (revisão C2)', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    // Aparelho 10 min adiantado: o começo e os toques vêm no relógio dele.
    const ahead = Date.now() + 10 * 60_000;
    const s = await sessions.start(userId, {
      planId: plan.id,
      startedAt: new Date(ahead).toISOString(),
    });
    await expect(
      circuits.saveProgress(userId, s.id, [{ type: 'mark', at: ahead + 30_000 }]),
    ).resolves.toEqual({ events: 1 });
    // Fora de [começo − 1 min, começo + 6 h] é relógio errado ou corpo forjado.
    await expect(
      circuits.saveProgress(userId, s.id, [{ type: 'mark', at: ahead - 2 * 60_000 }]),
    ).rejects.toThrow(/fora do circuito/);
    await expect(
      circuits.saveProgress(userId, s.id, [{ type: 'mark', at: ahead + 7 * 3_600_000 }]),
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
    // O retrato do plano, como no start(): apagar o circuito não apaga o nome.
    expect(session).toMatchObject({ fromPlan: true, planName: 'Tabata' });
  });

  it('no histórico o circuito é "circuito", com filtro próprio e fora de Planos (#381, Al-T10)', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const logged = await circuits.log(userId, {
      planId: plan.id,
      roundsCompleted: 2,
      partialExercises: 1,
    });
    const all = await sessions.history(userId, {});
    const row = all.items.find((i) => i.id === logged.sessionId);
    expect(row?.kind).toBe('circuit');
    expect(row?.circuit).toEqual({
      format: 'AMRAP',
      roundsCompleted: 2,
      partialExercises: 1,
      intervalsCompleted: null,
      exercises: 4,
    });
    const onlyCircuits = await sessions.history(userId, { kind: 'circuit' });
    expect(onlyCircuits.items.map((i) => i.id)).toContain(logged.sessionId);
    expect(onlyCircuits.items.every((i) => i.kind === 'circuit')).toBe(true);
    const onlyPlans = await sessions.history(userId, { kind: 'plan' });
    expect(onlyPlans.items.map((i) => i.id)).not.toContain(logged.sessionId);
    const listed = await sessions.list(userId, { kind: 'circuit' });
    expect(listed.map((s) => s.id)).toContain(logged.sessionId);
    const summary = await sessions.summary(userId, logged.sessionId);
    expect(summary.kind).toBe('circuit');
  });

  it('"Salvar como plano" recusa o circuito com 400, sem criar plano (#381)', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const logged = await circuits.log(userId, { planId: plan.id, roundsCompleted: 1 });
    const before = await prisma.workoutPlan.count({ where: { userId } });
    const attempt = plans.createFromSession(userId, logged.sessionId, {});
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(plans.createFromSession(userId, logged.sessionId, {})).rejects.toThrow(
      'Circuito não vira plano de força',
    );
    expect(await prisma.workoutPlan.count({ where: { userId } })).toBe(before);
  });

  it('o fim conta pelos toques, não pelo resultado que o cliente manda (revisão C1)', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const startedAt = new Date(Date.now() - 5 * 60_000);
    const s = await sessions.start(userId, { planId: plan.id, startedAt: startedAt.toISOString() });
    const t = startedAt.getTime();
    // 2 rounds e 1 exercício pelos toques; o corpo diz 10.000 rounds.
    const finished = await circuits.finish(userId, s.id, {
      events: roundsOfMarks(t, 2, 1),
      result: { ...finishedResult(), roundsCompleted: 10_000, roundSeconds: [] },
    });
    expect(finished.result).toMatchObject({
      roundsCompleted: 2,
      partialExercises: 1,
      roundSeconds: [40, 40],
      completed: false,
    });
    expect(await prisma.sessionSet.count({ where: { sessionId: s.id } })).toBe(9);
    // O "Encerrar" que faltava entra no fim, na hora do servidor.
    const json = (await prisma.workoutSession.findUniqueOrThrow({ where: { id: s.id } }))
      .circuit as { events: { type: string }[] };
    expect(json.events.at(-1)?.type).toBe('end');
  });

  it('toques forjados ("+1 round" em rajada) além do que cabe no tempo são 400, sem séries', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const startedAt = new Date(Date.now() - 60_000);
    const s = await sessions.start(userId, { planId: plan.id, startedAt: startedAt.toISOString() });
    const t = startedAt.getTime();
    const burst = Array.from({ length: 500 }, (_, i) => ({ type: 'round' as const, at: t + i }));
    await expect(
      circuits.finish(userId, s.id, { events: burst, result: finishedResult() }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.sessionSet.count({ where: { sessionId: s.id } })).toBe(0);
    await sessions.delete(userId, s.id);
  });

  it('registrar sem relógio confere as faixas (o repro de 10.000 rounds)', async () => {
    const plan = await plans.createCircuit(userId, {
      name: 'AMRAP de reps',
      format: 'AMRAP',
      durationSeconds: 720,
      exercises: exerciseIds.map((exerciseId) => ({
        exerciseId,
        unit: 'REPS' as const,
        target: 10,
      })),
    });
    const before = await prisma.workoutSession.count({ where: { userId } });
    await expect(
      circuits.log(userId, { planId: plan.id, roundsCompleted: 10_000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      circuits.log(userId, { planId: plan.id, roundsCompleted: 3, elapsedSeconds: 9_000 }),
    ).rejects.toThrow(/tempo/);
    await expect(
      circuits.log(userId, { planId: plan.id, roundsCompleted: 3, roundSeconds: [100] }),
    ).rejects.toThrow(/tempo de round/);
    expect(await prisma.workoutSession.count({ where: { userId } })).toBe(before);

    const forTime = await plans.createCircuit(userId, {
      name: 'For Time 3',
      format: 'FOR_TIME',
      rounds: 3,
      exercises: [{ exerciseId: exerciseIds[0], unit: 'REPS', target: 10 }],
    });
    // Tempo final sem terminar os rounds, zero, ou menor que a soma dos rounds.
    await expect(
      circuits.log(userId, { planId: forTime.id, roundsCompleted: 2, finalTimeSeconds: 600 }),
    ).rejects.toThrow(/tempo final/);
    await expect(circuits.log(userId, { planId: forTime.id, finalTimeSeconds: 0 })).rejects.toThrow(
      /tempo final/,
    );
    await expect(
      circuits.log(userId, {
        planId: forTime.id,
        finalTimeSeconds: 100,
        roundSeconds: [100, 100, 100],
      }),
    ).rejects.toThrow(/tempo final/);
    const ok = await circuits.log(userId, {
      planId: forTime.id,
      finalTimeSeconds: 330,
      roundSeconds: [100, 110, 120],
    });
    expect(ok.result).toMatchObject({ roundsCompleted: 3, finalTimeSeconds: 330, completed: true });
  });

  it('registrar numa sessão aberta não passa do tempo desde o começo dela', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const s = await sessions.start(userId, {
      planId: plan.id,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await expect(
      circuits.log(userId, {
        planId: plan.id,
        sessionId: s.id,
        roundsCompleted: 2,
        elapsedSeconds: 700,
      }),
    ).rejects.toThrow(/tempo/);
    await sessions.delete(userId, s.id);
  });

  it('o fim é atômico: se as séries falham, a sessão segue aberta (revisão C3)', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const startedAt = new Date(Date.now() - 20 * 60_000);
    const s = await sessions.start(userId, { planId: plan.id, startedAt: startedAt.toISOString() });
    const boom = () => Promise.reject(new Error('falha ao gravar as séries'));
    // O mesmo banco, com a escrita das séries quebrada (fora e dentro da transação).
    const broken = new Proxy(prisma, {
      get(target, key, receiver) {
        if (key === 'sessionSet') return { createMany: boom };
        if (key === '$transaction') {
          return (fn: (tx: unknown) => Promise<unknown>) =>
            target.$transaction((tx) =>
              fn(
                new Proxy(tx, {
                  get: (t, k) => (k === 'sessionSet' ? { createMany: boom } : Reflect.get(t, k)),
                }),
              ),
            );
        }
        const value = Reflect.get(target, key, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const fragile = new CircuitSessionService(broken);
    await expect(
      fragile.finish(userId, s.id, { events: roundsOfMarks(startedAt.getTime(), 1) }),
    ).rejects.toThrow('falha ao gravar as séries');
    const after = await prisma.workoutSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.completedAt).toBeNull();
    expect((after.circuit as { result: unknown }).result).toBeNull();
    // E o "Encerrar" de novo, com o banco bom, fecha normalmente.
    const ok = await circuits.finish(userId, s.id, {
      events: roundsOfMarks(startedAt.getTime(), 1),
    });
    expect(ok.result.roundsCompleted).toBe(1);
  });

  it('exercício pessoal apagado depois do começo: o fim grava as séries dos outros (revisão C3)', async () => {
    const custom = await prisma.exercise.create({
      data: { name: `${stamp}-pessoal`, muscleGroup: 'pernas', createdByUserId: userId },
    });
    const plan = await plans.createCircuit(userId, {
      ...amrap(),
      exercises: [
        { exerciseId: exerciseIds[0], unit: 'REPS', target: 15 },
        { exerciseId: custom.id, unit: 'REPS', target: 10 },
      ],
    });
    const startedAt = new Date(Date.now() - 20 * 60_000);
    const s = await sessions.start(userId, { planId: plan.id, startedAt: startedAt.toISOString() });
    // Tira o exercício do circuito e o apaga, com a sessão (e o retrato) ainda aberta.
    await plans.replaceCircuit(userId, plan.id, {
      ...amrap(),
      exercises: [{ exerciseId: exerciseIds[0], unit: 'REPS', target: 15 }],
    });
    await new ExerciseService(prisma).deleteCustom(userId, custom.id);
    const t = startedAt.getTime();
    const marks = Array.from({ length: 4 }, (_, i) => ({
      type: 'mark' as const,
      at: t + (i + 1) * 10_000,
    }));
    const done = await circuits.finish(userId, s.id, { events: marks });
    expect(done.result.roundsCompleted).toBe(2);
    const sets = await prisma.sessionSet.findMany({ where: { sessionId: s.id } });
    expect(sets.map((x) => x.exerciseId)).toEqual([exerciseIds[0], exerciseIds[0]]);
  });

  it('o fim genérico não fecha circuito sem resultado: 409 apontando o log_circuit_result (revisão C4)', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const s = await sessions.start(userId, { planId: plan.id });
    await expect(sessions.finish(userId, s.id, {})).rejects.toBeInstanceOf(ConflictException);
    await expect(sessions.finish(userId, s.id, {})).rejects.toThrow(/log_circuit_result/);
    const still = await prisma.workoutSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(still.completedAt).toBeNull();
    // Com o resultado já gravado, o fim genérico só acerta sensação e nota.
    await circuits.log(userId, {
      planId: plan.id,
      sessionId: s.id,
      roundsCompleted: 0,
      elapsedSeconds: 30,
    });
    await expect(sessions.finish(userId, s.id, { feeling: 3 })).resolves.toMatchObject({
      feeling: 3,
    });
  });

  it('circuito fechado sem resultado (antes da correção) ainda recebe o resultado (revisão C4)', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const startedAt = new Date(Date.now() - 30 * 60_000);
    const viaClock = await sessions.start(userId, {
      planId: plan.id,
      startedAt: startedAt.toISOString(),
    });
    const closedAt = new Date(startedAt.getTime() + 12 * 60_000);
    await prisma.workoutSession.update({
      where: { id: viaClock.id },
      data: { completedAt: closedAt },
    });
    const attached = await circuits.finish(userId, viaClock.id, {
      events: roundsOfMarks(startedAt.getTime(), 2),
    });
    expect(attached).toMatchObject({ alreadyFinished: false, result: { roundsCompleted: 2 } });
    const row = await prisma.workoutSession.findUniqueOrThrow({ where: { id: viaClock.id } });
    expect(row.completedAt).toEqual(closedAt);
    expect(await prisma.sessionSet.count({ where: { sessionId: viaClock.id } })).toBe(8);

    const viaMcp = await sessions.start(userId, {
      planId: plan.id,
      startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    });
    await prisma.workoutSession.update({
      where: { id: viaMcp.id },
      data: { completedAt: new Date() },
    });
    const logged = await circuits.log(userId, {
      planId: plan.id,
      sessionId: viaMcp.id,
      roundsCompleted: 3,
    });
    expect(logged).toMatchObject({ alreadyFinished: false, result: { roundsCompleted: 3 } });
    // Já com resultado, repetir devolve o mesmo fim.
    const again = await circuits.log(userId, {
      planId: plan.id,
      sessionId: viaMcp.id,
      roundsCompleted: 5,
    });
    expect(again).toMatchObject({ alreadyFinished: true, result: { roundsCompleted: 3 } });
  });

  it('fim com o teto de toques cheio: o "end" do servidor cabe e o resumo lê (revisão C7)', async () => {
    const plan = await plans.createCircuit(userId, {
      name: 'For Time 100',
      format: 'FOR_TIME',
      rounds: 100,
      exercises: [{ exerciseId: exerciseIds[0], unit: 'REPS', target: 5 }],
    });
    const startedAt = new Date(Date.now() - 60 * 60_000);
    const s = await sessions.start(userId, { planId: plan.id, startedAt: startedAt.toISOString() });
    const t = startedAt.getTime();
    // 2.000 toques de "Pular descanso" sem o "end" (cliente antigo): nenhum round.
    const events = Array.from({ length: 2000 }, (_, i) => ({ type: 'skip' as const, at: t + i }));
    await circuits.finish(userId, s.id, { events });
    const summary = await sessions.summary(userId, s.id);
    expect(summary.circuit).not.toBeNull();
    expect(summary.kind).toBe('circuit');
  });

  it('só compara com a última vez do mesmo circuito: editar formato ou exercícios zera (revisão C8)', async () => {
    const plan = await plans.createCircuit(userId, amrap());
    const firstStart = new Date(Date.now() - 50 * 60_000);
    const first = await sessions.start(userId, {
      planId: plan.id,
      startedAt: firstStart.toISOString(),
    });
    await circuits.finish(userId, first.id, { events: roundsOfMarks(firstStart.getTime(), 3) });

    // Mesmo plano, outro circuito: 3 exercícios em vez de 4.
    await plans.replaceCircuit(userId, plan.id, {
      ...amrap(),
      exercises: amrap().exercises.slice(0, 3),
    });
    const secondStart = new Date(Date.now() - 30 * 60_000);
    const second = await sessions.start(userId, {
      planId: plan.id,
      startedAt: secondStart.toISOString(),
    });
    expect((second.circuit as { previous: unknown }).previous).toBeNull();
    await circuits.finish(userId, second.id, { events: [] });
    const summary = await sessions.summary(userId, second.id);
    expect(summary.circuit?.previous).toBeNull();
    expect(summary.circuit?.comparison).toBeNull();

    // A próxima do mesmo circuito editado compara com a segunda, e não com a primeira.
    const third = await sessions.start(userId, {
      planId: plan.id,
      startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect((third.circuit as { previous: { sessionId: string } | null }).previous?.sessionId).toBe(
      second.id,
    );
    await sessions.delete(userId, third.id);
  });

  it('o retrato do plano (modelo da comunidade, oferta da equipe) leva o circuito', async () => {
    const plan = await plans.createCircuit(userId, {
      name: 'For Time 5',
      format: 'FOR_TIME',
      rounds: 5,
      restBetweenRoundsSeconds: 30,
      exercises: [
        { exerciseId: exerciseIds[0], unit: 'REPS', target: 12 },
        { exerciseId: exerciseIds[3], unit: 'SECONDS', target: 30 },
      ],
    });
    const snapshot = buildPlanSnapshot(plan);
    expect(snapshot.circuit).toEqual({
      format: 'FOR_TIME',
      rounds: 5,
      restBetweenRoundsSeconds: 30,
    });

    const materializer = new PlanMaterializerService(prisma, new ExerciseService(prisma));
    const adopted = await materializer.materialize(otherId, snapshot);
    const copy = await plans.findById(otherId, adopted.id);
    expect(copy.kind).toBe('CIRCUIT');
    expect(copy.circuit).toMatchObject({
      format: 'FOR_TIME',
      rounds: 5,
      restBetweenRoundsSeconds: 30,
    });
    expect(copy.exercises.map((e) => [e.targetReps, e.repUnit])).toEqual([
      ['12', 'REPS'],
      ['30', 'SECONDS'],
    ]);

    // Retrato forjado com circuito incoerente recusa antes de escrever.
    const bad = { ...snapshot, circuit: { format: 'AMRAP' } };
    expect(planSnapshotSchema.safeParse(bad).success).toBe(true);
    await expect(materializer.materialize(otherId, bad)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a exportação (LGPD) leva a configuração do circuito e o resultado com o tempo por round', async () => {
    const account = new AccountService(
      prisma,
      {} as LogtoManagementService,
      {} as CheckpointPurgeService,
    );
    const data = (await account.exportData(userId)) as unknown as {
      workoutPlans: Array<{ kind: string; circuit: { format: string } | null }>;
      workoutSessions: Array<{ circuit: { result: { roundSeconds: number[] } | null } | null }>;
    };
    expect(
      data.workoutPlans.some((p) => p.kind === 'CIRCUIT' && p.circuit?.format === 'AMRAP'),
    ).toBe(true);
    expect(
      data.workoutSessions.some((s) => s.circuit?.result?.roundSeconds.join() === '40,40,40,40'),
    ).toBe(true);
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
