'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { LayoutDashboard, MessagesSquare, Settings } from 'lucide-react';
import {
  ApiError,
  canOpenPanel,
  consentSummary,
  feedApi,
  groupsApi,
  panelHref,
} from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import { communityKeys } from '@/components/community/query-keys';
import { Composer } from '@/components/feed/composer';
import { PostCard } from '@/components/feed/feed-ui';
import { TopBarActions, topBarActionClass, useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A comunidade abre no mural (Fase 8b, ADR 032), como no app: os fixados pela
 * equipe no topo, depois o mais recente. Quem a política deixa publica; todo
 * membro reage, comenta e denuncia.
 *
 * O resto do que era a tela principal — sobre, o assento PRO, o que eu
 * compartilho, quem acessou, sair — fica atrás da engrenagem do topo, em
 * `settings`; o painel da equipe, no ícone ao lado. `/feed` só redireciona
 * para cá (avisos do mural e links antigos).
 */
export default function CommunityFeedPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const group = useQuery({
    queryKey: communityKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  useTopBarTitle(group.data?.name);
  // Pedido pendente não lê o mural (a API responde 404): espera o grupo dizer
  // que a pessoa está dentro.
  const active = group.data?.status === 'ACTIVE';

  const feed = useInfiniteQuery({
    queryKey: communityKeys.feed(groupId),
    queryFn: ({ pageParam }) => feedApi.list(groupId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: active,
  });

  const firstPage = feed.data?.pages[0];
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  const me = firstPage
    ? { displayName: firstPage.displayName, suggested: firstPage.suggestedDisplayName }
    : null;
  const settingsHref = `/community/${groupId}/settings`;

  if (group.isError) {
    const notFound = group.error instanceof ApiError && group.error.isNotFound;
    return (
      <div className="p-4">
        <EmptyState
          title={notFound ? 'Comunidade não encontrada' : 'Não deu para carregar a comunidade'}
          description={notFound ? 'Você não faz mais parte dela, ou ela não existe.' : undefined}
          action={
            notFound ? (
              <Button asChild variant="outline">
                <Link href="/community">Minhas comunidades</Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => group.refetch()}>
                Tentar novamente
              </Button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {group.data && (
        <TopBarActions>
          {canOpenPanel(group.data) && (
            <Link
              href={panelHref(groupId)}
              className={topBarActionClass}
              aria-label="Abrir painel da equipe"
            >
              <LayoutDashboard size={20} aria-hidden />
            </Link>
          )}
          <Link
            href={settingsHref}
            className={topBarActionClass}
            aria-label="Sobre a comunidade e o que você compartilha"
          >
            <Settings size={20} aria-hidden />
          </Link>
        </TopBarActions>
      )}

      {group.isPending && (
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-11 rounded-2xl bg-card" />
          <Skeleton className="h-40 rounded-2xl bg-card" />
        </div>
      )}

      {group.data && !active && (
        <section className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
          <p className="text-sm">
            {`Seu pedido está aguardando o dono aprovar. O mural abre quando você entrar, e o que você escolheu compartilhar (${consentSummary(group.data.consentScopes).toLowerCase()}) passa a valer.`}
          </p>
          <Button asChild variant="outline">
            <Link href={settingsHref}>Ver ou cancelar o pedido</Link>
          </Button>
        </section>
      )}

      {active && <CommunityTabs groupId={groupId} />}

      {active && feed.isPending && <Skeleton className="h-40 rounded-2xl bg-card" />}

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

      {firstPage && me && (
        <>
          {firstPage.canPost ? (
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
                firstPage.canPost
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
