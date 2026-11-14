'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getChatAvailability,
  getPendingConversationsCount,
  listConversations,
  type ChatAvailability,
  type ChatConversationSummary,
} from '@fatia/api-client';

/**
 * Chaves sob `['chat', 'conversations']`: o `ChatRuntimeProvider` invalida esse
 * prefixo no fim de cada turno, então o anel, o selo e o cartão "esperando
 * você" se atualizam sem polling quando a resposta termina nesta aba.
 */
export const AI_PENDING_COUNT_KEY = ['chat', 'conversations', 'pending-count'] as const;
export const AI_DRAWER_CONVERSATIONS_KEY = ['chat', 'conversations', 'drawer'] as const;
export const AI_WAITING_KEY = ['chat', 'conversations', 'waiting'] as const;

/** Mesma chave e `staleTime` da tela do chat e do menu: uma consulta para todos. */
export function useChatAvailability() {
  return useQuery({
    queryKey: ['chat', 'availability'],
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** A IA existe aqui e esta pessoa pode usar (PRO ou assento). */
export function aiUsable(a: ChatAvailability | undefined): boolean {
  return a?.available === true && a.allowed !== false;
}

/** A IA existe, mas é do PRO e a pessoa é Free (ADR 024): a regra `chatLocked` do menu. */
export function aiLocked(a: ChatAvailability | undefined): boolean {
  return a?.available === true && a.allowed === false && a.reason === 'plan_required';
}

/**
 * O estado do botão da IA. Relê ao voltar para a aba e, enquanto alguma
 * conversa pensa noutro lugar (outra aba, o celular), a cada 10 s: o fim do
 * turno de lá não passa pelo runtime daqui.
 */
export function useAiPendingCount(enabled: boolean) {
  return useQuery({
    queryKey: AI_PENDING_COUNT_KEY,
    queryFn: getPendingConversationsCount,
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => ((q.state.data?.thinking ?? 0) > 0 ? 10_000 : false),
  });
}

/** As conversas da seção "Conversas" do menu: poucas, com o estado. */
export function useDrawerConversations(enabled: boolean) {
  return useQuery<ChatConversationSummary[]>({
    queryKey: AI_DRAWER_CONVERSATIONS_KEY,
    queryFn: () => listConversations({ limit: 8 }),
    enabled,
    retry: false,
  });
}
