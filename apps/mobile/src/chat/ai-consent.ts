import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptAiConsent,
  getAiConsent,
  setWebSearchEnabled,
  type AiConsentStatus,
  type AiConsentTopic,
} from '@fatia/api-client';

/** Os aceites da IA e a chave da busca na web (#384), como no PWA (`catalogo.ts`). */
export const AI_CONSENT_KEY = ['chat', 'consent'] as const;

export function useAiConsent() {
  // `retryOnMount: false`: o cartão do aceite também lê os aceites; montar de novo depois de um
  // erro zeraria o erro e o aviso sumiria e voltaria em laço. Quem tenta de novo é o botão.
  return useQuery({
    queryKey: AI_CONSENT_KEY,
    queryFn: getAiConsent,
    staleTime: 5 * 60_000,
    retryOnMount: false,
  });
}

export function useAcceptAiConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (topic: AiConsentTopic) => acceptAiConsent(topic),
    onSuccess: (estado: AiConsentStatus) => queryClient.setQueryData(AI_CONSENT_KEY, estado),
  });
}

export function useWebSearchSwitch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWebSearchEnabled(enabled),
    onMutate: (enabled: boolean) => {
      const antes = queryClient.getQueryData<AiConsentStatus>(AI_CONSENT_KEY);
      if (antes) queryClient.setQueryData(AI_CONSENT_KEY, { ...antes, webSearchEnabled: enabled });
      return antes;
    },
    onError: (_e, _v, antes) => {
      if (antes) queryClient.setQueryData(AI_CONSENT_KEY, antes);
    },
    onSuccess: (estado: AiConsentStatus) => queryClient.setQueryData(AI_CONSENT_KEY, estado),
  });
}
