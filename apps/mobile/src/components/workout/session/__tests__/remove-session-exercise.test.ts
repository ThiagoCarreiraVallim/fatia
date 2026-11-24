import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  buildExerciseGroups,
  endedExercisesKey,
  markEndedExercises,
  pendingExercisesKey,
  type PendingExercise,
} from '@fatia/api-client';
import { forgetRemovedExercise } from '../use-pending-exercises';

const REMADA: PendingExercise = { id: 9, name: 'Remada', muscleGroup: 'costas' } as PendingExercise;

describe('tirar o exercício do treino (#473)', () => {
  it('limpa o encerrado: reescolhido na busca, ele volta aberto', () => {
    const qc = new QueryClient();
    qc.setQueryData(pendingExercisesKey('s1'), [REMADA]);
    qc.setQueryData(endedExercisesKey('s1'), [9, 4]);

    forgetRemovedExercise(qc, 's1', 9);

    expect(qc.getQueryData(pendingExercisesKey('s1'))).toEqual([]);
    expect(qc.getQueryData(endedExercisesKey('s1'))).toEqual([4]);

    // Reescolhido na busca: não nasce "Encerrado".
    qc.setQueryData(pendingExercisesKey('s1'), [REMADA]);
    const groups = markEndedExercises(
      buildExerciseGroups(
        undefined,
        [],
        qc.getQueryData<PendingExercise[]>(pendingExercisesKey('s1')),
      ),
      qc.getQueryData<number[]>(endedExercisesKey('s1')),
    );
    expect(groups[0]!.ended ?? false).toBe(false);
  });

  it('não mexe nos encerrados de outra sessão', () => {
    const qc = new QueryClient();
    qc.setQueryData(endedExercisesKey('s2'), [9]);
    forgetRemovedExercise(qc, 's1', 9);
    expect(qc.getQueryData(endedExercisesKey('s2'))).toEqual([9]);
  });
});
