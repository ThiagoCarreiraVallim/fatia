'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, MessagesSquare, Settings } from 'lucide-react';
import {
  ApiError,
  canOpenPanel,
  consentSummary,
  FEED_FILTER_LABEL,
  FEED_FILTERS,
  feedApi,
  type FeedFilter,
  groupsApi,
  panelHref,
} from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import { communityKeys } from '@/components/community/query-keys';
import { Composer } from '@/components/feed/composer';
import { PostCard } from '@/components/feed/feed-ui';
import { TopBarActions, topBarActionClass, useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A comunidade abre no mural (Fase 8b, ADR 032; #394, prancha Cm-03), como no
 * app: o carrossel de avisos fixados pela equipe no topo, os filtros (Tudo,
 * Equipe, Conteúdo novo, Membros) e o mais recente. Quem a política deixa
 * publica; todo membro reage, comenta, vota, oculta, bloqueia e denuncia.
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

  const qc = useQueryClient();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const feed = useInfiniteQuery({
    queryKey: communityKeys.feedList(groupId, filter),
    queryFn: ({ pageParam }) => feedApi.list(groupId, pageParam, filter),
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
  const pins = firstPage?.pins ?? [];

  // "N posts novos" é o que chegou desde a última visita; ao abrir o mural, a
  // visita conta (uma vez por tela aberta).
  const [novos, setNovos] = useState<number | null>(null);
  const marcou = useRef(false);
  const visto = useMutation({
    mutationFn: () => feedApi.markSeen(groupId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: communityKeys.forYou(groupId) }),
  });
  useEffect(() => {
    if (!firstPage || marcou.current || filter !== 'all') return;
    marcou.current = true;
    setNovos(firstPage.unseen ?? 0);
    visto.mutate();
  }, [firstPage, filter, visto]);

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
          {pins.length > 0 && (
            <section aria-label="Avisos fixados" className="-mx-4 overflow-x-auto px-4">
              <ul className="flex snap-x snap-mandatory gap-3">
                {pins.map((p) => (
                  <li key={p.id} className="w-[85%] max-w-md shrink-0 snap-start">
                    <PostCard groupId={groupId} post={p} me={me} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {firstPage.canPost ? (
            <Composer
              groupId={groupId}
              me={me}
              team={
                firstPage.isTeam
                  ? { groupName: firstPage.groupName ?? group.data?.name ?? '' }
                  : null
              }
            />
          ) : (
            <p className="rounded-2xl border border-subtle bg-card p-4 text-xs text-muted-foreground">
              Nesta comunidade, só a equipe publica no mural. Você pode reagir e comentar.
            </p>
          )}

          <div
            role="group"
            aria-label="Filtrar o mural"
            className="-mx-4 flex gap-2 overflow-x-auto px-4"
          >
            {FEED_FILTERS.map((f) => (
              <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
                {FEED_FILTER_LABEL[f]}
              </Chip>
            ))}
          </div>

          {novos !== null && novos > 0 && filter === 'all' && (
            <p role="status" className="text-xs font-semibold text-primary">
              {novos === 1 ? '1 post novo' : `${novos} posts novos`} desde a sua última visita
            </p>
          )}

          {posts.length === 0 && filter !== 'all' ? (
            <EmptyState
              icon={MessagesSquare}
              title="Nada por aqui"
              description="Nenhum post deste tipo ainda."
            />
          ) : posts.length === 0 && pins.length === 0 ? (
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
