import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Brain, List, SquarePen } from 'lucide-react-native';
import {
  FATIA_AGENT_NAME,
  getChatAvailability,
  getChatQuota,
  listChatAgents,
  type ChatThreadMessage,
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
import { Composer } from '@/components/chat/composer';
import { PauseCard } from '@/components/chat/pause-card';
import { CHAT_KEYS, useChatSession, useChatSnapshot } from '@/chat/chat-provider';
import { cores } from '@/theme/cores';

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
  const { thread, agent, isNew, loading, loadError, conversationId } = useChatSnapshot();
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
  const ultima = thread.messages.at(-1);
  const pensando =
    thread.running &&
    (!ultima || ultima.role === 'user' || (!ultima.text && ultima.tools.length === 0));
  const ultimaPergunta = [...thread.messages].reverse().find((m) => m.role === 'user');

  useEffect(() => {
    if (thread.messages.length)
      requestAnimationFrame(() => lista.current?.scrollToEnd({ animated: true }));
  }, [thread.messages, thread.interrupt, thread.error]);

  const novaConversa = () => {
    const nova = sessao.startNew();
    router.replace(`/chat/${nova}`);
  };

  return (
    <Screen
      title={nomeDoAgente ?? 'Chat'}
      scroll={false}
      actions={
        <>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Memórias do assistente"
            onPress={() => router.push('/chat/memories')}
            className={TOP_BAR_ACTION}
          >
            <Brain size={20} color={cores.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Conversas"
            onPress={() => router.push('/chat')}
            className={TOP_BAR_ACTION}
          >
            <List size={20} color={cores.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nova conversa"
            onPress={novaConversa}
            className={TOP_BAR_ACTION}
          >
            <SquarePen size={20} color={cores.primary} />
          </Pressable>
        </>
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={96}
        className="flex-1"
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
                    <Text className="text-center text-xs text-muted-foreground">Quem responde</Text>
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
                <UserBubble text={item.text} photos={item.photos} />
              ) : (
                <AssistantBlock
                  message={item}
                  thread={thread}
                  agentName={nomeDoAgente}
                  showName={thread.messages[index - 1]?.role !== 'assistant'}
                  onVote={(rowId, review) => void sessao.vote(rowId, review).catch(() => undefined)}
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
                    onRetry={() => {
                      if (ultimaPergunta) void sessao.send({ text: ultimaPergunta.text });
                    }}
                  />
                ) : null}
                {cota.data?.usedRatio != null && cota.data.usedRatio >= 0.8 ? (
                  <Text className="text-center text-xs text-muted-foreground">
                    {cota.data.allowed
                      ? `Você já usou ${Math.round(cota.data.usedRatio * 100)}% do assistente hoje.`
                      : 'Você chegou ao limite de uso do assistente por hoje.'}
                  </Text>
                ) : null}
              </View>
            }
          />
        )}
        <Composer
          running={thread.running}
          disabled={!aberta || loading}
          photosEnabled={disponibilidade.data?.photos ?? false}
          dictationEnabled={disponibilidade.data?.dictation ?? false}
          onSend={(text, photos) =>
            void sessao.send({ text, photos, ...(isNew ? { agentGroupId: escolhido } : {}) })
          }
          onStop={() => void sessao.stop()}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
