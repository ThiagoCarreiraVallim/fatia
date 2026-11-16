import { describe, expect, it } from 'vitest';
import {
  addPendingExercise,
  dropPendingExercise,
  pendingExercisesKey,
  pendingExercisesQueryOptions,
} from '../workout/pending-exercises';

const supino = { id: 1, name: 'Supino reto', muscleGroup: 'peito' };
const remada = { id: 2, name: 'Remada', muscleGroup: 'costas' };

describe('pending exercises cache', () => {
  it('uses the same key on web and app', () => {
    expect(pendingExercisesKey('s1')).toEqual(['workout', 'session', 's1', 'pending']);
  });

  it('is never stale nor garbage collected', () => {
    expect(pendingExercisesQueryOptions).toEqual({ staleTime: Infinity, gcTime: Infinity });
  });

  it('adds at the end and ignores a repeated pick', () => {
    expect(addPendingExercise(undefined, supino)).toEqual([supino]);
    const once = addPendingExercise([supino], remada);
    expect(once).toEqual([supino, remada]);
    expect(addPendingExercise(once, supino)).toBe(once);
  });

  it('drops by exercise id', () => {
    expect(dropPendingExercise([supino, remada], 1)).toEqual([remada]);
    expect(dropPendingExercise(undefined, 1)).toEqual([]);
  });
});
