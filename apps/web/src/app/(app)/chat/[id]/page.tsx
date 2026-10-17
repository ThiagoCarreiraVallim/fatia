import type { Metadata } from 'next';
import { ChatScreen } from '@/components/chat/chat-screen';

export const metadata: Metadata = { title: 'Chat | Fatia' };

export default function ConversaPage() {
  return <ChatScreen />;
}
