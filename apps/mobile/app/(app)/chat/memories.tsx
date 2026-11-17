import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import {
  MEMORIES_COPY,
  MEMORY_LIMIT,
  deleteChatMemory,
  forgetAllChatMemories,
  listChatMemories,
  memoryCountLabel,
  memoryMeta,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ErrorState, LoadingState, useConfirm } from '@/components/ui';
import { CHAT_KEYS } from '@/chat/chat-provider';
import { colors } from '@/theme/colors';

/**
 * O que a IA lembra (prancha Al-M9): cada memória com categoria e data, o "n de 50", o aviso
 * de que a equipe não vê e o "Apagar todas" com confirmação. É a mesma lista que o assistente
 * lê; apagar aqui vale para a próxima conversa.
 */
export default function MemoriesScreen() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const memorias = useQuery({ queryKey: CHAT_KEYS.memories, queryFn: listChatMemories });
  const reler = () => {
    void qc.invalidateQueries({ queryKey: CHAT_KEYS.memories });
    void qc.invalidateQueries({ queryKey: CHAT_KEYS.settings });
  };
  const esquecer = useMutation({
    mutationFn: (id: string) => deleteChatMemory(id),
    onSuccess: reler,
  });
  const apagarTodas = useMutation({ mutationFn: forgetAllChatMemories, onSuccess: reler });
  const total = memorias.data?.length ?? 0;

  return (
    <Screen
      title={MEMORIES_COPY.title}
      onRefresh={() => void memorias.refetch()}
      refreshing={memorias.isRefetching}
    >
      <View className="gap-3 p-4 pb-8">
        <Text className="text-sm text-muted-foreground">{MEMORIES_COPY.intro}</Text>
        {memorias.isPending ? <LoadingState /> : null}
        {memorias.isError ? (
          <ErrorState error={memorias.error} onRetry={() => memorias.refetch()} />
        ) : null}
        {memorias.data ? (
          <View className="gap-1.5">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-sm text-muted-foreground">{MEMORIES_COPY.saved}</Text>
              <Text className="text-sm font-semibold text-foreground">
                {memoryCountLabel(total)}
              </Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round(Math.min(1, total / MEMORY_LIMIT) * 100)}%` }}
              />
            </View>
            <Text className="text-xs text-muted-foreground">{MEMORIES_COPY.limitNote}</Text>
          </View>
        ) : null}
        {memorias.data?.length === 0 ? (
          <View className="items-center gap-1 py-6">
            <Text className="text-sm font-semibold text-foreground">
              {MEMORIES_COPY.emptyTitle}
            </Text>
            <Text className="text-xs text-muted-foreground">{MEMORIES_COPY.emptyBody}</Text>
          </View>
        ) : null}
        {memorias.data?.map((m) => (
          <View
            key={m.id}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <View className="flex-1">
              <Text className="text-sm text-foreground">{m.content}</Text>
              <Text className="text-xs text-muted-foreground">{memoryMeta(m)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Esquecer: ${m.content}`}
              disabled={esquecer.isPending}
              onPress={() =>
                confirm({
                  title: 'Esquecer isto?',
                  description: m.content,
                  confirmLabel: 'Esquecer',
                  destructive: true,
                  onConfirm: () => esquecer.mutate(m.id),
                })
              }
              className="h-11 w-11 items-center justify-center"
            >
              <Trash2 size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
        {memorias.data ? (
          <Text className="text-xs text-muted-foreground">{MEMORIES_COPY.teamNote}</Text>
        ) : null}
        {total > 0 ? (
          <Button
            variant="ghost"
            className="self-start"
            loading={apagarTodas.isPending}
            onPress={() =>
              confirm({
                title: MEMORIES_COPY.deleteAllTitle,
                description: MEMORIES_COPY.deleteAllBody,
                confirmLabel: MEMORIES_COPY.deleteAllConfirm,
                destructive: true,
                onConfirm: () => apagarTodas.mutate(),
              })
            }
          >
            <Text className="text-sm font-semibold text-destructive">
              {MEMORIES_COPY.deleteAll}
            </Text>
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}
