import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, KeyRound } from 'lucide-react-native';
import { groupsApi, membershipBadge, teamRoleLabel } from '@fatia/api-client';
import { JoinByCodeDrawer } from '@/components/community/join-by-code-drawer';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import { Button, EmptyState, ErrorState, LoadingState, cn } from '@/components/ui';
import { cores } from '@/theme/cores';

/** Equivalente de `apps/web/src/app/(app)/community/page.tsx`. */
export default function CommunityScreen() {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const groups = useQuery({ queryKey: ['community', 'mine'], queryFn: () => groupsApi.mine() });

  return (
    <>
      <Screen
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Entrar com código"
            onPress={() => setJoining(true)}
            className={TOP_BAR_ACTION}
          >
            <KeyRound size={20} color={cores.primary} />
          </Pressable>
        }
        onRefresh={() => void groups.refetch()}
        refreshing={groups.isRefetching}
      >
        <View className="gap-4 px-5 pb-4 pt-4">
          {groups.isPending ? <LoadingState label="Carregando suas comunidades…" /> : null}
          {groups.isError ? (
            <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
          ) : null}
          {groups.data && groups.data.length === 0 ? (
            <EmptyState
              title="Suas comunidades aparecem aqui"
              description="Entre pelo convite da sua academia ou do seu treinador, ou pelo código que eles divulgam, e escolha o que compartilhar."
              action={<Button onPress={() => setJoining(true)}>Entrar com código</Button>}
            />
          ) : null}
          {groups.data && groups.data.length > 0 ? (
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              {groups.data.map((g, i) => {
                const selo = membershipBadge(g.status);
                return (
                  <Pressable
                    key={g.id}
                    accessibilityRole="link"
                    accessibilityLabel={g.name}
                    onPress={() => router.push(`/community/${g.id}`)}
                    className={cn(
                      'min-h-[56px] flex-row items-center gap-3 px-4 py-3 active:opacity-80',
                      i < groups.data.length - 1 && 'border-b border-border',
                    )}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-medium text-foreground">{g.name}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {selo ? `${teamRoleLabel(g.role)} · ${selo}` : teamRoleLabel(g.role)}
                      </Text>
                    </View>
                    {g.hasAiSeat ? (
                      <Text className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                        PRO
                      </Text>
                    ) : null}
                    <ChevronRight size={16} color={cores.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Screen>

      <JoinByCodeDrawer
        open={joining}
        onOpenChange={setJoining}
        onJoined={(groupId) => router.push(`/community/${groupId}`)}
      />
    </>
  );
}
