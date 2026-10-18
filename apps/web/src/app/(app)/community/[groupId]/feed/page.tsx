'use client';

import { useParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import { feedApi, groupsApi } from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import { communityKeys } from '@/components/community/query-keys';
import { Composer } from '@/components/feed/composer';
import { PostCard } from '@/components/feed/feed-ui';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * O mural da comunidade (Fase 8b, ADR 032): os fixados pela equipe no topo,
 * depois o mais recente. Quem a política deixa publica; todo membro reage,
 * comenta e denuncia.
 */
export default function CommunityFeedPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const group = useQuery({
    queryKey: communityKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  useTopBarTitle(group.data?.name);

  const feed = useInfiniteQuery({
    queryKey: communityKeys.feed(groupId),
    queryFn: ({ pageParam }) => feedApi.list(groupId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.nextCursor,
  });

  const primeira = feed.data?.pages[0];
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  const me = primeira
    ? { displayName: primeira.displayName, suggested: primeira.suggestedDisplayName }
    : null;

  return (
    <div className="space-y-4 p-4">
      <CommunityTabs groupId={groupId} />

      {feed.isPending && <Skeleton className="h-40 rounded-2xl bg-card" />}

      {feed.isError && (
        <EmptyState
          title="Não deu para carregar o mural"
          action={
            <Button variant="outline" onClick={() => feed.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      )}

      {primeira && me && (
        <>
          {primeira.canPost ? (
            <Composer groupId={groupId} me={me} />
          ) : (
            <p className="rounded-2xl border border-subtle bg-card p-4 text-xs text-muted-foreground">
              Nesta comunidade, só a equipe publica no mural. Você pode reagir e comentar.
            </p>
          )}

          {posts.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="O mural está vazio"
              description={
                primeira.canPost
                  ? 'Conte um treino, uma receita ou uma conquista para a comunidade.'
                  : 'Quando a equipe publicar, aparece aqui.'
              }
            />
          ) : (
            <ul className="space-y-3" aria-label="Posts do mural">
              {posts.map((p) => (
                <li key={p.id}>
                  <PostCard groupId={groupId} post={p} me={me} />
                </li>
              ))}
            </ul>
          )}

          {feed.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              disabled={feed.isFetchingNextPage}
              onClick={() => feed.fetchNextPage()}
            >
              {feed.isFetchingNextPage ? 'Carregando…' : 'Ver posts mais antigos'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
