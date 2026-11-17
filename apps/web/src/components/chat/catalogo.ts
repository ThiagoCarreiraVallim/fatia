'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptAiConsent,
  getAiConsent,
  getChatToolCatalog,
  setWebSearchEnabled,
  type AiConsentStatus,
  type AiConsentTopic,
} from '@fatia/api-client';

/**
 * O contrato de cartão de cada tool (`GET /chat/tool-catalog`, #384): de onde vem o link do
 * "só no app" e se a tool consulta ou grava.
 */
export function useCatalogoDasTools() {
  return useQuery({
    queryKey: ['chat', 'tool-catalog'],
    queryFn: getChatToolCatalog,
    staleTime: 60 * 60_000,
  }).data;
}

export const CHAVE_DOS_ACEITES = ['chat', 'consent'] as const;

/** Os aceites da IA e a chave da busca na web, da pessoa logada. */
/**
 * `retryOnMount: false`: o cartão do aceite também lê os aceites; montar de novo depois de um
 * erro zeraria o erro, o aviso sumiria e voltaria em laço. Quem tenta de novo é o botão.
 */
export function useAceitesDaIa() {
  return useQuery({
    queryKey: CHAVE_DOS_ACEITES,
    queryFn: getAiConsent,
    staleTime: 5 * 60_000,
    retryOnMount: false,
  });
}

export function useAceitar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (topico: AiConsentTopic) => acceptAiConsent(topico),
    onSuccess: (estado: AiConsentStatus) => queryClient.setQueryData(CHAVE_DOS_ACEITES, estado),
  });
}

export function useChaveDaBusca() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ligada: boolean) => setWebSearchEnabled(ligada),
    onMutate: (ligada: boolean) => {
      const antes = queryClient.getQueryData<AiConsentStatus>(CHAVE_DOS_ACEITES);
      if (antes)
        queryClient.setQueryData(CHAVE_DOS_ACEITES, { ...antes, webSearchEnabled: ligada });
      return antes;
    },
    onError: (_erro, _ligada, antes) => {
      if (antes) queryClient.setQueryData(CHAVE_DOS_ACEITES, antes);
    },
    onSuccess: (estado: AiConsentStatus) => queryClient.setQueryData(CHAVE_DOS_ACEITES, estado),
  });
}
