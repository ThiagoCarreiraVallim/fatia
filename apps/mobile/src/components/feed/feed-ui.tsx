import { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, MoreHorizontal, Pin } from 'lucide-react-native';
import {
  COMMENT_BODY_MAX,
  commentProblem,
  commentsLabel,
  DISPLAY_NAME_MAX,
  displayNameProblem,
  feedApi,
  moderationApi,
  POST_REACTIONS,
  REACTION_INFO,
  relativeTime,
  removedNotice,
  REPORT_NOTE_MAX,
  REPORT_REASON_LABEL,
  REPORT_REASONS,
  type Post,
  type PostAuthor,
  type PostComment,
  type PostReactionKind,
  type ReportReason,
} from '@fatia/api-client';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { apiMessage, Choice } from '@/components/org/org-panel';
import { Button, Input, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { cores } from '@/theme/cores';

export const feedKey = (groupId: string) => ['community', 'feed', groupId] as const;
export const postKey = (groupId: string, id: string) => ['community', 'feed', groupId, id] as const;

/** Como a pessoa aparece no mural: pedido na primeira vez que ela escreve. */
export interface MyName {
  displayName: string | null;
  suggested: string;
}

export function NicknameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="gap-1">
      <Input
        value={value}
        onChangeText={onChange}
        maxLength={DISPLAY_NAME_MAX}
        accessibilityLabel="Seu apelido no mural"
        placeholder="Seu apelido no mural"
      />
      <Text className="text-xs text-muted-foreground">
        É o nome que os outros membros veem, o mesmo dos desafios.
      </Text>
    </View>
  );
}

function Autor({ author, createdAt }: { author: PostAuthor; createdAt: string }) {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2">
      <Text className="text-sm font-semibold text-foreground">
        {author.isMe ? `${author.displayName} (você)` : author.displayName}
      </Text>
      {author.team ? (
        <Text className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
          Equipe
        </Text>
      ) : null}
      <Text className="text-xs text-muted-foreground">{relativeTime(createdAt)}</Text>
    </View>
  );
}

function Reacoes({ post, onReact }: { post: Post; onReact: (k: PostReactionKind | null) => void }) {
  return (
    <View className="flex-row flex-wrap gap-1" accessibilityLabel="Reações">
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

function Comentarios({ groupId, post, me }: { groupId: string; post: Post; me: MyName }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [apelido, setApelido] = useState(me.suggested);
  const [denunciando, setDenunciando] = useState<PostComment | null>(null);
  const detalhe = useQuery({
    queryKey: postKey(groupId, post.id),
    queryFn: () => feedApi.get(groupId, post.id),
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: postKey(groupId, post.id) });
    void qc.invalidateQueries({ queryKey: feedKey(groupId), exact: true });
  };
  const comentar = useMutation({
    mutationFn: () =>
      feedApi.comment(groupId, post.id, texto.trim(), me.displayName ? undefined : apelido.trim()),
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
  const problema = commentProblem(texto) ?? (me.displayName ? null : displayNameProblem(apelido));

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
      {!me.displayName ? <NicknameField value={apelido} onChange={setApelido} /> : null}
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

/** Um post no mural — equivalente de `apps/web/src/components/feed/feed-ui.tsx`. */
export function PostCard({ groupId, post, me }: { groupId: string; post: Post; me: MyName }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [abertos, setAbertos] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const recarregar = () => void qc.invalidateQueries({ queryKey: feedKey(groupId), exact: true });

  const reagir = useMutation({
    mutationFn: (k: PostReactionKind | null) => feedApi.react(groupId, post.id, k),
    onSuccess: recarregar,
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para reagir agora.') }),
  });
  const acao = useMutation({
    mutationFn: (a: 'delete' | 'remove' | 'pin' | 'unpin'): Promise<unknown> => {
      if (a === 'delete') return feedApi.remove(groupId, post.id);
      if (a === 'remove') return moderationApi.removePost(groupId, post.id);
      if (a === 'pin') return moderationApi.pin(groupId, post.id);
      return moderationApi.unpin(groupId, post.id);
    },
    onSuccess: (_, a) => {
      toast.show({
        message:
          a === 'delete'
            ? 'Post apagado.'
            : a === 'remove'
              ? 'Post removido do mural. Só quem publicou ainda vê.'
              : a === 'pin'
                ? 'Post fixado no topo.'
                : 'Post desafixado.',
      });
      recarregar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para fazer isso agora.') }),
  });

  const confirmar = (a: 'delete' | 'remove') =>
    Alert.alert(
      a === 'delete' ? 'Apagar o post?' : 'Remover do mural?',
      a === 'delete'
        ? 'O post, as imagens e os comentários somem para todo mundo. Não dá para desfazer.'
        : 'O post some para os membros. Quem publicou ainda vê, com o aviso de que a equipe removeu.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: a === 'delete' ? 'Apagar' : 'Remover',
          style: 'destructive',
          onPress: () => acao.mutate(a),
        },
      ],
    );

  const menu = () => {
    const botoes: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (post.canModerate) {
      botoes.push(
        post.pinned
          ? { text: 'Desafixar', onPress: () => acao.mutate('unpin') }
          : { text: 'Fixar no topo', onPress: () => acao.mutate('pin') },
      );
    }
    if (!post.author.isMe && !post.removed) {
      botoes.push({ text: 'Denunciar', onPress: () => setDenunciando(true) });
    }
    if (post.canModerate && !post.author.isMe) {
      botoes.push({
        text: 'Remover do mural',
        style: 'destructive',
        onPress: () => confirmar('remove'),
      });
    }
    if (post.canDelete) {
      botoes.push({
        text: 'Apagar post',
        style: 'destructive',
        onPress: () => confirmar('delete'),
      });
    }
    botoes.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert('Ações do post', `Post de ${post.author.displayName}`, botoes);
  };

  const imagens = post.images.filter((i) => i.url);
  const temAcoes = post.canDelete || post.canModerate || (!post.author.isMe && !post.removed);

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
              <Pin size={12} color={cores.primary} />
              <Text className="text-xs font-semibold text-primary">Fixado pela equipe</Text>
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
            <MoreHorizontal size={18} color={cores.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {post.removed ? (
        <Text className="rounded-xl bg-muted p-3 text-xs text-foreground">
          {removedNotice(post.removed.reason)}
        </Text>
      ) : null}

      {post.body ? <MarkdownLite source={post.body} /> : null}

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
            <MessageCircle size={14} color={cores.mutedForeground} />
            <Text className="text-xs font-semibold text-muted-foreground">
              {commentsLabel(post.commentCount)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {denunciando ? (
        <Denunciar groupId={groupId} postId={post.id} onClose={() => setDenunciando(false)} />
      ) : null}
      {abertos && !post.removed ? <Comentarios groupId={groupId} post={post} me={me} /> : null}
    </View>
  );
}
