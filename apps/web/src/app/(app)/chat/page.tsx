import { redirect } from 'next/navigation';

/**
 * `/chat` abre uma conversa nova, com o id já no endereço.
 *
 * O id nasce aqui, e não no servidor, para a conversa ter endereço antes do
 * primeiro byte voltar: é ele que torna uma pausa do agente retomável depois de
 * um F5 (ADR 023). A linha no banco só nasce com a primeira mensagem.
 */
export default function ChatPage() {
  redirect(`/chat/${crypto.randomUUID()}`);
}
