import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Search, Settings2, SquarePen } from 'lucide-react-native';
import {
  AI_SETTINGS_COPY,
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
  ErrorState,
  LoadingState,
  useActionSheet,
  useConfirm,
} from '@/components/ui';
import { DrawerInput } from '@/components/nutrition/drawer-input';
import { CHAT_KEYS, useChatSession } from '@/chat/chat-provider';
import { ChatLocked } from '@/components/billing/chat-locked';
import { colors } from '@/theme/colors';
import { cn } from '@/components/ui';

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Quando foi a última mensagem (prancha Al-M6): a hora hoje, o dia da semana nesta semana e
 * dia/mês antes. Escrito à mão: o Hermes nem sempre tem o locale pt-BR.
 */
function when(iso: string): string {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const dois = (n: number) => String(n).padStart(2, '0');
  if (dias <= 0 && d.getDate() === new Date().getDate()) {
    return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  }
  if (dias < 7) return DIAS_DA_SEMANA[d.getDay()]!;
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
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
        title="Conversas"
        footer={
          semAcesso ? undefined : (
            // O atalho da prancha Al-M6: abre uma conversa nova, onde se escreve de verdade.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nova conversa"
              onPress={nova}
              className="h-14 flex-1 flex-row items-center rounded-full border border-primary/35 bg-card pl-5 pr-1.5"
            >
              <Text className="flex-1 text-[15px] text-muted-foreground">Nova conversa…</Text>
              <View className="size-11 items-center justify-center rounded-full bg-primary">
                <Plus size={20} color={colors.primaryForeground} />
              </View>
            </Pressable>
          )
        }
        actions={
          <>
            {/* A config da IA (modos, busca na web, memórias) mora aqui, e não no topo da
                conversa: lá ficam só o essencial, a lista e a conversa nova (#487). */}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={AI_SETTINGS_COPY.title}
              onPress={() => router.push('/chat/settings')}
              className={TOP_BAR_ACTION}
            >
              <Settings2 size={20} color={colors.primaryText} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nova conversa"
              onPress={nova}
              className={TOP_BAR_ACTION}
            >
              <SquarePen size={20} color={colors.primaryText} />
            </Pressable>
          </>
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
          <View className="h-[52px] flex-row items-center gap-3 rounded-pill bg-card px-5">
            <Search size={20} color={colors.mutedForeground} />
            <TextInput
              accessibilityLabel="Buscar conversa"
              placeholder="Buscar pelo nome"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.primaryText}
              value={busca}
              onChangeText={setBusca}
              returnKeyType="search"
              style={{ flex: 1, fontSize: 16, color: colors.foreground, padding: 0 }}
            />
          </View>
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
            <View key={label}>
              <Text
                accessibilityRole="header"
                className="px-1 pb-1 pt-4 text-sm text-muted-foreground"
              >
                {label}
              </Text>
              {items.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  onOpen={() => router.push(`/chat/${c.id}`)}
                  onOptions={() => showOptions(c)}
                />
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

/**
 * Uma conversa na lista (prancha Al-M6): título, a última fala e quando, sem cartão. A que
 * espera a pessoa ganha o ponto verde e "Esperando você"; a que o assistente ainda responde,
 * o giro e "pensando…".
 */
function ConversationRow({
  conversation: c,
  onOpen,
  onOptions,
}: {
  conversation: ChatConversationSummary;
  onOpen: () => void;
  onOptions: () => void;
}) {
  const esperando = c.state === 'waiting';
  const pensando = c.state === 'thinking';
  const linha = esperando
    ? `Esperando você${c.preview ? ` · ${c.preview}` : ''}`
    : pensando
      ? 'Fatia está pensando…'
      : [c.preview, when(c.updatedAt)].filter(Boolean).join(' · ');
  return (
    <View className="min-h-[64px] flex-row items-center">
      <Pressable
        accessibilityRole="link"
        accessibilityHint="Segure para renomear ou apagar"
        onPress={onOpen}
        onLongPress={onOptions}
        className="flex-1 flex-row items-center gap-3 py-3 pl-1 active:opacity-70"
      >
        <View className="w-3 items-center">
          {esperando ? (
            <View
              accessibilityLabel="Esperando você"
              className="size-2.5 rounded-full bg-primary"
            />
          ) : pensando ? (
            <ActivityIndicator size="small" color={colors.primaryText} />
          ) : null}
        </View>
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-base font-bold text-foreground">
            {c.title ?? 'Conversa sem título'}
          </Text>
          <Text
            numberOfLines={1}
            className={cn('text-sm', esperando ? 'text-primary-text' : 'text-muted-foreground')}
          >
            {linha}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Opções de ${c.title ?? 'conversa'}`}
        onPress={onOptions}
        className="size-11 items-center justify-center"
      >
        <MoreHorizontal size={20} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}
