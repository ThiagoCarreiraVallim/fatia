import { ActivityIndicator, Pressable, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSnapshot } from '@/chat/chat-provider';
import { cores } from '@/theme/cores';

/**
 * A resposta do chat que continua chegando enquanto a pessoa está em outra aba
 * (ADR 035): um aviso discreto acima da barra, que leva de volta à conversa.
 * Com o app fechado, quem avisa é o push "Sua resposta está pronta".
 */
export function BackgroundReply() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversationId, thread } = useChatSnapshot();
  if (!thread.running || !conversationId || pathname.startsWith('/chat')) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="O assistente está respondendo. Abrir a conversa"
      onPress={() => router.push(`/chat/${conversationId}`)}
      style={{ bottom: insets.bottom + 92 }}
      className="absolute right-4 min-h-[44px] flex-row items-center gap-2 rounded-full border border-border bg-card px-4"
    >
      <ActivityIndicator size="small" color={cores.primary} />
      <Text className="text-sm text-foreground">Respondendo…</Text>
    </Pressable>
  );
}
