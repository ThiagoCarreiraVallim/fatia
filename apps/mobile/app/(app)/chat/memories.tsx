import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { deleteChatMemory, listChatMemories } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { CHAT_KEYS } from '@/chat/chat-provider';
import { cores } from '@/theme/cores';

/**
 * O que o assistente guardou sobre a pessoa, a pedido dela (`save_memory`). É a
 * mesma lista que o assistente lê; apagar aqui vale para a próxima conversa.
 */
export default function MemoriesScreen() {
  const qc = useQueryClient();
  const memorias = useQuery({ queryKey: CHAT_KEYS.memories, queryFn: listChatMemories });
  const esquecer = useMutation({
    mutationFn: (id: string) => deleteChatMemory(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAT_KEYS.memories }),
  });

  return (
    <Screen onRefresh={() => void memorias.refetch()} refreshing={memorias.isRefetching}>
      <View className="gap-2 p-4">
        <Text className="text-sm text-muted-foreground">
          O que você pediu para o assistente lembrar. Apagar faz ele esquecer a partir da próxima
          mensagem.
        </Text>
        {memorias.isPending ? <LoadingState /> : null}
        {memorias.isError ? (
          <ErrorState error={memorias.error} onRetry={() => memorias.refetch()} />
        ) : null}
        {memorias.data?.length === 0 ? (
          <EmptyState
            title="Nada guardado"
            description='Diga ao assistente "lembra que eu não como carne" e aparece aqui.'
          />
        ) : null}
        {memorias.data?.map((m) => (
          <View
            key={m.id}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Text className="flex-1 text-sm text-foreground">{m.content}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Esquecer: ${m.content}`}
              disabled={esquecer.isPending}
              onPress={() =>
                Alert.alert('Esquecer isto?', m.content, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Esquecer', style: 'destructive', onPress: () => esquecer.mutate(m.id) },
                ])
              }
              className="h-11 w-11 items-center justify-center"
            >
              <Trash2 size={18} color={cores.mutedForeground} />
            </Pressable>
          </View>
        ))}
      </View>
    </Screen>
  );
}
