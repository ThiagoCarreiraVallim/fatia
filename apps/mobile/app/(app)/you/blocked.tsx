import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { blocksApi, relativeTime, type BlockedUser } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  useConfirm,
  useToast,
} from '@/components/ui';
import { Text } from '@/components/ui/text';

/**
 * Pessoas bloqueadas (Você > Conta, #394) — réplica de
 * `apps/web/src/components/you/blocked-screen.tsx`.
 */
export default function BlockedScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const lista = useQuery({ queryKey: ['blocks'], queryFn: () => blocksApi.list() });
  const desbloquear = useMutation({
    mutationFn: (b: BlockedUser) => blocksApi.unblock(b.id),
    onSuccess: (_, b) => {
      toast.show({ message: `${b.label} desbloqueado(a).` });
      void qc.invalidateQueries({ queryKey: ['blocks'] });
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: () => toast.show({ message: 'Não deu para desbloquear agora.' }),
  });

  return (
    <Screen onRefresh={() => void lista.refetch()} refreshing={lista.isRefetching}>
      <View className="gap-4 px-6 pb-8 pt-4">
        <Text className="text-sm text-muted-foreground">
          Quem você bloqueou não vê seus posts, comentários e reações, e você não vê os dela, em
          nenhuma comunidade. A pessoa não é avisada.
        </Text>
        {lista.isPending ? <LoadingState label="Carregando…" /> : null}
        {lista.isError ? (
          <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
        ) : null}
        {lista.data && lista.data.length === 0 ? (
          <EmptyState
            title="Ninguém bloqueado"
            description="Para bloquear, use o menu de um post ou comentário no mural."
          />
        ) : null}
        {(lista.data ?? []).map((b) => (
          <View
            key={b.id}
            className="flex-row items-center justify-between gap-3 rounded-card bg-card px-4 py-3"
          >
            <View className="flex-1">
              <Text className="font-semibold text-foreground" numberOfLines={1}>
                {b.label}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {[b.groupName, `bloqueado ${relativeTime(b.createdAt)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Button
              size="sm"
              variant="outline"
              onPress={() =>
                confirm({
                  title: `Desbloquear ${b.label}?`,
                  description:
                    'Vocês voltam a ver os posts, comentários e reações um do outro nas comunidades em comum.',
                  confirmLabel: 'Desbloquear',
                  onConfirm: () => desbloquear.mutate(b),
                })
              }
            >
              Desbloquear
            </Button>
          </View>
        ))}
      </View>
    </Screen>
  );
}
