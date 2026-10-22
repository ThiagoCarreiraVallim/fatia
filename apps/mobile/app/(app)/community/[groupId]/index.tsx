import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Settings } from 'lucide-react-native';
import {
  ApiError,
  canOpenPanel,
  consentSummary,
  displayNameProblem,
  feedApi,
  groupsApi,
  panelHref,
  POST_BODY_MAX,
  POST_MAX_IMAGES,
  postProblem,
} from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import type { ImageValue } from '@/components/content/image-field';
import { PhotosField } from '@/components/content/photos-field';
import { feedKey, NicknameField, PostCard, type MyName } from '@/components/feed/feed-ui';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import { apiMessage } from '@/components/org/org-panel';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { cores } from '@/theme/cores';

function Composer({ groupId, me }: { groupId: string; me: MyName }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [imagens, setImagens] = useState<ImageValue[]>([]);
  const [apelido, setApelido] = useState(me.suggested);
  const publicar = useMutation({
    mutationFn: () =>
      feedApi.create(groupId, {
        body: texto.trim(),
        imageFileIds: imagens.map((i) => i.fileId),
        ...(me.displayName ? {} : { displayName: apelido.trim() }),
      }),
    onSuccess: () => {
      setTexto('');
      setImagens([]);
      toast.show({ message: 'Publicado no mural.' });
      void qc.invalidateQueries({ queryKey: feedKey(groupId) });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para publicar agora.') }),
  });
  const escreveu = texto.trim().length > 0 || imagens.length > 0;
  const problema =
    postProblem(texto, imagens.length) ?? (me.displayName ? null : displayNameProblem(apelido));

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Input
        value={texto}
        onChangeText={setTexto}
        maxLength={POST_BODY_MAX}
        multiline
        className="min-h-[80px]"
        textAlignVertical="top"
        accessibilityLabel="O que você quer contar para a comunidade?"
        placeholder="O que você quer contar para a comunidade?"
      />
      <PhotosField
        groupId={groupId}
        value={imagens}
        onChange={setImagens}
        purpose="post_image"
        max={POST_MAX_IMAGES}
        label={`Imagens (até ${POST_MAX_IMAGES})`}
        addLabel="Adicionar imagens"
      />
      {!me.displayName && escreveu ? <NicknameField value={apelido} onChange={setApelido} /> : null}
      {problema && escreveu ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {problema}
        </Text>
      ) : null}
      <Button
        disabled={Boolean(problema)}
        loading={publicar.isPending}
        onPress={() => publicar.mutate()}
      >
        Publicar
      </Button>
    </View>
  );
}

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
  const feed = useInfiniteQuery({
    queryKey: feedKey(groupId),
    queryFn: ({ pageParam }) => feedApi.list(groupId, pageParam),
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
                <LayoutDashboard size={20} color={cores.mutedForeground} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Sobre a comunidade e o que você compartilha"
              onPress={() => router.push(settingsHref)}
              className={TOP_BAR_ACTION}
            >
              <Settings size={20} color={cores.mutedForeground} />
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
            {primeira.canPost ? (
              <Composer groupId={groupId} me={me} />
            ) : (
              <Text className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                Nesta comunidade, só a equipe publica no mural. Você pode reagir e comentar.
              </Text>
            )}
            {posts.length === 0 ? (
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
