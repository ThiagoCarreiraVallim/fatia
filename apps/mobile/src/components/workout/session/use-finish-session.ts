import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { workoutApi } from '@fatia/api-client';

/**
 * Finaliza a sessão e fica na mesma rota: com `completedAt`, a tela da sessão
 * vira o "Treino feito!" (prancha `Al-T5-Fim`), onde a sensação e a
 * observação são pedidas. Finalizar de novo é idempotente na API (#377).
 */
export function useFinishSession(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => workoutApi.finishSession(sessionId),
    onSuccess: async () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.setQueryData(['workout', 'active'], null);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'sessions'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'muscles'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      await qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
    },
  });
}
