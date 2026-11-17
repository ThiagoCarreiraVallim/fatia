import { describe, expect, it } from 'vitest';
import {
  circuitAlarms,
  circuitCue,
  circuitResult,
  circuitState,
  type CircuitDefinition,
  type CircuitEvent,
  type CircuitRun,
} from '../workout/circuit-timer';

const T0 = Date.UTC(2026, 10, 16, 18, 0, 0);
const at = (seconds: number) => T0 + seconds * 1000;

const ex = (exerciseId: number, name: string, unit: 'REPS' | 'SECONDS', target: number) => ({
  exerciseId,
  name,
  muscleGroup: 'core',
  unit,
  target,
});

const amrap: CircuitDefinition = {
  format: 'AMRAP',
  name: 'AMRAP 12',
  config: { durationSeconds: 720 },
  exercises: [
    ex(1, 'Kettlebell swing', 'REPS', 15),
    ex(2, 'Burpee', 'REPS', 10),
    ex(3, 'Box jump', 'REPS', 8),
    ex(4, 'Prancha', 'SECONDS', 30),
  ],
};

const forTime: CircuitDefinition = {
  format: 'FOR_TIME',
  name: '3 rounds',
  config: { rounds: 3, restBetweenRoundsSeconds: 60 },
  exercises: [ex(1, 'Passada', 'REPS', 12), ex(2, 'Burpee', 'REPS', 10)],
};

const tabata: CircuitDefinition = {
  format: 'TABATA',
  name: 'Tabata',
  config: { workSeconds: 20, restSeconds: 10, intervals: 8 },
  exercises: [ex(1, 'Prancha', 'SECONDS', 20), ex(2, 'Abdominal bicicleta', 'REPS', 10)],
};

const emom: CircuitDefinition = {
  format: 'EMOM',
  name: 'EMOM 10',
  config: { durationSeconds: 600 },
  exercises: [ex(1, 'Thruster', 'REPS', 5), ex(2, 'Burpee', 'REPS', 5)],
};

const run = (events: CircuitEvent[] = []): CircuitRun => ({ startedAt: T0, events });
const marks = (...seconds: number[]): CircuitEvent[] =>
  seconds.map((s) => ({ type: 'mark', at: at(s) }));

describe('AMRAP', () => {
  it('conta para baixo a partir da duração, pelo relógio e não por tiques', () => {
    const s = circuitState(amrap, run(), at(198));
    expect(s.status).toBe('running');
    expect(s.clockSeconds).toBe(522);
    expect(s.roundsCompleted).toBe(0);
    expect(s.exerciseIndex).toBe(0);
  });

  it('marcar o último exercício conta o round sozinho e guarda o tempo dele', () => {
    const s = circuitState(amrap, run(marks(30, 60, 90, 130, 160)), at(170));
    expect(s.roundsCompleted).toBe(1);
    expect(s.exerciseIndex).toBe(1);
    expect(s.roundSeconds).toEqual([130]);
  });

  it('"+1 round" conta o round e volta ao primeiro exercício; "−" desfaz', () => {
    const events: CircuitEvent[] = [
      ...marks(30),
      { type: 'round', at: at(100) },
      { type: 'round', at: at(200) },
      { type: 'unround', at: at(201) },
    ];
    const s = circuitState(amrap, run(events), at(210));
    expect(s.roundsCompleted).toBe(1);
    expect(s.exerciseIndex).toBe(0);
    expect(s.roundSeconds).toEqual([100]);
  });

  it('a pausa congela o relógio, e voltar tira o tempo parado', () => {
    const events: CircuitEvent[] = [
      { type: 'pause', at: at(100) },
      { type: 'resume', at: at(400) },
    ];
    expect(circuitState(amrap, run(events.slice(0, 1)), at(300)).clockSeconds).toBe(620);
    expect(circuitState(amrap, run(events.slice(0, 1)), at(300)).status).toBe('paused');
    expect(circuitState(amrap, run(events), at(410)).clockSeconds).toBe(610);
  });

  it('acaba no tempo; toque depois do fim não conta', () => {
    const s = circuitState(amrap, run(marks(10, 20, 30, 40, 50, 721, 722)), at(900));
    expect(s.status).toBe('done');
    expect(s.doneReason).toBe('time');
    expect(s.clockSeconds).toBe(0);
    expect(s.roundsCompleted).toBe(1);
    expect(s.exerciseIndex).toBe(1);
  });

  it('o resultado leva rounds, o round parcial e as reps por exercício', () => {
    const r = circuitResult(amrap, run(marks(30, 60, 90, 130, 160, 190)), at(800));
    expect(r.roundsCompleted).toBe(1);
    expect(r.partialExercises).toBe(2);
    expect(r.roundSeconds).toEqual([130]);
    expect(r.partialRoundSeconds).toBe(590);
    expect(r.elapsedSeconds).toBe(720);
    expect(r.completed).toBe(true);
    expect(r.finalTimeSeconds).toBeNull();
    expect(r.totalReps).toBe(15 + 10 + 8 + 15 + 10);
    expect(r.exercises).toEqual([
      { exerciseId: 1, sets: 2, reps: 30, seconds: 0 },
      { exerciseId: 2, sets: 2, reps: 20, seconds: 0 },
      { exerciseId: 3, sets: 1, reps: 8, seconds: 0 },
      { exerciseId: 4, sets: 1, reps: 0, seconds: 30 },
    ]);
  });

  it('"Encerrar" antes do fim fecha no instante do toque', () => {
    const r = circuitResult(amrap, run([...marks(30), { type: 'end', at: at(300) }]), at(800));
    expect(r.completed).toBe(false);
    expect(r.elapsedSeconds).toBe(300);
    expect(r.partialExercises).toBe(1);
  });
});

describe('For Time', () => {
  it('o cronômetro sobe e o descanso entre rounds não conta no tempo do round', () => {
    // Round 1 termina em 100 s; descanso de 60 s; round 2 começa em 160 s.
    const s = circuitState(forTime, run(marks(40, 100)), at(130));
    expect(s.clockSeconds).toBe(130);
    expect(s.roundsCompleted).toBe(1);
    expect(s.rest).toEqual({ remainingSeconds: 30 });
    const r = circuitResult(forTime, run(marks(40, 100, 200, 250)), at(260));
    expect(r.roundSeconds).toEqual([100, 90]);
  });

  it('toque durante o descanso não conta; "pular" encerra o descanso', () => {
    const events: CircuitEvent[] = [...marks(40, 100, 110), { type: 'skip', at: at(120) }];
    const s = circuitState(forTime, run(events), at(125));
    expect(s.rest).toBeNull();
    expect(s.exerciseIndex).toBe(0);
    const r = circuitResult(forTime, run([...events, ...marks(150, 180)]), at(190));
    expect(r.roundSeconds).toEqual([100, 60]);
  });

  it('o último round para o relógio no tempo final', () => {
    const events = marks(40, 100, 200, 250, 350, 400);
    const s = circuitState(forTime, run(events), at(999));
    expect(s.status).toBe('done');
    expect(s.doneReason).toBe('rounds');
    expect(s.clockSeconds).toBe(400);
    const r = circuitResult(forTime, run(events), at(999));
    expect(r.finalTimeSeconds).toBe(400);
    expect(r.completed).toBe(true);
    expect(r.roundsCompleted).toBe(3);
    expect(r.partialRoundSeconds).toBeNull();
  });

  it('encerrar no meio não tem tempo final', () => {
    const r = circuitResult(forTime, run([...marks(40), { type: 'end', at: at(90) }]), at(999));
    expect(r.finalTimeSeconds).toBeNull();
    expect(r.completed).toBe(false);
    expect(r.partialExercises).toBe(1);
  });
});

describe('Tabata e EMOM (intervalos)', () => {
  it('Tabata alterna trabalho e descanso e mostra o que vem', () => {
    const work = circuitState(tabata, run(), at(5));
    expect(work.phase).toMatchObject({
      kind: 'work',
      index: 0,
      count: 8,
      exerciseIndex: 0,
      remainingSeconds: 15,
      next: { kind: 'rest', exerciseIndex: null },
    });
    const rest = circuitState(tabata, run(), at(25));
    expect(rest.phase).toMatchObject({
      kind: 'rest',
      index: 0,
      remainingSeconds: 5,
      next: { kind: 'work', exerciseIndex: 1 },
    });
    expect(circuitState(tabata, run(), at(31)).phase).toMatchObject({ index: 1, exerciseIndex: 1 });
  });

  it('pular fase avança o relógio do circuito até o fim da fase', () => {
    const s = circuitState(tabata, run([{ type: 'skip', at: at(5) }]), at(6));
    expect(s.phase).toMatchObject({ kind: 'rest', index: 0, remainingSeconds: 9 });
  });

  it('Tabata acaba depois do último intervalo, com 8 intervalos e 4 min', () => {
    const s = circuitState(tabata, run(), at(500));
    expect(s.status).toBe('done');
    const r = circuitResult(tabata, run(), at(500));
    expect(r.intervalsCompleted).toBe(8);
    expect(r.elapsedSeconds).toBe(240);
    expect(r.exercises).toEqual([
      { exerciseId: 1, sets: 4, reps: 0, seconds: 80 },
      { exerciseId: 2, sets: 4, reps: 0, seconds: 80 },
    ]);
  });

  it('EMOM troca a cada minuto em rodízio; "próximo minuto" pula', () => {
    const s = circuitState(emom, run(), at(200));
    expect(s.phase).toMatchObject({ kind: 'work', index: 3, count: 10, exerciseIndex: 1 });
    expect(s.phase?.remainingSeconds).toBe(40);
    const skipped = circuitState(emom, run([{ type: 'skip', at: at(200) }]), at(201));
    expect(skipped.phase).toMatchObject({ index: 4, remainingSeconds: 59 });
  });

  it('EMOM encerrado no meio conta só os minutos que terminaram', () => {
    const r = circuitResult(emom, run([{ type: 'end', at: at(200) }]), at(300));
    expect(r.intervalsCompleted).toBe(3);
    expect(r.completed).toBe(false);
    expect(r.exercises).toEqual([
      { exerciseId: 1, sets: 2, reps: 10, seconds: 0 },
      { exerciseId: 2, sets: 1, reps: 5, seconds: 0 },
    ]);
  });
});

describe('avisos e alarmes', () => {
  it('troca de fase, fim e os 3 segundos finais viram aviso', () => {
    const before = circuitState(tabata, run(), at(19));
    const after = circuitState(tabata, run(), at(20));
    expect(circuitCue(before, after)).toBe('phase');
    expect(
      circuitCue(circuitState(tabata, run(), at(16)), circuitState(tabata, run(), at(17))),
    ).toBe('countdown');
    expect(
      circuitCue(circuitState(amrap, run(), at(719)), circuitState(amrap, run(), at(720))),
    ).toBe('done');
    expect(
      circuitCue(circuitState(amrap, run(), at(100)), circuitState(amrap, run(), at(101))),
    ).toBe(null);
  });

  it('os alarmes do sistema saem no horário de cada troca, e nenhum pausado', () => {
    const alarms = circuitAlarms(tabata, run(), at(5));
    expect(alarms[0]).toMatchObject({ at: at(20), kind: 'rest' });
    expect(alarms[1]).toMatchObject({ at: at(30), kind: 'work' });
    expect(alarms.at(-1)).toMatchObject({ at: at(240), kind: 'done' });
    expect(circuitAlarms(amrap, run(), at(5))).toEqual([
      expect.objectContaining({ at: at(720), kind: 'done' }),
    ]);
    expect(circuitAlarms(amrap, run([{ type: 'pause', at: at(6) }]), at(7))).toEqual([]);
  });

  it('com teto, o alarme de fim fica e cada troca diz o intervalo dela (revisão C5)', () => {
    const long = { ...tabata, config: { workSeconds: 20, restSeconds: 10, intervals: 60 } };
    const alarms = circuitAlarms(long, run(), at(0), 10);
    expect(alarms).toHaveLength(10);
    expect(alarms.at(-1)).toMatchObject({ at: at(1800), kind: 'done' });
    expect(alarms[1]).toMatchObject({ at: at(30), kind: 'work', index: 1 });
  });
});
