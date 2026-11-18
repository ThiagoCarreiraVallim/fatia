import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Settings } from 'lucide-react-native';
import {
  ApiError,
  canOpenPanel,
  consentSummary,
  FEED_FILTER_LABEL,
  FEED_FILTERS,
  feedApi,
  groupsApi,
  panelHref,
  type FeedFilter,
} from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import { Composer } from '@/components/feed/composer';
import { feedListKey, forYouKey, PostCard } from '@/components/feed/feed-ui';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import { Button, Chip, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { colors } from '@/theme/colors';

/**
 * A comunidade abre no mural (equivalente de
 * `apps/web/src/app/(app)/community/[groupId]/page.tsx`). O resto do que
 * era a tela principal — sobre, o que eu compartilho, quem acessou, sair — fica
 * atrás da engrenagem, em `settings.tsx`; o painel da equipe, no ícone ao lado.
 */
export default function CommunityFeedScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const group = useQuery({
    queryKey: ['community', 'group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });
  // Pedido pendente não lê o mural (a API responde 404): espera o grupo dizer
  // que a pessoa está dentro.
  const ativo = group.data?.status === 'ACTIVE';
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<FeedFilter>('all');
  const feed = useInfiniteQuery({
    queryKey: feedListKey(groupId, filtro),
    queryFn: ({ pageParam }) => feedApi.list(groupId, pageParam, filtro),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.nextCursor,
    enabled: ativo,
  });
  const primeira = feed.data?.pages[0];
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  const me = primeira
    ? { displayName: primeira.displayName, suggested: primeira.suggestedDisplayName }
    : null;
  const settingsHref = `/community/${groupId}/settings`;
  const pins = primeira?.pins ?? [];

  // "N posts novos" desde a última visita; abrir o mural conta a visita, uma vez.
  const [novos, setNovos] = useState<number | null>(null);
  const marcou = useRef(false);
  const visto = useMutation({
    mutationFn: () => feedApi.markSeen(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: forYouKey(groupId) });
      // O cartão de Minhas comunidades conta os posts novos desde a visita (#393).
      void qc.invalidateQueries({ queryKey: ['community', 'mine'] });
    },
  });
  useEffect(() => {
    if (!primeira || marcou.current || filtro !== 'all') return;
    marcou.current = true;
    setNovos(primeira.unseen ?? 0);
    visto.mutate();
  }, [primeira, filtro, visto]);

  if (group.isError) {
    const sumiu = group.error instanceof ApiError && group.error.isNotFound;
    return (
      <Screen>
        <View className="px-5 pt-4">
          {sumiu ? (
            <EmptyState
              title="Comunidade não encontrada"
              description="Você não faz mais parte dela, ou ela não existe."
            />
          ) : (
            <ErrorState error={group.error} onRetry={() => void group.refetch()} />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={group.data?.name ?? 'Mural'}
      onRefresh={() => void Promise.all([group.refetch(), ativo ? feed.refetch() : null])}
      refreshing={feed.isRefetching || group.isRefetching}
      actions={
        group.data ? (
          <>
            {canOpenPanel(group.data) ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Abrir painel da equipe"
                onPress={() => router.push(panelHref(groupId))}
                className={TOP_BAR_ACTION}
              >
                <LayoutDashboard size={20} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Sobre a comunidade e o que você compartilha"
              onPress={() => router.push(settingsHref)}
              className={TOP_BAR_ACTION}
            >
              <Settings size={20} color={colors.mutedForeground} />
            </Pressable>
          </>
        ) : undefined
      }
    >
      <View className="gap-4 px-5 pb-6 pt-4">
        {group.isPending ? <LoadingState label="Carregando a comunidade…" /> : null}
        {group.data && !ativo ? (
          <View className="gap-3 rounded-2xl border border-border bg-card p-4">
            <Text className="text-sm text-foreground">
              {`Seu pedido está aguardando o dono aprovar. O mural abre quando você entrar, e o que você escolheu compartilhar (${consentSummary(group.data.consentScopes).toLowerCase()}) passa a valer.`}
            </Text>
            <Button variant="outline" onPress={() => router.push(settingsHref)}>
              Ver ou cancelar o pedido
            </Button>
          </View>
        ) : null}
        {ativo ? <CommunityTabs groupId={groupId} /> : null}
        {feed.isPending && ativo ? <LoadingState label="Carregando o mural…" /> : null}
        {feed.isError ? (
          <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
        ) : null}
        {primeira && me ? (
          <>
            {pins.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityLabel="Avisos fixados"
                contentContainerClassName="gap-3"
                className="-mx-5"
                contentContainerStyle={{ paddingHorizontal: 20 }}
              >
                {pins.map((p) => (
                  <View key={p.id} className="w-[300px]">
                    <PostCard groupId={groupId} post={p} me={me} />
                  </View>
                ))}
              </ScrollView>
            ) : null}
            {primeira.canPost ? (
              <Composer
                groupId={groupId}
                me={me}
                team={
                  primeira.isTeam
                    ? { groupName: primeira.groupName ?? group.data?.name ?? '' }
                    : null
                }
              />
            ) : (
              <Text className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                Nesta comunidade, só a equipe publica no mural. Você pode reagir e comentar.
              </Text>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityLabel="Filtrar o mural"
              contentContainerClassName="gap-2"
            >
              {FEED_FILTERS.map((f) => (
                <Chip
                  key={f}
                  label={FEED_FILTER_LABEL[f]}
                  selected={filtro === f}
                  onPress={() => setFiltro(f)}
                />
              ))}
            </ScrollView>
            {novos !== null && novos > 0 && filtro === 'all' ? (
              <Text accessibilityRole="alert" className="text-xs font-semibold text-primary">
                {`${novos === 1 ? '1 post novo' : `${novos} posts novos`} desde a sua última visita`}
              </Text>
            ) : null}
            {posts.length === 0 && filtro !== 'all' ? (
              <EmptyState title="Nada por aqui" description="Nenhum post deste tipo ainda." />
            ) : posts.length === 0 && pins.length === 0 ? (
              <EmptyState
                title="O mural está vazio"
                description={
                  primeira.canPost
                    ? 'Conte um treino, uma receita ou uma conquista para a comunidade.'
                    : 'Quando a equipe publicar, aparece aqui.'
                }
              />
            ) : (
              posts.map((p) => <PostCard key={p.id} groupId={groupId} post={p} me={me} />)
            )}
            {feed.hasNextPage ? (
              <Button
                variant="outline"
                loading={feed.isFetchingNextPage}
                onPress={() => void feed.fetchNextPage()}
              >
                Ver posts mais antigos
              </Button>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}
