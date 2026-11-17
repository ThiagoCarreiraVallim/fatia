import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, SquarePen } from 'lucide-react-native';
import {
  deleteConversation,
  groupConversationsByDay,
  getChatAvailability,
  listConversations,
  renameConversation,
  type ChatConversationSummary,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  Input,
  ErrorState,
  LoadingState,
  useActionSheet,
  useConfirm,
} from '@/components/ui';
import { DrawerInput } from '@/components/nutrition/drawer-input';
import { CHAT_KEYS, useChatSession } from '@/chat/chat-provider';
import { ChatLocked } from '@/components/billing/chat-locked';
import { colors } from '@/theme/colors';

/** Data curta da última mensagem: "hoje", "ontem" ou dia/mês. */
function quando(iso: string): string {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * As conversas com o assistente (Fase 9e). Tocar abre; segurar renomeia ou
 * apaga — apagar leva junto o estado que o agente guardou dela (ADR 023).
 */
export default function ConversationsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const sessao = useChatSession();
  const confirm = useConfirm();
  const actionSheet = useActionSheet();
  const [busca, setBusca] = useState('');
  const termo = busca.trim();
  const conversas = useQuery({
    queryKey: [...CHAT_KEYS.conversations, termo],
    queryFn: () => listConversations(termo || undefined),
  });
  const disponivel = useQuery({ queryKey: CHAT_KEYS.availability, queryFn: getChatAvailability });
  const [renomeando, setRenomeando] = useState<ChatConversationSummary | null>(null);
  const [titulo, setTitulo] = useState('');

  const renomear = useMutation({
    mutationFn: (c: { id: string; title: string }) => renameConversation(c.id, c.title),
    onSuccess: () => {
      setRenomeando(null);
      void qc.invalidateQueries({ queryKey: CHAT_KEYS.conversations });
    },
  });
  const apagar = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAT_KEYS.conversations }),
  });

  const nova = () => router.push(`/chat/${sessao.startNew()}`);

  const showOptions = (c: ChatConversationSummary) =>
    actionSheet({
      title: c.title ?? 'Conversa',
      options: [
        {
          label: 'Renomear',
          onPress: () => {
            setTitulo(c.title ?? '');
            setRenomeando(c);
          },
        },
        {
          label: 'Apagar',
          destructive: true,
          onPress: () =>
            confirm({
              title: 'Apagar esta conversa?',
              description: 'Ela some daqui e do assistente. Não dá para desfazer.',
              confirmLabel: 'Apagar',
              destructive: true,
              onConfirm: () => apagar.mutate(c.id),
            }),
        },
      ],
    });

  const semAcesso = disponivel.data && (!disponivel.data.available || !disponivel.data.allowed);

  return (
    <>
      <Screen
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nova conversa"
            onPress={nova}
            className={TOP_BAR_ACTION}
          >
            <SquarePen size={20} color={colors.primaryText} />
          </Pressable>
        }
        onRefresh={() => void conversas.refetch()}
        refreshing={conversas.isRefetching}
      >
        <View className="gap-2 p-4">
          {semAcesso ? <ChatLocked available={disponivel.data?.available === true} /> : null}
          {conversas.isPending ? <LoadingState /> : null}
          {conversas.isError ? (
            <ErrorState error={conversas.error} onRetry={() => conversas.refetch()} />
          ) : null}
          <Input
            accessibilityLabel="Buscar conversa"
            placeholder="Buscar pelo nome"
            value={busca}
            onChangeText={setBusca}
            returnKeyType="search"
          />
          {conversas.data?.length === 0 && termo ? (
            <Text className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma conversa com esse nome.
            </Text>
          ) : null}
          {conversas.data?.length === 0 && !termo ? (
            <EmptyState
              title="Nenhuma conversa ainda"
              description="Pergunte o que comeu ontem, peça para registrar o almoço ou veja sua evolução."
              action={
                semAcesso ? undefined : (
                  <Button onPress={nova}>
                    <Text className="text-sm font-bold text-primary-foreground">Nova conversa</Text>
                  </Button>
                )
              }
            />
          ) : null}
          {/* Hoje, Esta semana e Antes, como no PWA (`groupConversationsByDay`). */}
          {groupConversationsByDay(conversas.data ?? []).map(({ label, items }) => (
            <View key={label} className="gap-2">
              <Text
                accessibilityRole="header"
                className="px-1 pt-3 text-xs font-semibold uppercase text-muted-foreground"
              >
                {label}
              </Text>
              {items.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="link"
                  accessibilityHint="Segure para renomear ou apagar"
                  onPress={() => router.push(`/chat/${c.id}`)}
                  onLongPress={() => showOptions(c)}
                  className="min-h-[56px] flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-80"
                >
                  <MessageCircle size={18} color={colors.mutedForeground} />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                      {c.title ?? 'Conversa sem título'}
                    </Text>
                    {c.preview ? (
                      <Text numberOfLines={1} className="text-xs text-muted-foreground">
                        {c.preview}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-xs text-muted-foreground">{quando(c.updatedAt)}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </Screen>
      <Drawer
        open={renomeando !== null}
        onOpenChange={(v) => !v && setRenomeando(null)}
        snapPoints={['85%']}
      >
        <DrawerHeader>
          <DrawerTitle>Renomear conversa</DrawerTitle>
        </DrawerHeader>
        <DrawerContent>
          <DrawerInput
            label="Nome"
            value={titulo}
            onChangeText={setTitulo}
            maxLength={120}
            autoFocus
          />
        </DrawerContent>
        <DrawerFooter className="pb-8">
          <Button
            disabled={!titulo.trim() || renomear.isPending}
            onPress={() =>
              renomeando && renomear.mutate({ id: renomeando.id, title: titulo.trim() })
            }
          >
            <Text className="text-sm font-bold text-primary-foreground">Salvar</Text>
          </Button>
        </DrawerFooter>
      </Drawer>
    </>
  );
}
