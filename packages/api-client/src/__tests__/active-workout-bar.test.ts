import { describe, expect, it } from 'vitest';
import {
  activeWorkoutBarLines,
  activeWorkoutBarView,
  formatClock,
  lastSessionSummary,
} from '../active-workout-bar';
import type { SessionSet, WorkoutSession } from '../workout';

const NOW = new Date('2026-11-14T15:20:00Z');

const exercise = (id: number, name: string, muscleGroup = 'peito') => ({
  id,
  name,
  muscleGroup,
  source: 'SEED' as const,
  createdByUserId: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: null,
  level: null,
  mechanic: null,
  instructions: [],
  youtubeVideoId: null,
  youtubeVideoIdPt: null,
});

const set = (exerciseId: number, name: string, extra: Partial<SessionSet> = {}, group = 'peito') =>
  ({
    id: `s-${Math.random()}`,
    sessionId: 's1',
    exerciseId,
    setNumber: 1,
    weightKg: 60,
    reps: 10,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
    exercise: exercise(exerciseId, name, group),
    ...extra,
  }) satisfies SessionSet;

const session = (over: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 's1',
  userId: 'u',
  planId: 'p',
  startedAt: '2026-11-14T15:00:00Z',
  completedAt: null,
  notes: null,
  sets: [],
  plannedExercises: [
    {
      exerciseId: 1,
      exerciseName: 'Supino reto',
      muscleGroup: 'peito',
      order: 1,
      targetSets: 4,
      targetReps: '8-12',
    },
    {
      exerciseId: 2,
      exerciseName: 'Crucifixo',
      muscleGroup: 'peito',
      order: 2,
      targetSets: 3,
      targetReps: '12',
    },
  ],
  ...over,
});

describe('formatClock', () => {
  it('minutos e segundos; com hora quando passa de 60 min', () => {
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('activeWorkoutBarView', () => {
  it('força: exercício em foco, série X de Y e o tempo do treino', () => {
    const view = activeWorkoutBarView(
      session({ sets: [set(1, 'Supino reto'), set(1, 'Supino reto')] }),
      null,
      NOW,
    );
    expect(view).toEqual({
      mode: 'strength',
      title: 'Supino reto',
      detail: 'série 3 de 4',
      clock: '20:00',
    });
  });

  it('o exercício completo passa a vez ao próximo', () => {
    const quatro = Array.from({ length: 4 }, () => set(1, 'Supino reto'));
    const view = activeWorkoutBarView(session({ sets: quatro }), null, NOW);
    expect(view.title).toBe('Crucifixo');
    expect(view.detail).toBe('série 1 de 3');
  });

  it('descanso correndo: a contagem manda na barra', () => {
    const view = activeWorkoutBarView(
      session({ sets: [set(1, 'Supino reto')] }),
      { remaining: 45, running: true },
      NOW,
    );
    expect(view).toEqual({
      mode: 'rest',
      title: 'Descanso',
      detail: 'próxima: Supino reto · série 2 de 4',
      clock: '00:45',
    });
  });

  it('descanso pausado ou zerado não é modo descanso', () => {
    expect(activeWorkoutBarView(session(), { remaining: 0, running: false }, NOW).mode).toBe(
      'strength',
    );
  });

  it('cardio: exercício, distância e tempo', () => {
    const view = activeWorkoutBarView(
      session({
        plannedExercises: [],
        sets: [
          set(
            9,
            'Corrida',
            { distanceMeters: 3200, durationSeconds: 1200, weightKg: null, reps: null },
            'cardio',
          ),
        ],
      }),
      null,
      NOW,
    );
    expect(view).toEqual({ mode: 'cardio', title: 'Corrida', detail: '3,2 km', clock: '20:00' });
  });

  it('treino livre sem nada ainda: só o tempo', () => {
    const view = activeWorkoutBarView(session({ plannedExercises: [], sets: [] }), null, NOW);
    expect(view).toEqual({
      mode: 'strength',
      title: 'Treino livre',
      detail: 'em andamento',
      clock: '20:00',
    });
  });

  it('AMRAP e intervalos só existem com o dado do circuito (#380)', () => {
    const semCircuito = activeWorkoutBarView(session(), null, NOW);
    expect(['amrap', 'intervals']).not.toContain(semCircuito.mode);
    const amrap = activeWorkoutBarView(session(), null, NOW, {
      kind: 'amrap',
      name: 'Circuito A',
      rounds: 3,
      remainingSeconds: 300,
    });
    expect(amrap).toEqual({
      mode: 'amrap',
      title: 'Circuito A',
      detail: '3 rounds',
      clock: '05:00',
    });
  });
});

describe('lastSessionSummary', () => {
  it('duração, séries e volume em toneladas, sem humor', () => {
    const s = session({
      completedAt: '2026-11-14T16:02:00Z',
      sets: [
        set(1, 'Supino reto', { weightKg: 100, reps: 10 }),
        set(1, 'Supino reto', { weightKg: 100, reps: 10 }),
        set(9, 'Corrida', { weightKg: null, reps: null, distanceMeters: 1000 }, 'cardio'),
      ],
    });
    expect(lastSessionSummary(s, 'Push')).toEqual({
      name: 'Push',
      durationMinutes: 62,
      sets: 3,
      volumeTons: 2,
    });
  });

  it('sem plano é "Treino livre"', () => {
    const s = session({ planId: null, completedAt: '2026-11-14T15:30:00Z' });
    expect(lastSessionSummary(s, null).name).toBe('Treino livre');
  });
});

describe('activeWorkoutBarLines (prancha Al-T1b)', () => {
  it('força: exercício e série em cima; plano e relógio embaixo', () => {
    const s = session({ sets: [set(1, 'Supino reto')] });
    expect(activeWorkoutBarLines(activeWorkoutBarView(s, null, NOW), 'Push')).toEqual({
      primary: 'Supino reto · série 2 de 4',
      secondary: 'Push · 20:00',
    });
  });

  it('sem plano: "Treino livre" no lugar do nome', () => {
    const s = session({ planId: null, sets: [set(1, 'Supino reto')] });
    expect(activeWorkoutBarLines(activeWorkoutBarView(s, null, NOW), null).secondary).toBe(
      'Treino livre · 20:00',
    );
  });

  it('treino livre ainda vazio: não repete "Treino livre"', () => {
    const s = session({ planId: null, plannedExercises: [], sets: [] });
    expect(activeWorkoutBarLines(activeWorkoutBarView(s, null, NOW), null)).toEqual({
      primary: 'Treino livre',
      secondary: 'em andamento · 20:00',
    });
  });

  it('descanso: a contagem fica no título, a próxima série embaixo', () => {
    const s = session({ sets: [set(1, 'Supino reto')] });
    const view = activeWorkoutBarView(s, { remaining: 45, running: true }, NOW);
    expect(activeWorkoutBarLines(view, 'Push')).toEqual({
      primary: 'Descanso · 00:45',
      secondary: 'próxima: Supino reto · série 2 de 4',
    });
  });
});
