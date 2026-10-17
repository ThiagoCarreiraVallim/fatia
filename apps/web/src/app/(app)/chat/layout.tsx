import { ChatRuntimeProvider } from '@/components/chat/chat-runtime-provider';

/**
 * O runtime do chat mora aqui, acima de cada conversa: trocar de conversa troca
 * a página, e o runtime — com a lista e a pausa pendente — sobrevive à troca.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <ChatRuntimeProvider>{children}</ChatRuntimeProvider>;
}
