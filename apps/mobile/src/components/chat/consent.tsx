import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AI_CONSENT_TEXTS,
  aiConsentBody,
  lastToolName,
  quickReplies,
  type ChatStreamError,
  type ChatThreadState,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui';
import { AI_CONSENT_KEY, useAcceptAiConsent, useAiConsent } from '@/chat/ai-consent';
import { chatUnlocked, showChatConsent } from '@/chat/ai-consent-state';
import { openLegal } from '@/components/profile/legal';

/**
 * O aceite da primeira conversa (prancha IA-Visao), no lugar do campo enquanto não houver: a
 * API recusa o turno com 403 `AI_CONSENT_REQUIRED` sem ele, e esse 403 traz o aviso de volta.
 * Devolve `null` quando já há aceite.
 */
export function ChatConsentSheet({ error }: { error: ChatStreamError | null }) {
  const { data, isPending } = useAiConsent();
  const router = useRouter();
  const queryClient = useQueryClient();
  const recusado = error?.code === 'AI_CONSENT_REQUIRED';
  useEffect(() => {
    if (recusado) void queryClient.invalidateQueries({ queryKey: AI_CONSENT_KEY });
  }, [recusado, queryClient]);
  if (!showChatConsent({ data, isPending })) return null;
  return <AiConsentCard onDecline={() => router.back()} />;
}

/**
 * O cartão do aceite da IA, também fora do chat: o ditado, a foto do prato e o rótulo passam
 * pelo mesmo aceite (403 `AI_CONSENT_REQUIRED` sem ele). `onAccepted` avisa depois de gravado.
 */
export function AiConsentCard({
  onDecline,
  onAccepted,
}: {
  onDecline: () => void;
  onAccepted?: () => void;
}) {
  const aceitar = useAcceptAiConsent();
  const { data, isError, refetch } = useAiConsent();
  const textos = AI_CONSENT_TEXTS.chat;
  // Os nomes do provedor e do modelo vêm da API: sem eles, não há o que aceitar ainda.
  const corpo = data?.processor ? aiConsentBody('chat', data.processor) : null;
  return (
    <View className="m-3 gap-3 rounded-3xl border border-border bg-card p-5 pb-8">
      <Text accessibilityRole="header" className="text-base font-bold text-foreground">
        {textos.title}
      </Text>
      {corpo ? (
        <Text className="text-sm leading-5 text-muted-foreground">{corpo}</Text>
      ) : isError ? (
        <Pressable accessibilityRole="button" onPress={() => void refetch()}>
          <Text className="text-sm text-muted-foreground">
            Não consegui carregar o aviso.{' '}
            <Text className="font-semibold text-primary-text underline">Tentar de novo</Text>
          </Text>
        </Pressable>
      ) : (
        <Text className="text-sm text-muted-foreground">Carregando o aviso…</Text>
      )}
      <Pressable accessibilityRole="link" onPress={() => openLegal('/privacy')}>
        <Text className="text-xs text-muted-foreground underline">{textos.link}</Text>
      </Pressable>
      {aceitar.isError ? (
        <Text accessibilityRole="alert" className="text-xs text-danger">
          Não consegui gravar o aceite. Tente de novo.
        </Text>
      ) : null}
      {/* Concordo e Agora não lado a lado (prancha IA-Estados, "Aceite"). */}
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          disabled={!corpo || aceitar.isPending}
          onPress={() => aceitar.mutate('chat', { onSuccess: () => onAccepted?.() })}
        >
          {textos.accept}
        </Button>
        <Button variant="secondary" className="flex-1" onPress={onDecline}>
          {textos.decline}
        </Button>
      </View>
    </View>
  );
}

/**
 * O campo só aparece com o aceite confirmado: carregando ou sem conseguir ler, não. Escrever
 * só para ouvir um 403 seria pior que esperar o aceite.
 */
export function useChatUnlocked(): boolean {
  return chatUnlocked(useAiConsent().data);
}

/**
 * As respostas rápidas acima do campo (prancha IA-Conversas): o próximo passo natural depois
 * da última consulta (`quickReplies`, o mesmo do PWA). Com pausa na mesa, a resposta é o cartão.
 */
export function QuickReplies({
  thread,
  onSend,
}: {
  thread: ChatThreadState;
  onSend: (text: string) => void;
}) {
  if (thread.interrupt) return null;
  const pilulas = quickReplies({
    lastTool: lastToolName(thread.messages),
    running: thread.running,
  });
  if (pilulas.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}
      className="grow-0"
    >
      {pilulas.map((texto) => (
        <Pressable
          key={texto}
          accessibilityRole="button"
          onPress={() => onSend(texto)}
          className="min-h-[36px] justify-center rounded-full border border-border px-4"
        >
          <Text className="text-sm text-foreground">{texto}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
