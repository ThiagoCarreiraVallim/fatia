import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { challengesApi } from '@fatia/api-client';
import { ChallengeCard } from '@/components/challenges/challenge-ui';
import { CommunityTabs } from '@/components/community/community-tabs';
import { Screen } from '@/components/layout/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';

/** Equivalente de `apps/web/src/app/(app)/community/[groupId]/challenges/page.tsx`. */
export default function CommunityChallengesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const lista = useQuery({
    queryKey: ['community', 'challenges', groupId],
    queryFn: () => challengesApi.list(groupId),
  });

  if (lista.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando os desafios…" />
      </Screen>
    );
  }
  if (lista.isError) {
    return (
      <Screen>
        <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
      </Screen>
    );
  }
  const todos = lista.data.challenges;
  const abertos = todos.filter((c) => c.status !== 'ended');
  const encerrados = todos.filter((c) => c.status === 'ended');
  const abrir = (id: string) => router.push(`/community/${groupId}/challenges/${id}`);

  return (
    <Screen onRefresh={() => void lista.refetch()} refreshing={lista.isRefetching}>
      <View className="gap-4 px-5 pb-6 pt-4">
        <CommunityTabs groupId={groupId} />
        <Text className="text-sm text-muted-foreground">
          Participar é opcional. O ranking de cada desafio aparece só para quem entrou, com o
          apelido que a pessoa escolheu.
        </Text>
        {todos.length === 0 ? (
          <EmptyState
            title="Nenhum desafio ainda"
            description="Quando a equipe marcar um desafio, ele aparece aqui."
          />
        ) : null}
        {abertos.length > 0 ? (
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
              Em andamento e marcados
            </Text>
            {abertos.map((c) => (
              <ChallengeCard key={c.id} challenge={c} onPress={() => abrir(c.id)} />
            ))}
          </View>
        ) : null}
        {encerrados.length > 0 ? (
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
              Encerrados
            </Text>
            {encerrados.map((c) => (
              <ChallengeCard key={c.id} challenge={c} onPress={() => abrir(c.id)} />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
