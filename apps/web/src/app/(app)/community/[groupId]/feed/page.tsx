import { redirect } from 'next/navigation';

/**
 * O mural é a própria comunidade (`/community/<id>`). Este caminho fica porque
 * é o que os avisos do mural mandam (`community-notices.ts`, na API) e o de
 * links antigos: quem toca na notificação cai no mural do mesmo jeito.
 */
export default async function CommunityFeedRedirect({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  redirect(`/community/${encodeURIComponent(groupId)}`);
}
