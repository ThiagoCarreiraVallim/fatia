import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approvalResume,
  getConversation,
  listConversations,
  openInterrupt,
  pendingCardMode,
  previewChatAction,
  streamChat,
  textoDeErroDoChat,
  undoableWrite,
  undoWrite,
  type ChatStreamError,
  type ChatStreamFrame,
  type UndoableWrite,
} from '@fatia/api-client';
import { Icon, useToast } from '@/components/ui';
import { colors } from '@/theme/colors';
import { AI_WAITING_KEY } from './use-ai-state';

async function approve(
  conversationId: string,
  resume: ReturnType<typeof approvalResume>,
  toolCallId: string | undefined,
): Promise<UndoableWrite | null> {
  let error: ChatStreamError | null = null;
  const frames: ChatStreamFrame[] = [];
  for await (const frame of streamChat({ conversationId, resume })) {
    if (frame.event === 'error') error = frame.data as ChatStreamError;
    else if (frame.event === 'updates') frames.push(frame);
  }
  if (error) throw new Error(textoDeErroDoChat(error));
  return toolCallId ? undoableWrite(frames, toolCallId) : null;
}

/**
 * "Fatia · esperando você" — o `ai-pending-card.tsx` do PWA, mesmas regras:
 * só aprova daqui com a prévia inteira no cartão e uma escrita só
 * (`pendingCardMode`, ADR 039 §6). Conversa que andou desde a pausa (409)
 * vira "Abrir conversa". Depois de gravar, o aviso "Almoço gravado" traz
 * "Desfazer" (`undoableWrite`/`undoWrite` do api-client, iguais na web).
 */
export function AiPendingCard({ enabled, bottom }: { enabled: boolean; bottom: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const waiting = useQuery({
    queryKey: AI_WAITING_KEY,
    queryFn: () => listConversations({ state: 'waiting', limit: 1 }),
    enabled,
    retry: false,
  });
  const conversationId = waiting.data?.[0]?.id;
  const conversation = useQuery({
    queryKey: [...AI_WAITING_KEY, conversationId],
    queryFn: () => getConversation(conversationId!),
    enabled: enabled && Boolean(conversationId),
    retry: false,
  });
  const interrupt = conversation.data ? openInterrupt(conversation.data) : null;
  const action = interrupt?.value.actions[0];
  const confirm = action?.kind === 'confirm' ? action : null;
  const preview = useQuery({
    queryKey: ['chat', 'preview', interrupt?.id],
    queryFn: () => previewChatAction(confirm!.tool, confirm!.arguments),
    enabled: Boolean(confirm) && interrupt!.value.actions.length === 1,
    retry: false,
    staleTime: Infinity,
  });

  const save = useMutation({
    mutationFn: () => approve(conversationId!, approvalResume(interrupt!), confirm?.toolCallId),
    onSuccess: (written) => {
      void qc.invalidateQueries();
      if (!written) {
        toast.show({ message: `Gravado: ${confirm?.title ?? 'registro'}` });
        return;
      }
      toast.show({
        message: written.message,
        action: {
          label: 'Desfazer',
          onPress: () => {
            undoWrite(written)
              .then(() => {
                void qc.invalidateQueries();
                toast.show({ message: 'Desfeito' });
              })
              .catch(() => toast.show({ message: 'Não deu para desfazer.' }));
          },
        },
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });

  if (!enabled || !conversationId || !interrupt || dismissed.has(interrupt.id)) return null;

  const mode = save.isError ? 'open' : pendingCardMode(interrupt.value, preview.data);
  const title = conversation.data?.title ?? 'Conversa';
  const openConversation = () => router.push(`/chat/${conversationId}`);
  const lines = preview.data?.linhas ?? [];

  return (
    <View
      accessibilityLabel="Fatia esperando você"
      style={{ bottom, elevation: 12, borderWidth: 1.5, borderColor: colors.primary }}
      className="absolute inset-x-4 z-50 gap-3 rounded-3xl bg-card p-3.5"
    >
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
          <Icon name="spark" size={18} color={colors.primaryForeground} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] text-muted-foreground">Fatia · esperando você</Text>
          <Text className="font-sans-bold text-[15px] text-foreground">
            {interrupt.value.prompt || title}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lembrar depois"
          onPress={() => setDismissed((s) => new Set(s).add(interrupt.id))}
          className="-mr-1.5 -mt-1.5 h-11 w-11 items-center justify-center rounded-full"
        >
          <Icon name="x" size={18} color={colors.faintForeground} />
        </Pressable>
      </View>

      {mode === 'approve' && lines.length > 0 ? (
        <View className="rounded-2xl bg-muted px-3 py-0.5">
          {lines.map((l, i) => (
            <View
              key={`${l.rotulo}-${i}`}
              className={
                i > 0
                  ? 'min-h-[36px] flex-row items-center justify-between gap-3 border-t border-border'
                  : 'min-h-[36px] flex-row items-center justify-between gap-3'
              }
            >
              <Text className="text-[13px] text-muted-foreground">{l.rotulo}</Text>
              <Text className="font-sans-semibold text-[13px] text-foreground">{l.valor}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {save.isError ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {save.error instanceof Error ? save.error.message : 'Não deu para gravar.'}
        </Text>
      ) : null}

      <View className="flex-row gap-2">
        {mode === 'approve' ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={openConversation}
              className="h-11 flex-1 items-center justify-center rounded-full bg-foreground"
            >
              <Text className="font-sans-bold text-sm text-background">Responder</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: save.isPending }}
              disabled={save.isPending}
              onPress={() => save.mutate()}
              className="h-11 items-center justify-center rounded-full bg-muted px-5"
              style={save.isPending ? { opacity: 0.6 } : undefined}
            >
              <Text className="font-sans-bold text-sm text-foreground">
                {save.isPending ? 'Gravando…' : 'Gravar assim'}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={openConversation}
            className="h-11 flex-1 items-center justify-center rounded-full bg-foreground"
          >
            <Text className="font-sans-bold text-sm text-background">Abrir conversa</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
