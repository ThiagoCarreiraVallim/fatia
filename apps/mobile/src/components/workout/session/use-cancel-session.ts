import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { workoutApi } from '@fatia/api-client';

/**
 * `apps/web/src/components/workout/cancel-session-modal.tsx` vira `Alert` do
 * sistema, não drawer.
 *
 * É uma pergunta de sim ou não sobre apagar tudo: o `Alert` nativo já traz o
 * botão vermelho de ação destrutiva, prende o toque na decisão e é o diálogo que
 * a pessoa reconhece de todo outro app. Um sheet bonito aqui só adicionaria a
 * chance de fechar por arrasto sem querer.
 */
export function useCancelSession(sessionId: string) {
  const qc = useQueryClient();
  const router = useRouter();

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
      router.replace('/workout');
    },
    onError: (error) => {
      Alert.alert(
        'Não foi possível cancelar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    },
  });

  const confirmCancel = useCallback(() => {
    Alert.alert(
      'Cancelar treino',
      'Isso apaga a sessão e todos os exercícios registrados. Não dá para desfazer.',
      [
        { text: 'Continuar treinando', style: 'cancel' },
        { text: 'Cancelar treino', style: 'destructive', onPress: () => cancel.mutate() },
      ],
    );
  }, [cancel]);

  return { confirmCancel, isPending: cancel.isPending };
}
