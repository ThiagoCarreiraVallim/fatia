import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { ChatSession, type ChatSessionSnapshot } from './chat-session';

/**
 * A sessão do chat, uma por app, acima das abas (ADR 035): a resposta segue
 * chegando enquanto a pessoa vai ao diário ou ao treino, e volta a ser
 * acompanhada quando o app sai do segundo plano.
 */

export const CHAT_KEYS = {
  conversations: ['chat', 'conversations'] as const,
  quota: ['chat', 'quota'] as const,
  memories: ['chat', 'memories'] as const,
  availability: ['chat', 'availability'] as const,
  agents: ['chat', 'agents'] as const,
};

const ChatContext = createContext<ChatSession | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [sessao] = useState(() => new ChatSession(randomUUID));

  useEffect(() => {
    sessao.setTurnEndListener(() => {
      for (const queryKey of [CHAT_KEYS.conversations, CHAT_KEYS.quota, CHAT_KEYS.memories]) {
        void qc.invalidateQueries({ queryKey });
      }
    });
    // O sistema congela a conexão em segundo plano sem avisar; na volta, uma
    // conexão nova pega a resposta de onde ela estava.
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sessao.reconnect();
    });
    return () => {
      assinatura.remove();
      sessao.setTurnEndListener(null);
    };
  }, [qc, sessao]);

  return <ChatContext.Provider value={sessao}>{children}</ChatContext.Provider>;
}

export function useChatSession(): ChatSession {
  const s = useContext(ChatContext);
  if (!s) throw new Error('useChatSession fora do ChatProvider');
  return s;
}

export function useChatSnapshot(): ChatSessionSnapshot {
  const s = useChatSession();
  return useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);
}
