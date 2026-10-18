import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, SquarePen } from 'lucide-react-native';
import {
  deleteConversation,
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
} from '@/components/ui';
import { DrawerInput } from '@/components/nutrition/drawer-input';
import { CHAT_KEYS, useChatSession } from '@/chat/chat-provider';
import { cores } from '@/theme/cores';

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
  const conversas = useQuery({
    queryKey: CHAT_KEYS.conversations,
    queryFn: () => listConversations(),
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

  const opcoes = (c: ChatConversationSummary) =>
    Alert.alert(c.title ?? 'Conversa', undefined, [
      {
        text: 'Renomear',
        onPress: () => {
          setTitulo(c.title ?? '');
          setRenomeando(c);
        },
      },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Apagar esta conversa?',
            'Ela some daqui e do assistente. Não dá para desfazer.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Apagar', style: 'destructive', onPress: () => apagar.mutate(c.id) },
            ],
          ),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);

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
            <SquarePen size={20} color={cores.primary} />
          </Pressable>
        }
        onRefresh={() => void conversas.refetch()}
        refreshing={conversas.isRefetching}
      >
        <View className="gap-2 p-4">
          {semAcesso ? (
            <View className="gap-3 rounded-xl border border-border bg-card p-4">
              <Text className="text-base font-semibold text-foreground">
                {disponivel.data?.available
                  ? 'O chat com a IA do Fatia faz parte do plano PRO'
                  : 'O assistente não está disponível neste app'}
              </Text>
              <Text className="text-sm text-muted-foreground">
                O registro manual e a sua própria IA pelo MCP continuam livres.
              </Text>
              {disponivel.data?.available ? (
                <Button onPress={() => router.push('/plan')}>
                  <Text className="text-sm font-bold text-primary-foreground">Ver o plano PRO</Text>
                </Button>
              ) : null}
            </View>
          ) : null}
          {conversas.isPending ? <LoadingState /> : null}
          {conversas.isError ? (
            <ErrorState error={conversas.error} onRetry={() => conversas.refetch()} />
          ) : null}
          {conversas.data?.length === 0 ? (
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
          {conversas.data?.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="link"
              accessibilityHint="Segure para renomear ou apagar"
              onPress={() => router.push(`/chat/${c.id}`)}
              onLongPress={() => opcoes(c)}
              className="min-h-[56px] flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-80"
            >
              <MessageCircle size={18} color={cores.mutedForeground} />
              <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
                {c.title ?? 'Conversa sem título'}
              </Text>
              <Text className="text-xs text-muted-foreground">{quando(c.updatedAt)}</Text>
            </Pressable>
          ))}
        </View>
      </Screen>
      <Drawer open={renomeando !== null} onOpenChange={(v) => !v && setRenomeando(null)}>
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
        <DrawerFooter>
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
