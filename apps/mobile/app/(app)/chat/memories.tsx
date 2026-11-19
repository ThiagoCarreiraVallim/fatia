import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Apple,
  BookOpen,
  Clock,
  Info,
  ShieldCheck,
  Sun,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import {
  MEMORIES_COPY,
  MEMORY_LIMIT,
  deleteChatMemory,
  forgetAllChatMemories,
  listChatMemories,
  memoryCountLabel,
  memoryMeta,
  type MemoryCategory,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ErrorState, LoadingState, cn, useConfirm } from '@/components/ui';
import { CHAT_KEYS } from '@/chat/chat-provider';
import { colors } from '@/theme/colors';

/** O ícone e a cor de cada categoria, como na prancha Al-M9. Sem categoria (antigas): livro. */
const CATEGORY_CHIP: Record<MemoryCategory, { icon: LucideIcon; color: string; bg: string }> = {
  PREFERENCE: { icon: Apple, color: colors.primaryText, bg: 'bg-primary/15' },
  ROUTINE: { icon: Clock, color: colors.info, bg: 'bg-info/15' },
  TRAINING: { icon: Info, color: colors.warning, bg: 'bg-warning/15' },
  HABIT: { icon: Sun, color: colors.primaryText, bg: 'bg-primary/15' },
};
const NO_CATEGORY_CHIP = { icon: BookOpen, color: colors.mutedForeground, bg: 'bg-muted' };

function CategoryChip({ category }: { category: MemoryCategory | null }) {
  const { icon: Icone, color, bg } = category ? CATEGORY_CHIP[category] : NO_CATEGORY_CHIP;
  return (
    <View className={cn('h-9 w-9 items-center justify-center rounded-xl', bg)}>
      <Icone size={16} color={color} />
    </View>
  );
}

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
        {memorias.data?.length ? (
          <View className="rounded-xl border border-border bg-card">
            {memorias.data.map((m, i) => (
              <View
                key={m.id}
                className={cn(
                  'flex-row items-center gap-3 px-4 py-3',
                  i > 0 && 'border-t border-border',
                )}
              >
                <CategoryChip category={m.category} />
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
          </View>
        ) : null}
        {memorias.data ? (
          <View className="flex-row items-center gap-3 rounded-xl bg-muted p-3">
            <ShieldCheck size={16} color={colors.mutedForeground} />
            <Text className="flex-1 text-xs text-muted-foreground">{MEMORIES_COPY.teamNote}</Text>
          </View>
        ) : null}
        {total > 0 ? (
          <Button
            variant="outline"
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
