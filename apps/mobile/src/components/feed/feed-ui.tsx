import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Megaphone, MessageCircle, MoreHorizontal, Pin, Sparkles } from 'lucide-react-native';
import {
  blocksApi,
  COMMENT_BODY_MAX,
  commentProblem,
  commentsLabel,
  feedApi,
  moderationApi,
  PIN_DAY_OPTIONS,
  pinDeadlineLabel,
  POST_REACTIONS,
  REACTION_INFO,
  relativeTime,
  removedNotice,
  REPORT_NOTE_MAX,
  REPORT_REASON_LABEL,
  REPORT_REASONS,
  type AutoPostKind,
  type Post,
  type PostAuthor,
  type PostComment,
  type PostReactionKind,
  type ReportReason,
} from '@fatia/api-client';
import { UserAvatar } from '@/components/you/user-avatar';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { apiMessage, Choice } from '@/components/org/org-panel';
import {
  Button,
  Input,
  cn,
  useActionSheet,
  useConfirm,
  type ActionSheetOption,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';
import { PollBlock } from './poll-block';

import { feedKey, postKey } from './feed-keys';
export { feedKey, feedListKey, forYouKey, postKey } from './feed-keys';

/**
 * Como a pessoa aparece no mural: o nome do perfil (apelido ou primeiro nome),
 * que a API resolve. O app não pergunta mais; para trocar, Você → Editar perfil.
 */
export interface MyName {
  displayName: string;
}

function Autor({ author, createdAt }: { author: PostAuthor; createdAt: string }) {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2">
      {/* Foto só quando a API manda: ela já respeita "Quem vê sua foto" (#387). */}
      <UserAvatar name={author.displayName} url={author.avatarUrl ?? null} size={28} />
      <Text className="text-sm font-semibold text-foreground">
        {author.isMe ? `${author.displayName} (você)` : author.displayName}
      </Text>
      {author.team || author.asGroup ? (
        <Text className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {author.asGroup ? 'Comunidade' : 'Equipe'}
        </Text>
      ) : null}
      <Text className="text-xs text-muted-foreground">{relativeTime(createdAt)}</Text>
    </View>
  );
}

function Reacoes({ post, onReact }: { post: Post; onReact: (k: PostReactionKind | null) => void }) {
  return (
    <View className="flex-row gap-1" accessibilityLabel="Reações">
      {POST_REACTIONS.map((k) => {
        const minha = post.reactions.mine === k;
        const n = post.reactions.counts[k];
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: minha }}
            accessibilityLabel={`${REACTION_INFO[k].label}${n ? `, ${n}` : ''}`}
            onPress={() => onReact(minha ? null : k)}
            className={cn(
              'min-h-[36px] flex-row items-center gap-1 rounded-full border px-2.5',
              minha ? 'border-primary bg-primary/10' : 'border-border',
            )}
          >
            <Text>{REACTION_INFO[k].emoji}</Text>
            {n > 0 ? <Text className="text-xs text-foreground">{n}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Denunciar({
  groupId,
  postId,
  commentId,
  onClose,
}: {
  groupId: string;
  postId: string;
  commentId?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [motivo, setMotivo] = useState<ReportReason>('SPAM');
  const [nota, setNota] = useState('');
  const enviar = useMutation({
    mutationFn: () =>
      feedApi.report(groupId, postId, {
        reason: motivo,
        note: nota.trim() || null,
        commentId: commentId ?? null,
      }),
    onSuccess: () => {
      toast.show({ message: 'Denúncia enviada. Ninguém fica sabendo que foi você.' });
      onClose();
    },
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para enviar a denúncia agora.') }),
  });
  return (
    <View className="gap-3 rounded-xl bg-muted p-3">
      <Text className="text-sm font-semibold text-foreground">
        {commentId ? 'Denunciar comentário' : 'Denunciar post'}
      </Text>
      <Choice
        label="Motivo"
        options={REPORT_REASONS.map((r) => ({ value: r, label: REPORT_REASON_LABEL[r] }))}
        value={motivo}
        onChange={setMotivo}
      />
      <Input
        value={nota}
        onChangeText={setNota}
        maxLength={REPORT_NOTE_MAX}
        accessibilityLabel="Algo mais para a equipe saber (opcional)"
        placeholder="Algo mais para a equipe saber (opcional)"
      />
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onClose}>
          Cancelar
        </Button>
        <Button className="flex-1" loading={enviar.isPending} onPress={() => enviar.mutate()}>
          Denunciar
        </Button>
      </View>
    </View>
  );
}

/**
 * "Bloquear" (prancha Cm-07): pede confirmação com o texto da prancha. Vale em
 * todas as comunidades e nos dois sentidos; desfaz em Você > Conta.
 */
function useBlock(groupId: string) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const toast = useToast();
  const bloquear = useMutation({
    mutationFn: (v: { postId: string; commentId?: string; name: string }) =>
      blocksApi.block({ groupId, postId: v.postId, commentId: v.commentId ?? null }),
    onSuccess: (_, v) => {
      toast.show({ message: `${v.name} bloqueado(a). Dá para desfazer em Você, na seção Conta.` });
      void qc.invalidateQueries({ queryKey: ['community'] });
      void qc.invalidateQueries({ queryKey: ['blocks'] });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para bloquear agora.') }),
  });
  return (v: { postId: string; commentId?: string; name: string }) =>
    confirm({
      title: `Bloquear ${v.name}?`,
      description: `Você deixa de ver os posts, comentários e reações de ${v.name} em todas as comunidades, e ${v.name} deixa de ver os seus. Ninguém é avisado. Dá para desfazer em Você, na seção Conta.`,
      confirmLabel: 'Bloquear',
      destructive: true,
      onConfirm: () => bloquear.mutate(v),
    });
}

function Comments({ groupId, post }: { groupId: string; post: Post }) {
  const qc = useQueryClient();
  const toast = useToast();
  const bloquear = useBlock(groupId);
  const [texto, setTexto] = useState('');
  const [denunciando, setDenunciando] = useState<PostComment | null>(null);
  const detalhe = useQuery({
    queryKey: postKey(groupId, post.id),
    queryFn: () => feedApi.get(groupId, post.id),
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: feedKey(groupId) });
  };
  const comentar = useMutation({
    mutationFn: () => feedApi.comment(groupId, post.id, texto.trim()),
    onSuccess: () => {
      setTexto('');
      recarregar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para comentar agora.') }),
  });
  const apagar = useMutation({
    mutationFn: (c: PostComment): Promise<unknown> =>
      c.canDelete
        ? feedApi.deleteComment(groupId, post.id, c.id)
        : moderationApi.removeComment(groupId, post.id, c.id),
    onSuccess: recarregar,
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para tirar o comentário agora.') }),
  });
  const problema = commentProblem(texto);

  return (
    <View className="gap-3 border-t border-border pt-3">
      {(detalhe.data?.comments ?? []).map((c) => (
        <View key={c.id} className="gap-1">
          <Autor author={c.author} createdAt={c.createdAt} />
          {c.removed ? (
            <Text className="text-xs italic text-muted-foreground">
              Removido pela equipe. Só você vê este comentário.
            </Text>
          ) : null}
          <Text className="text-sm text-foreground">{c.body}</Text>
          <View className="flex-row gap-4">
            {c.canDelete || c.canModerate ? (
              <Pressable accessibilityRole="button" onPress={() => apagar.mutate(c)}>
                <Text className="text-xs text-muted-foreground">
                  {c.canDelete ? 'Apagar' : 'Remover'}
                </Text>
              </Pressable>
            ) : null}
            {!c.author.isMe && !c.removed ? (
              <Pressable accessibilityRole="button" onPress={() => setDenunciando(c)}>
                <Text className="text-xs text-muted-foreground">Denunciar</Text>
              </Pressable>
            ) : null}
            {c.canBlock ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  bloquear({ postId: post.id, commentId: c.id, name: c.author.displayName })
                }
              >
                <Text className="text-xs text-muted-foreground">Bloquear</Text>
              </Pressable>
            ) : null}
          </View>
          {denunciando?.id === c.id ? (
            <Denunciar
              groupId={groupId}
              postId={post.id}
              commentId={c.id}
              onClose={() => setDenunciando(null)}
            />
          ) : null}
        </View>
      ))}
      <Input
        value={texto}
        onChangeText={setTexto}
        maxLength={COMMENT_BODY_MAX}
        multiline
        accessibilityLabel="Escreva um comentário"
        placeholder="Escreva um comentário"
      />
      <Button
        size="sm"
        disabled={Boolean(problema)}
        loading={comentar.isPending}
        onPress={() => comentar.mutate()}
      >
        Enviar comentário
      </Button>
    </View>
  );
}

const AUTO_CTA: Record<AutoPostKind, string> = {
  PLAN: 'Ver o plano',
  TIP: 'Ver a dica',
  EXERCISE: 'Ver o exercício',
  CHALLENGE: 'Ver o desafio',
};

function autoHref(groupId: string, kind: AutoPostKind, refId: string): string {
  const base = `/community/${groupId}`;
  if (kind === 'PLAN') return `${base}/content/${refId}`;
  if (kind === 'CHALLENGE') return `${base}/challenges/${refId}`;
  return `${base}/content?tab=${kind === 'TIP' ? 'tips' : 'exercises'}`;
}

/** Um post no mural — equivalente de `apps/web/src/components/feed/feed-ui.tsx`. */
export function PostCard({ groupId, post }: { groupId: string; post: Post }) {
  const confirm = useConfirm();
  const actionSheet = useActionSheet();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const bloquear = useBlock(groupId);
  const [abertos, setAbertos] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const recarregar = () => void qc.invalidateQueries({ queryKey: feedKey(groupId) });

  const reagir = useMutation({
    mutationFn: (k: PostReactionKind | null) => feedApi.react(groupId, post.id, k),
    onSuccess: recarregar,
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para reagir agora.') }),
  });
  const acao = useMutation({
    mutationFn: (a: 'delete' | 'remove' | 'unpin' | 'hide'): Promise<unknown> => {
      if (a === 'delete') return feedApi.remove(groupId, post.id);
      if (a === 'remove') return moderationApi.removePost(groupId, post.id);
      if (a === 'hide') return feedApi.hide(groupId, post.id);
      return moderationApi.unpin(groupId, post.id);
    },
    onSuccess: (_, a) => {
      toast.show({
        message:
          a === 'delete'
            ? 'Post apagado.'
            : a === 'remove'
              ? 'Post removido do mural. Só quem publicou ainda vê.'
              : a === 'hide'
                ? 'Post oculto. Só some para você.'
                : 'Post desafixado.',
      });
      recarregar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para fazer isso agora.') }),
  });
  const fixar = useMutation({
    mutationFn: (days: number | null) => moderationApi.pin(groupId, post.id, days),
    onSuccess: () => {
      toast.show({ message: 'Post fixado no topo.' });
      recarregar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para fixar agora.') }),
  });
  const copiarLink = () => {
    // O link abre o app no mural; na web, o mesmo caminho abre a mesma tela.
    const url = Linking.createURL(`/community/${groupId}`);
    Clipboard.setStringAsync(url).then(
      () => toast.show({ message: 'Link copiado.' }),
      () => toast.show({ message: 'Não deu para copiar o link.' }),
    );
  };
  const escolherPrazo = () =>
    actionSheet({
      title: 'Fixar no topo',
      description: 'Entra no carrossel de avisos do mural, com até 3 fixados.',
      options: PIN_DAY_OPTIONS.map((o) => ({
        label: o.days ? `Por ${o.label}` : o.label,
        onPress: () => fixar.mutate(o.days),
      })),
    });

  const confirmar = (a: 'delete' | 'remove') =>
    confirm({
      title: a === 'delete' ? 'Apagar o post?' : 'Remover do mural?',
      description:
        a === 'delete'
          ? 'O post, as imagens e os comentários somem para todo mundo. Não dá para desfazer.'
          : 'O post some para os membros. Quem publicou ainda vê, com o aviso de que a equipe removeu.',
      confirmLabel: a === 'delete' ? 'Apagar' : 'Remover',
      destructive: true,
      onConfirm: () => acao.mutate(a),
    });

  const menu = () => {
    // A ordem da prancha Cm-07: copiar, ocultar, bloquear e denunciar.
    const options: ActionSheetOption[] = [];
    if (!post.removed) options.push({ label: 'Copiar link', onPress: copiarLink });
    if (post.canHide)
      options.push({ label: 'Ocultar este post', onPress: () => acao.mutate('hide') });
    if (post.canBlock) {
      options.push({
        label: `Bloquear ${post.author.displayName}`,
        onPress: () => bloquear({ postId: post.id, name: post.author.displayName }),
      });
    }
    if (!post.author.isMe && !post.removed) {
      options.push({ label: 'Denunciar', onPress: () => setDenunciando(true) });
    }
    if (post.canModerate && !post.removed) {
      options.push(
        post.pinned
          ? { label: 'Desafixar', onPress: () => acao.mutate('unpin') }
          : { label: 'Fixar no topo', onPress: escolherPrazo },
      );
    }
    if (post.canModerate && !post.author.isMe) {
      options.push({
        label: 'Remover do mural',
        destructive: true,
        onPress: () => confirmar('remove'),
      });
    }
    if (post.canDelete) {
      options.push({ label: 'Apagar post', destructive: true, onPress: () => confirmar('delete') });
    }
    actionSheet({
      title: 'Ações do post',
      description: `Post de ${post.author.displayName}`,
      options,
    });
  };

  const imagens = post.images.filter((i) => i.url);
  const temAcoes =
    post.canDelete || post.canModerate || !post.removed || post.canHide || post.canBlock;

  return (
    <View
      accessibilityLabel={`Post de ${post.author.displayName}`}
      className={cn(
        'gap-3 rounded-2xl border border-border bg-card p-4',
        post.removed && 'border-dashed opacity-80',
      )}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          {post.pinned ? (
            <View className="flex-row items-center gap-1">
              <Pin size={12} color={colors.primaryText} />
              <Text className="text-xs font-semibold text-primary">
                {pinDeadlineLabel(post.pinnedUntil)}
              </Text>
            </View>
          ) : null}
          {post.kind === 'ANNOUNCEMENT' ? (
            <View className="flex-row items-center gap-1">
              <Megaphone size={12} color={colors.primaryText} />
              <Text className="text-xs font-semibold text-primary">Comunicado</Text>
            </View>
          ) : null}
          {post.kind === 'AUTO' ? (
            <View className="flex-row items-center gap-1">
              <Sparkles size={12} color={colors.primaryText} />
              <Text className="text-xs font-semibold text-primary">Conteúdo novo</Text>
            </View>
          ) : null}
          <Autor author={post.author} createdAt={post.createdAt} />
        </View>
        {temAcoes ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mais ações do post de ${post.author.displayName}`}
            onPress={menu}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
          >
            <MoreHorizontal size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {post.removed ? (
        <Text className="rounded-xl bg-muted p-3 text-xs text-foreground">
          {removedNotice(post.removed.reason)}
        </Text>
      ) : null}

      {post.title ? (
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {post.title}
        </Text>
      ) : null}
      {post.body ? <MarkdownLite source={post.body} /> : null}
      {post.poll ? <PollBlock groupId={groupId} post={post} poll={post.poll} /> : null}
      {post.auto ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(autoHref(groupId, post.auto!.kind, post.auto!.refId) as never)}
          className="min-h-[44px] justify-center"
        >
          <Text className="text-sm font-semibold text-primary">{AUTO_CTA[post.auto.kind]}</Text>
        </Pressable>
      ) : null}

      {imagens.length > 0 ? (
        <View className="flex-row flex-wrap gap-1">
          {imagens.map((img, i) => (
            <Image
              key={img.id}
              source={{ uri: img.url! }}
              accessibilityLabel={`Imagem ${i + 1} do post de ${post.author.displayName}`}
              accessibilityIgnoresInvertColors
              className={cn(
                'rounded-xl bg-muted',
                imagens.length > 1 ? 'h-36 w-[49%]' : 'h-64 w-full',
              )}
              resizeMode="cover"
            />
          ))}
        </View>
      ) : null}

      {!post.removed ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Reacoes post={post} onReact={(k) => reagir.mutate(k)} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: abertos }}
            onPress={() => setAbertos((v) => !v)}
            className="min-h-[36px] flex-row items-center gap-1"
          >
            <MessageCircle size={14} color={colors.mutedForeground} />
            <Text className="text-xs font-semibold text-muted-foreground">
              {commentsLabel(post.commentCount)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {denunciando ? (
        <Denunciar groupId={groupId} postId={post.id} onClose={() => setDenunciando(false)} />
      ) : null}
      {abertos && !post.removed ? <Comments groupId={groupId} post={post} /> : null}
    </View>
  );
}
