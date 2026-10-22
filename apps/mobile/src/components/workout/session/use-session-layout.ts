import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { workoutApi, type ExerciseGroup, type WorkoutSession } from '@fatia/api-client';
import { useToast } from '@/components/ui';

/**
 * Reordenar e tirar exercícios da sessão em andamento — só desta sessão; o
 * plano fica como estava (ver `exerciseOrder` no schema).
 *
 * A ordem é otimista: a troca aparece no toque e volta se o servidor recusar.
 * Esperar a ida e volta a cada seta faria a lista "pular" um instante depois,
 * e quem toca duas vezes seguidas moveria o exercício errado.
 */
export function useSessionLayout(session: WorkoutSession) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['workout', 'session', session.id];

  const reorder = useMutation({
    mutationFn: (exerciseOrder: number[]) =>
      workoutApi.updateSession(session.id, { exerciseOrder }),
    onMutate: async (exerciseOrder) => {
      void Haptics.selectionAsync();
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<WorkoutSession>(key);
      if (previous) qc.setQueryData<WorkoutSession>(key, { ...previous, exerciseOrder });
      return { previous };
    },
    onError: (_error, _order, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
      toast.show({ message: 'Não deu para mudar a ordem. Tente de novo.' });
    },
    // Só invalida, sem gravar a resposta: com dois toques seguidos, a resposta
    // do primeiro chegaria depois do otimista do segundo e desfaria a troca.
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (group: ExerciseGroup) => {
      // Uma a uma: são poucas, e em paralelo uma falha no meio deixaria metade
      // apagada sem dizer qual.
      for (const set of group.sets) await workoutApi.deleteSet(session.id, set.id);
      if (group.isPlanned) {
        // Lido do cache, e não da sessão do render: duas remoções seguidas
        // gravariam cada uma a lista sem a outra.
        const current = qc.getQueryData<WorkoutSession>(key) ?? session;
        const removed = new Set(current.removedExerciseIds ?? []);
        removed.add(group.exerciseId);
        await workoutApi.updateSession(session.id, { removedExerciseIds: [...removed] });
      }
    },
    onSuccess: (_result, group) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show({ message: `${group.exerciseName} saiu deste treino.` });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });

  return { reorder, remove };
}
