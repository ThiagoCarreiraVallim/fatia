import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * No app o mural é a própria comunidade (`/community/<id>`). Este caminho fica
 * porque é o da web e o que os avisos do mural mandam (`community-notices.ts`):
 * quem toca na notificação ou abre um link antigo cai no mural do mesmo jeito.
 */
export default function CommunityFeedRedirect() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <Redirect href={`/community/${groupId}`} />;
}
