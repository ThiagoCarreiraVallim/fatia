import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Lock } from 'lucide-react-native';
import {
  AI_NEVER_AUTOMATIC,
  AI_SETTINGS_COPY,
  AI_WRITE_CATEGORIES,
  AI_WRITE_MODE_LABELS,
  getAiSettings,
  memoryCountLabel,
  nextAiWriteMode,
  setAiWriteMode,
  type AiSettings,
  type AiWriteCategory,
  type AiWriteMode,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { Screen } from '@/components/layout/screen';
import { ErrorState, LoadingState, Switch, cn } from '@/components/ui';
import { CHAT_KEYS } from '@/chat/chat-provider';
import { useWebSearchSwitch } from '@/chat/ai-consent';
import { colors } from '@/theme/colors';

const COR_DO_MODO: Record<AiWriteMode, string> = {
  ASK: 'bg-muted',
  AUTO: 'bg-primary/15',
  OFF: 'bg-muted/50',
};

/**
 * Config da IA (prancha Al-M24, ADR 039): o modo de cada categoria (toque gira Perguntar
 * antes → Automático → Desligado), o que nunca é automático, a busca na web (a mesma chave
 * do topo do chat) e os atalhos. A escolha do agente fica na conversa nova, como antes.
 */
export default function AiSettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const config = useQuery({ queryKey: CHAT_KEYS.settings, queryFn: getAiSettings });
  const mudarModo = useMutation({
    mutationFn: ({ categoria, modo }: { categoria: AiWriteCategory; modo: AiWriteMode }) =>
      setAiWriteMode(categoria, modo),
    onSuccess: (modes) =>
      qc.setQueryData<AiSettings>(CHAT_KEYS.settings, (antes) =>
        antes ? { ...antes, modes } : antes,
      ),
  });
  const busca = useWebSearchSwitch();
  const textos = AI_SETTINGS_COPY;
  const dados = config.data;

  return (
    <Screen
      title={textos.title}
      onRefresh={() => void config.refetch()}
      refreshing={config.isRefetching}
    >
      <View className="gap-5 p-4 pb-8">
        {config.isPending ? <LoadingState /> : null}
        {config.isError ? (
          <ErrorState error={config.error} onRetry={() => config.refetch()} />
        ) : null}
        {dados ? (
          <>
            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground">{textos.modesTitle}</Text>
              <View className="rounded-xl border border-border bg-card">
                {AI_WRITE_CATEGORIES.map((c, i) => {
                  const modo = dados.modes[c.key];
                  return (
                    <Pressable
                      key={c.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.title}: ${AI_WRITE_MODE_LABELS[modo]}. Toque para trocar`}
                      disabled={mudarModo.isPending}
                      onPress={() =>
                        mudarModo.mutate({ categoria: c.key, modo: nextAiWriteMode(modo) })
                      }
                      className={cn(
                        'min-h-14 flex-row items-center gap-3 px-4 py-3',
                        i > 0 && 'border-t border-border',
                      )}
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-foreground">{c.title}</Text>
                        <Text className="text-xs text-muted-foreground">{c.description}</Text>
                      </View>
                      <View className={cn('rounded-full px-3 py-1', COR_DO_MODO[modo])}>
                        <Text className="text-xs font-semibold text-foreground">
                          {AI_WRITE_MODE_LABELS[modo]}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {mudarModo.isError ? (
                <Text accessibilityRole="alert" className="text-xs text-destructive">
                  Não consegui mudar agora. Tente de novo.
                </Text>
              ) : null}
              <Text className="text-xs text-muted-foreground">{textos.modesNote}</Text>
              <Text className="text-xs text-muted-foreground">{textos.offNote}</Text>
            </View>

            <View className="gap-2 rounded-xl bg-muted p-4">
              <View className="flex-row items-center gap-2">
                <Lock size={14} color={colors.foreground} />
                <Text className="text-sm font-semibold text-foreground">{textos.neverTitle}</Text>
              </View>
              {AI_NEVER_AUTOMATIC.map((item) => (
                <Text key={item} className="text-sm text-foreground">
                  {item}
                </Text>
              ))}
              <Text className="text-xs text-muted-foreground">{textos.neverNote}</Text>
            </View>

            <View className="gap-2">
              <View className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">{textos.webTitle}</Text>
                  <Text className="text-xs text-muted-foreground">{textos.webDescription}</Text>
                </View>
                <Switch
                  checked={dados.webSearchEnabled}
                  label={textos.webTitle}
                  onCheckedChange={(ligada) =>
                    busca.mutate(ligada, {
                      onSuccess: () =>
                        qc.setQueryData<AiSettings>(CHAT_KEYS.settings, (antes) =>
                          antes ? { ...antes, webSearchEnabled: ligada } : antes,
                        ),
                    })
                  }
                />
              </View>
              <Text className="text-xs text-muted-foreground">{textos.webNote}</Text>
            </View>

            <View className="gap-1">
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                {textos.moreTitle}
              </Text>
              <View className="rounded-xl border border-border bg-card">
                <Linha
                  label={textos.memories}
                  detalhe={memoryCountLabel(dados.memories.count, dados.memories.limit)}
                  onPress={() => router.push('/chat/memories')}
                />
                <Linha label={textos.ownAi} onPress={() => router.push('/profile/tokens')} borda />
                <Linha label={textos.plan} onPress={() => router.push('/plan')} borda />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Linha({
  label,
  detalhe,
  onPress,
  borda,
}: {
  label: string;
  detalhe?: string;
  onPress: () => void;
  borda?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={detalhe ? `${label}, ${detalhe}` : label}
      onPress={onPress}
      className={cn('min-h-12 flex-row items-center gap-3 px-4', borda && 'border-t border-border')}
    >
      <Text className="flex-1 text-sm text-foreground">{label}</Text>
      {detalhe ? <Text className="text-xs text-muted-foreground">{detalhe}</Text> : null}
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}
