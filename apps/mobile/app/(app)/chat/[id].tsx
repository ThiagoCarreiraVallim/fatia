import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { List, Settings2, SquarePen } from 'lucide-react-native';
import {
  AI_SETTINGS_COPY,
  AI_STATES_COPY,
  aiTurnState,
  quotaResetLabel,
  FATIA_AGENT_NAME,
  getChatAvailability,
  getChatQuota,
  listChatAgents,
  type ChatThreadMessage,
  CHAT_CONTINUE_MESSAGE,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import { ErrorState, LoadingState, cn } from '@/components/ui';
import {
  AssistantBlock,
  PlanCard,
  Thinking,
  TurnError,
  UserBubble,
} from '@/components/chat/message-list';
import { AiStateCard } from '@/components/chat/ai-state-card';
import { Composer } from '@/components/chat/composer';
import { PauseCard } from '@/components/chat/pause-card';
import {
  ChatConsentSheet,
  QuickReplies,
  WebSearchSwitch,
  useChatUnlocked,
} from '@/components/chat/consent';
import { CHAT_KEYS, useChatSession, useChatSnapshot } from '@/chat/chat-provider';
import { useKeyboardOverlap } from '@/chat/use-keyboard-overlap';
import { colors } from '@/theme/colors';

/**
 * Uma conversa com o assistente (Fase 9e), paridade com `/chat/[id]` da web.
 *
 * O estado mora na `ChatSession` do layout: sair desta tela não corta a
 * resposta, e voltar mostra o que chegou nesse meio-tempo (ADR 035).
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sessao = useChatSession();
  const {
    thread,
    title,
    agent,
    isNew,
    loading,
    loadError,
    conversationId,
    queue,
    queuePaused,
    quote,
  } = useChatSnapshot();
  const lista = useRef<FlatList<ChatThreadMessage>>(null);

  useEffect(() => {
    if (id) void sessao.open(id);
  }, [id, sessao]);

  const disponibilidade = useQuery({
    queryKey: CHAT_KEYS.availability,
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
  });
  const cota = useQuery({ queryKey: CHAT_KEYS.quota, queryFn: getChatQuota });
  const agentes = useQuery({
    queryKey: CHAT_KEYS.agents,
    queryFn: listChatAgents,
    staleTime: 5 * 60_000,
  });

  // Na conversa nova, quem responde: `undefined` é o padrão da comunidade do assento.
  const [escolhido, setEscolhido] = useState<string | null | undefined>(undefined);
  const agenteDaNova = useMemo(() => {
    const idEscolhido =
      escolhido === undefined ? (agentes.data?.defaultGroupId ?? null) : escolhido;
    return agentes.data?.agents.find((a) => a.groupId === idEscolhido) ?? null;
  }, [agentes.data, escolhido]);
  const nomeDoAgente = isNew ? (agenteDaNova?.name ?? null) : (agent?.name ?? null);

  const aberta = conversationId === id;
  const liberado = useChatUnlocked();
  const ultima = thread.messages.at(-1);
  const pensando =
    thread.running &&
    (!ultima || ultima.role === 'user' || (!ultima.text && ultima.tools.length === 0));
  const continuar = () => void sessao.send({ text: CHAT_CONTINUE_MESSAGE });
  const { ref: areaDoTeclado, overlap: tecladoCobre } = useKeyboardOverlap(
    Platform.OS === 'android',
  );

  useEffect(() => {
    if (thread.messages.length)
      requestAnimationFrame(() => lista.current?.scrollToEnd({ animated: true }));
  }, [thread.messages, thread.interrupt, thread.error, tecladoCobre]);

  const novaConversa = () => {
    const nova = sessao.startNew();
    router.replace(`/chat/${nova}`);
  };

  return (
    <Screen
      title={nomeDoAgente ?? title ?? (isNew ? 'Nova conversa' : 'Conversa')}
      scroll={false}
      actions={
        <>
          <WebSearchSwitch />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={AI_SETTINGS_COPY.title}
            onPress={() => router.push('/chat/settings')}
            className={TOP_BAR_ACTION}
          >
            <Settings2 size={20} color={colors.primaryText} />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Conversas"
            onPress={() => router.push('/chat')}
            className={TOP_BAR_ACTION}
          >
            <List size={20} color={colors.primaryText} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nova conversa"
            onPress={novaConversa}
            className={TOP_BAR_ACTION}
          >
            <SquarePen size={20} color={colors.primaryText} />
          </Pressable>
        </>
      }
    >
      {/* iOS encolhe pelo KeyboardAvoidingView; no Android edge-to-edge a janela não redimensiona
          e o campo ficava atrás do teclado, então a View de dentro empurra pelo quanto ele cobre. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        keyboardVerticalOffset={96}
        className="flex-1"
      >
        <View
          ref={areaDoTeclado}
          collapsable={false}
          className="flex-1"
          style={{ paddingBottom: tecladoCobre }}
        >
          {loading || !aberta ? (
            <LoadingState />
          ) : loadError ? (
            <ErrorState error={loadError} onRetry={() => void sessao.reload()} />
          ) : (
            <FlatList
              ref={lista}
              data={thread.messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: 16, gap: 16, flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="flex-1 justify-center gap-4">
                  <Text className="text-center text-sm text-muted-foreground">
                    Peça para registrar refeição, consultar treino ou ver sua evolução.
                  </Text>
                  {isNew && agentes.data?.agents.length ? (
                    <View className="gap-2">
                      <Text className="text-center text-xs text-muted-foreground">
                        Quem responde
                      </Text>
                      <View className="flex-row flex-wrap justify-center gap-2">
                        {[{ groupId: null, name: FATIA_AGENT_NAME }, ...agentes.data.agents].map(
                          (a) => {
                            const ativo = (agenteDaNova?.groupId ?? null) === a.groupId;
                            return (
                              <Pressable
                                key={a.groupId ?? 'fatia'}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: ativo }}
                                onPress={() => setEscolhido(a.groupId)}
                                className={cn(
                                  'min-h-[44px] justify-center rounded-full border px-4',
                                  ativo ? 'border-primary bg-primary' : 'border-border',
                                )}
                              >
                                <Text
                                  className={cn(
                                    'text-sm',
                                    ativo ? 'text-primary-foreground' : 'text-foreground',
                                  )}
                                >
                                  {a.name}
                                </Text>
                              </Pressable>
                            );
                          },
                        )}
                      </View>
                    </View>
                  ) : null}
                </View>
              }
              renderItem={({ item, index }) =>
                item.role === 'user' ? (
                  <UserBubble
                    text={item.text}
                    photos={item.photos}
                    images={item.images}
                    headline={index === 0}
                  />
                ) : (
                  <AssistantBlock
                    message={item}
                    thread={thread}
                    agentName={nomeDoAgente}
                    showName={thread.messages[index - 1]?.role !== 'assistant'}
                    // A resposta do turno atual pode vir em mais de uma fala do assistente:
                    // "última" é não ter fala da pessoa depois.
                    last={!thread.messages.slice(index + 1).some((m) => m.role === 'user')}
                    onVote={(rowId, review) =>
                      void sessao.vote(rowId, review).catch(() => undefined)
                    }
                    onQuote={(text) => sessao.setQuote(text)}
                    onExplain={(rowId, reasons) =>
                      void sessao.explainVote(rowId, reasons).catch(() => undefined)
                    }
                    onContinue={continuar}
                  />
                )
              }
              ListFooterComponent={
                <View className="gap-3">
                  {thread.plan ? <PlanCard steps={thread.plan} /> : null}
                  {pensando ? <Thinking /> : null}
                  {thread.interrupt && !thread.running ? (
                    <PauseCard
                      pausa={thread.interrupt.value}
                      ocupado={thread.running}
                      onResponder={(valor) => void sessao.resume(valor)}
                    />
                  ) : null}
                  {thread.error ? (
                    <TurnError
                      error={thread.error}
                      // Reenvia a mensagem que falhou, como foi: não a citação que estiver no campo.
                      onRetry={() => void sessao.retry()}
                      onContinue={continuar}
                    />
                  ) : null}
                  {cota.data && !cota.data.allowed && !thread.error ? (
                    // Prancha Al-M11, "Cota": a hora da volta e o registro manual a um toque.
                    <AiStateCard
                      tone="warning"
                      title={AI_STATES_COPY.quotaTitle}
                      body={`${quotaResetLabel(cota.data.resetsAt)} ${AI_STATES_COPY.quotaManual}`}
                      actionLabel={AI_STATES_COPY.quotaAction}
                      onAction={() => router.push('/nutrition')}
                    />
                  ) : cota.data?.usedRatio != null && cota.data.usedRatio >= 0.8 ? (
                    <Text className="text-center text-xs text-muted-foreground">
                      {`Você já usou ${Math.round(cota.data.usedRatio * 100)}% do assistente hoje.`}
                    </Text>
                  ) : null}
                </View>
              }
            />
          )}
          {liberado ? (
            <>
              <QuickReplies thread={thread} onSend={(text) => void sessao.send({ text })} />
              <Composer
                running={thread.running}
                disabled={!aberta || loading || cota.data?.allowed === false}
                blockedPlaceholder={
                  cota.data?.allowed === false
                    ? AI_STATES_COPY.quotaPlaceholder
                    : // Fora do ar o campo segue ligado (a mensagem fica salva), só avisa.
                      thread.error && aiTurnState(thread.error.code) === 'down'
                      ? AI_STATES_COPY.downPlaceholder
                      : undefined
                }
                photosEnabled={disponibilidade.data?.photos ?? false}
                dictationEnabled={disponibilidade.data?.dictation ?? false}
                onSend={(text, photos) =>
                  void sessao.send({ text, photos, ...(isNew ? { agentGroupId: escolhido } : {}) })
                }
                queue={queue}
                queuePaused={queuePaused}
                onSendQueued={(id) => void sessao.sendQueued(id)}
                quote={quote}
                onDismissQuote={() => sessao.setQuote(null)}
                onQueue={(text) => sessao.enqueue(text)}
                onDequeue={(id) => sessao.dequeue(id)}
                onStop={() => void sessao.stop()}
              />
            </>
          ) : null}
          <ChatConsentSheet error={thread.error} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
