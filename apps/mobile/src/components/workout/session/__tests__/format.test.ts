import { describe, expect, it } from 'vitest';
import type { ExerciseGroup, SessionSet } from '@fatia/api-client';
import {
  elapsedLabel,
  formatClock,
  formatCountdown,
  formatDistance,
  formatNumber,
  formatPace,
  formatPreviousSet,
  isExerciseComplete,
  parseClock,
  parseDecimalInput,
  parseFirstRep,
  parseIntegerInput,
  previousCells,
  sessionProgress,
  targetSetsOf,
  totalVolumeKg,
} from '../format';
import { groupCardItem } from '../exercise-card-item';

function makeSet(partial: Partial<SessionSet> = {}): SessionSet {
  return {
    id: 'set-1',
    sessionId: 'session-1',
    exerciseId: 1,
    setNumber: 1,
    weightKg: null,
    reps: null,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
    exercise: {
      id: 1,
      name: 'Supino reto',
      muscleGroup: 'peito',
      source: 'SEED',
      createdByUserId: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: null,
      level: null,
      mechanic: null,
      instructions: [],
      youtubeVideoId: null,
      youtubeVideoIdPt: null,
    },
    ...partial,
  };
}

function makeGroup(partial: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exerciseId: 1,
    exerciseName: 'Supino reto',
    isCardio: false,
    sets: [],
    isPlanned: true,
    ...partial,
  };
}

describe('formatClock', () => {
  it('usa m:ss abaixo de uma hora', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(599)).toBe('9:59');
  });

  it('inclui a hora quando passa de 3600s', () => {
    expect(formatClock(3723)).toBe('1:02:03');
  });

  it('mantém o sinal do tempo negativo em vez de zerar', () => {
    expect(formatClock(-65)).toBe('-1:05');
  });
});

describe('formatCountdown', () => {
  it('sempre traz dois dígitos no minuto', () => {
    expect(formatCountdown(90)).toBe('01:30');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('parseClock', () => {
  it('lê segundos puros', () => {
    expect(parseClock('90')).toBe(90);
  });

  it('lê m:ss e h:mm:ss', () => {
    expect(parseClock('1:30')).toBe(90);
    expect(parseClock('1:02:03')).toBe(3723);
  });

  it('recusa o que não é tempo', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('1:75')).toBeNull();
    expect(parseClock('1:2:3:4')).toBeNull();
  });
});

describe('parseDecimalInput', () => {
  it('aceita vírgula do teclado pt-BR e ponto', () => {
    expect(parseDecimalInput('82,5')).toBe(82.5);
    expect(parseDecimalInput('82.5')).toBe(82.5);
  });

  it('devolve null para vazio ou lixo', () => {
    expect(parseDecimalInput('   ')).toBeNull();
    expect(parseDecimalInput('kg')).toBeNull();
  });

  it('arredonda no modo inteiro', () => {
    expect(parseIntegerInput('9,6')).toBe(10);
  });
});

describe('formatNumber', () => {
  it('não inventa casa decimal em inteiro', () => {
    expect(formatNumber(60)).toBe('60');
  });

  it('usa vírgula no decimal', () => {
    expect(formatNumber(82.5)).toBe('82,5');
  });

  it('mostra travessão quando não há valor', () => {
    expect(formatNumber(null)).toBe('—');
  });
});

describe('formatDistance', () => {
  it('vira km a partir de 1000m', () => {
    expect(formatDistance(2500)).toBe('2,50 km');
    expect(formatDistance(800)).toBe('800 m');
    expect(formatDistance(null)).toBe('—');
  });
});

describe('formatPace', () => {
  it('calcula minutos por quilômetro', () => {
    expect(formatPace(1800, 5000)).toBe('6:00/km');
  });

  it('devolve null sem distância ou sem tempo', () => {
    expect(formatPace(0, 5000)).toBeNull();
    expect(formatPace(1800, 0)).toBeNull();
  });
});

describe('formatPreviousSet', () => {
  it('resume força com carga, reps e RPE', () => {
    const set = makeSet({ weightKg: 82.5, reps: 8, rpe: 9 });
    expect(formatPreviousSet(set, false)).toBe('82,5 kg × 8 · RPE 9');
  });

  it('resume cardio com duração, distância e FC', () => {
    const set = makeSet({ durationSeconds: 750, distanceMeters: 2500, avgHeartRate: 145 });
    expect(formatPreviousSet(set, true)).toBe('12:30 · 2,50 km · 145 bpm');
  });

  it('não devolve texto quando não há referência', () => {
    expect(formatPreviousSet(null, false)).toBeNull();
    expect(formatPreviousSet(makeSet(), true)).toBeNull();
  });
});

describe('previousCells', () => {
  it('segue a ordem das colunas de força', () => {
    expect(previousCells(makeSet({ reps: 10, weightKg: 60, rpe: 8 }), false)).toEqual([
      '10',
      '60',
      '8',
    ]);
  });

  it('segue a ordem das colunas de cardio', () => {
    expect(
      previousCells(makeSet({ durationSeconds: 90, distanceMeters: 400, avgHeartRate: 150 }), true),
    ).toEqual(['1:30', '400 m', '150']);
  });

  it('preenche com travessão sem referência', () => {
    expect(previousCells(null, false)).toEqual(['—', '—', '—']);
  });
});

describe('targetSetsOf', () => {
  it('respeita o alvo do plano', () => {
    expect(targetSetsOf(makeGroup({ targetSets: 4 }))).toBe(4);
  });

  it('cardio é sempre uma série', () => {
    expect(targetSetsOf(makeGroup({ isCardio: true, targetSets: 3 }))).toBe(1);
  });

  it('sem plano, o alvo acompanha o que já foi feito', () => {
    const sets = [makeSet({ id: 'a' }), makeSet({ id: 'b' }), makeSet({ id: 'c' })];
    expect(targetSetsOf(makeGroup({ sets }))).toBe(4);
    expect(targetSetsOf(makeGroup())).toBe(3);
  });
});

describe('sessionProgress', () => {
  it('conta exercício de força pelo alvo e cardio por ter série', () => {
    const groups = [
      makeGroup({
        exerciseId: 1,
        targetSets: 2,
        sets: [makeSet({ id: 'a' }), makeSet({ id: 'b' })],
      }),
      makeGroup({ exerciseId: 2, targetSets: 3, sets: [makeSet({ id: 'c' })] }),
      makeGroup({ exerciseId: 3, isCardio: true, sets: [makeSet({ id: 'd' })] }),
    ];
    expect(sessionProgress(groups)).toEqual({ done: 2, total: 3, ratio: 2 / 3 });
  });

  it('sessão vazia não divide por zero', () => {
    expect(sessionProgress([])).toEqual({ done: 0, total: 0, ratio: 0 });
  });

  it('exercício livre, sem alvo, nunca aparece como completo', () => {
    expect(isExerciseComplete(makeGroup({ sets: [makeSet()] }))).toBe(false);
  });
});

describe('totalVolumeKg', () => {
  it('só soma série com carga e repetição', () => {
    const sets = [
      makeSet({ id: 'a', weightKg: 60, reps: 10 }),
      makeSet({ id: 'b', weightKg: 60 }),
      makeSet({ id: 'c', durationSeconds: 600 }),
    ];
    expect(totalVolumeKg(sets)).toBe(600);
    expect(totalVolumeKg(undefined)).toBe(0);
  });
});

describe('elapsedLabel', () => {
  const start = '2026-07-29T10:00:00.000Z';

  it('mostra só minutos abaixo de uma hora', () => {
    expect(elapsedLabel(start, '2026-07-29T10:45:00.000Z')).toBe('45min');
  });

  it('mostra hora e minuto com dois dígitos', () => {
    expect(elapsedLabel(start, '2026-07-29T11:05:00.000Z')).toBe('1h 05min');
  });

  it('não vira negativo com relógio adiantado', () => {
    expect(elapsedLabel(start, '2026-07-29T09:00:00.000Z')).toBe('0min');
  });
});

describe('parseFirstRep', () => {
  it('pega o primeiro número da faixa', () => {
    expect(parseFirstRep('8-12')).toBe(8);
    expect(parseFirstRep('até a falha')).toBe(10);
    expect(parseFirstRep(undefined)).toBe(10);
  });
});

describe('groupCardItem', () => {
  it('herda o grupo muscular da série registrada', () => {
    const group = makeGroup({ sets: [makeSet()] });
    expect(groupCardItem(group).exercise.muscleGroup).toBe('peito');
  });

  it('cai para cardio quando não há série de referência', () => {
    expect(groupCardItem(makeGroup({ isCardio: true })).exercise.muscleGroup).toBe('cardio');
    expect(groupCardItem(makeGroup()).exercise.muscleGroup).toBe('outros');
  });

  it('usa o alvo do plano e, sem ele, o que foi feito', () => {
    expect(groupCardItem(makeGroup({ targetSets: 4, targetReps: '8-12' }))).toMatchObject({
      targetSets: 4,
      targetReps: '8-12',
    });
    expect(groupCardItem(makeGroup({ sets: [makeSet()] }))).toMatchObject({
      targetSets: 1,
      targetReps: '—',
    });
  });
});
