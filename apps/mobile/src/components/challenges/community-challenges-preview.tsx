import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { challengesApi } from '@fatia/api-client';
import { ChallengeCard } from './challenge-ui';

/** Equivalente de `apps/web/src/components/challenges/community-challenges-preview.tsx`. */
export function CommunityChallengesPreview({ groupId }: { groupId: string }) {
  const router = useRouter();
  const lista = useQuery({
    queryKey: ['community', 'challenges', groupId],
    queryFn: () => challengesApi.list(groupId),
  });
  const abertos = (lista.data?.challenges ?? []).filter((c) => c.status !== 'ended').slice(0, 2);
  if (abertos.length === 0) return null;
  const todos = `/community/${groupId}/challenges`;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
          Desafios
        </Text>
        <Pressable accessibilityRole="link" onPress={() => router.push(todos)} hitSlop={12}>
          <Text className="text-xs font-semibold text-primary">Ver todos</Text>
        </Pressable>
      </View>
      {abertos.map((c) => (
        <ChallengeCard key={c.id} challenge={c} onPress={() => router.push(`${todos}/${c.id}`)} />
      ))}
    </View>
  );
}
