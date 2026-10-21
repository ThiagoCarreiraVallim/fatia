import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { workoutApi } from '@fatia/api-client';

/**
 * `apps/web/src/components/workout/cancel-session-modal.tsx`.
 *
 * Já foi `Alert` do sistema; virou `ConfirmDrawer`, montado pela tela, porque o
 * diálogo nativo destoava do resto do app (o "Finalizar" ao lado já era drawer).
 * O hook guarda o estado do drawer e a mutação; a tela só desenha.
 */
export function useCancelSession(sessionId: string) {
  const qc = useQueryClient();
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);

  const cancel = useMutation({
    mutationFn: async () => {
      try {
        await workoutApi.deleteSession(sessionId);
      } catch (err) {
        // Sessão já apagada em outro aparelho: o resultado é o que se queria.
        const message = err instanceof Error ? err.message : '';
        if (!/not found/i.test(message)) throw err;
      }
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      qc.setQueryData(['workout', 'active'], null);
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'sessions'] });
      setCancelOpen(false);
      router.replace('/workout');
    },
  });

  return {
    cancelOpen,
    setCancelOpen,
    cancel: () => cancel.mutate(),
    isPending: cancel.isPending,
    error: cancel.error instanceof Error ? cancel.error.message : null,
  };
}
