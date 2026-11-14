import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getChatAvailability,
  getPendingConversationsCount,
  listConversations,
  type ChatAvailability,
} from '@fatia/api-client';

/**
 * O estado da IA para o botão, o menu e o cartão "esperando você" — o
 * `use-ai-state.ts` do PWA. As chaves ficam sob `['chat', 'conversations']`,
 * que o `ChatProvider` invalida no fim de cada turno.
 */
export const AI_PENDING_COUNT_KEY = ['chat', 'conversations', 'pending-count'] as const;
export const AI_DRAWER_CONVERSATIONS_KEY = ['chat', 'conversations', 'drawer'] as const;
export const AI_WAITING_KEY = ['chat', 'conversations', 'waiting'] as const;

export function useChatAvailability() {
  return useQuery({
    queryKey: ['chat', 'availability'],
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function aiUsable(a: ChatAvailability | undefined): boolean {
  return a?.available === true && a.allowed !== false;
}

export function aiLocked(a: ChatAvailability | undefined): boolean {
  return a?.available === true && a.allowed === false && a.reason === 'plan_required';
}

/**
 * O selo e o anel. Relê quando o app volta ao primeiro plano (o turno pode ter
 * terminado com o app no bolso) e, enquanto alguma conversa pensa, a cada 10 s.
 */
export function useAiPendingCount(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    });
    return () => sub.remove();
  }, [enabled, qc]);
  return useQuery({
    queryKey: AI_PENDING_COUNT_KEY,
    queryFn: getPendingConversationsCount,
    enabled,
    retry: false,
    refetchInterval: (q) => ((q.state.data?.thinking ?? 0) > 0 ? 10_000 : false),
  });
}

export function useDrawerConversations(enabled: boolean) {
  return useQuery({
    queryKey: AI_DRAWER_CONVERSATIONS_KEY,
    queryFn: () => listConversations({ limit: 8 }),
    enabled,
    retry: false,
  });
}
