import { describe, expect, it } from 'vitest';
import {
  buildExerciseGroups,
  moveExerciseInOrder,
  orderExerciseGroups,
  pickFocusedGroup,
} from '../session-view';
import type { SessionSet } from '../workout';

const supino = { id: 1, name: 'Supino reto', muscleGroup: 'peito' };
const esteira = { id: 2, name: 'Esteira', muscleGroup: 'cardio' };

function setOf(exercise: typeof supino, id = 'set-1'): SessionSet {
  return { id, exerciseId: exercise.id, exercise, reps: 10 } as unknown as SessionSet;
}

describe('buildExerciseGroups with pending exercises', () => {
  it('shows a picked exercise with no sets, so nothing fake is logged to make it appear', () => {
    const groups = buildExerciseGroups([], [], [supino]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      exerciseId: 1,
      exerciseName: 'Supino reto',
      sets: [],
      isPlanned: false,
      isCardio: false,
    });
  });

  it('does not duplicate a pending exercise once it has real sets', () => {
    const groups = buildExerciseGroups([], [setOf(supino)], [supino]);

    expect(groups).toHaveLength(1);
    expect(groups[0].sets).toHaveLength(1);
  });

  it('detects cardio on a pending exercise', () => {
    expect(buildExerciseGroups([], [], [esteira])[0].isCardio).toBe(true);
  });
});

describe('pickFocusedGroup', () => {
  it('focuses the exercise just picked, even when an earlier free exercise is open', () => {
    const groups = buildExerciseGroups([], [setOf(supino)], [esteira]);

    expect(pickFocusedGroup(groups, new Set(), 2)?.exerciseId).toBe(2);
  });

  it('falls back to the first incomplete exercise', () => {
    const groups = buildExerciseGroups([], [setOf(supino)], [esteira]);

    expect(pickFocusedGroup(groups, new Set())?.exerciseId).toBe(1);
    expect(pickFocusedGroup(groups, new Set([1]))?.exerciseId).toBe(2);
  });

  it('ignores a preferred exercise that was skipped', () => {
    const groups = buildExerciseGroups([], [setOf(supino)], [esteira]);

    expect(pickFocusedGroup(groups, new Set([2]), 2)?.exerciseId).toBe(1);
  });
});

describe('per-session exercise order', () => {
  const remada = { id: 3, name: 'Remada', muscleGroup: 'costas' };
  const groups = buildExerciseGroups([], [], [supino, esteira, remada]);
  const ids = (list: { exerciseId: number }[]) => list.map((g) => g.exerciseId);

  it('keeps the natural order when nothing was reordered', () => {
    expect(ids(orderExerciseGroups(groups, []))).toEqual([1, 2, 3]);
  });

  it('follows the saved order and sends exercises added later to the end', () => {
    expect(ids(orderExerciseGroups(groups, [3, 1]))).toEqual([3, 1, 2]);
  });

  it('moving swaps neighbours and returns every visible id', () => {
    expect(moveExerciseInOrder(groups, 2, 'up')).toEqual([2, 1, 3]);
    expect(moveExerciseInOrder(groups, 2, 'down')).toEqual([1, 3, 2]);
  });

  it('does not move past the ends', () => {
    expect(moveExerciseInOrder(groups, 1, 'up')).toEqual([1, 2, 3]);
    expect(moveExerciseInOrder(groups, 3, 'down')).toEqual([1, 2, 3]);
  });
});
