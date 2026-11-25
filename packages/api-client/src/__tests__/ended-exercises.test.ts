import { describe, expect, it } from 'vitest';
import {
  endedExercisesKey,
  markEndedExercises,
  toggleEndedExercise,
} from '../workout/ended-exercises';
import { pickFocusedGroup, type ExerciseGroup } from '../session-view';
import type { SessionSet } from '../workout';

function group(id: number, done: number, target = 3): ExerciseGroup {
  return {
    exerciseId: id,
    exerciseName: `Ex ${id}`,
    isCardio: false,
    targetSets: target,
    isPlanned: true,
    sets: Array.from({ length: done }, () => ({ exerciseId: id }) as SessionSet),
  };
}

describe('encerrar exercício sem completar as séries (#473)', () => {
  it('a chave é da sessão', () => {
    expect(endedExercisesKey('s1')).toEqual(['workout', 'session', 's1', 'ended']);
  });

  it('encerra e retoma', () => {
    expect(toggleEndedExercise(undefined, 7, true)).toEqual([7]);
    expect(toggleEndedExercise([7], 7, true)).toEqual([7]);
    expect(toggleEndedExercise([7, 8], 7, false)).toEqual([8]);
  });

  it('marca só os encerrados', () => {
    const marked = markEndedExercises([group(1, 1), group(2, 0)], [2]);
    expect(marked.map((g) => g.ended ?? false)).toEqual([false, true]);
  });

  it('sem encerrados, devolve os mesmos grupos', () => {
    const groups = [group(1, 1)];
    expect(markEndedExercises(groups, [])).toBe(groups);
  });

  it('o foco da sessão pula o exercício encerrado', () => {
    const groups = markEndedExercises([group(1, 1), group(2, 0)], [1]);
    expect(pickFocusedGroup(groups, new Set())?.exerciseId).toBe(2);
    expect(pickFocusedGroup(groups, new Set(), 1)?.exerciseId).toBe(2);
  });
});
