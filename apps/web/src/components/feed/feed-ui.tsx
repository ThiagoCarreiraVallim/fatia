'use client';

import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircle, MoreHorizontal, Pin, ShieldAlert } from 'lucide-react';
import {
  ApiError,
  COMMENT_BODY_MAX,
  commentProblem,
  DISPLAY_NAME_MAX,
  displayNameProblem,
  commentsLabel,
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
import { communityKeys } from '@/components/community/query-keys';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function apiMessage(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

function Autor({ author, createdAt }: { author: PostAuthor; createdAt: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      <span className="font-semibold">
        {author.isMe ? `${author.displayName} (você)` : author.displayName}
      </span>
      {author.team && (
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
          Equipe
        </span>
      )}
      <time dateTime={createdAt} className="text-xs text-muted-foreground">
        {relativeTime(createdAt)}
      </time>
    </p>
  );
}

function Imagens({ post }: { post: Post }) {
  const imgs = post.images.filter((i) => i.url);
  if (imgs.length === 0) return null;
  return (
    <ul
      aria-label="Imagens do post"
      className={cn('grid gap-1 overflow-hidden rounded-xl', imgs.length > 1 && 'grid-cols-2')}
    >
      {imgs.map((img, i) => (
        <li key={img.id}>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador */}
          <img
            src={img.url!}
            alt={`Imagem ${i + 1} do post de ${post.author.displayName}`}
            className={cn(
              'w-full bg-muted object-cover',
              imgs.length > 1 ? 'aspect-square' : 'max-h-[480px]',
            )}
          />
        </li>
      ))}
    </ul>
  );
}

function Reacoes({ post, onReact }: { post: Post; onReact: (k: PostReactionKind | null) => void }) {
  return (
    <div role="group" aria-label="Reações" className="flex flex-wrap gap-1">
      {POST_REACTIONS.map((k) => {
        const minha = post.reactions.mine === k;
        const n = post.reactions.counts[k];
        return (
          <button
            key={k}
            type="button"
            aria-pressed={minha}
            aria-label={`${REACTION_INFO[k].label}${n ? `, ${n}` : ''}`}
            onClick={() => onReact(minha ? null : k)}
            className={cn(
              'flex min-h-[36px] items-center gap-1 rounded-full border px-2.5 text-sm',
              minha ? 'border-primary bg-primary/10' : 'border-subtle hover:bg-accent/40',
            )}
          >
            <span aria-hidden>{REACTION_INFO[k].emoji}</span>
            {n > 0 && <span className="text-xs tabular-nums">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

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
  const id = useId();
  return (
    <div className="space-y-1 text-sm">
      <Label htmlFor={id}>Seu apelido no mural</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={DISPLAY_NAME_MAX}
        aria-describedby={`${id}-ajuda`}
      />
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        É o nome que os outros membros veem, o mesmo dos desafios.
      </p>
    </div>
  );
}

function Comentarios({ groupId, post, me }: { groupId: string; post: Post; me: MyName }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [apelido, setApelido] = useState(me.suggested);
  const [denunciando, setDenunciando] = useState<PostComment | null>(null);
  const detalhe = useQuery({
    queryKey: communityKeys.post(groupId, post.id),
    queryFn: () => feedApi.get(groupId, post.id),
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: communityKeys.post(groupId, post.id) });
    void qc.invalidateQueries({ queryKey: communityKeys.feed(groupId), exact: true });
  };
  const comentar = useMutation({
    mutationFn: () =>
      feedApi.comment(groupId, post.id, texto.trim(), me.displayName ? undefined : apelido.trim()),
    onSuccess: () => {
      setTexto('');
      recarregar();
      // O apelido escolhido agora vale para o mural todo.
      if (!me.displayName) void qc.invalidateQueries({ queryKey: communityKeys.feed(groupId) });
    },
    onError: (err) => toast(apiMessage(err, 'Não deu para comentar agora.')),
  });
  const apagar = useMutation({
    mutationFn: (c: PostComment): Promise<unknown> =>
      c.canDelete
        ? feedApi.deleteComment(groupId, post.id, c.id)
        : moderationApi.removeComment(groupId, post.id, c.id),
    onSuccess: recarregar,
    onError: (err) => toast(apiMessage(err, 'Não deu para tirar o comentário agora.')),
  });
  const problema = commentProblem(texto) ?? (me.displayName ? null : displayNameProblem(apelido));

  return (
    <div className="space-y-3 border-t border-subtle pt-3">
      {detalhe.data && detalhe.data.comments.length > 0 && (
        <ul className="space-y-3" aria-label="Comentários">
          {detalhe.data.comments.map((c) => (
            <li key={c.id} className="space-y-1">
              <Autor author={c.author} createdAt={c.createdAt} />
              {c.removed ? (
                <p className="text-xs italic text-muted-foreground">
                  Removido pela equipe. Só você vê este comentário.
                </p>
              ) : null}
              <p className="whitespace-pre-line text-sm">{c.body}</p>
              <div className="flex gap-3 text-xs">
                {(c.canDelete || c.canModerate) && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-danger"
                    onClick={() => apagar.mutate(c)}
                  >
                    {c.canDelete ? 'Apagar' : 'Remover'}
                  </button>
                )}
                {!c.author.isMe && !c.removed && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setDenunciando(c)}
                  >
                    Denunciar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!me.displayName && <NicknameField value={apelido} onChange={setApelido} />}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problema) comentar.mutate();
        }}
      >
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={COMMENT_BODY_MAX}
          rows={1}
          aria-label="Escreva um comentário"
          placeholder="Escreva um comentário"
          className="min-h-[40px] flex-1"
        />
        <Button type="submit" size="sm" disabled={Boolean(problema) || comentar.isPending}>
          Enviar
        </Button>
      </form>
      {denunciando && (
        <DenunciarDialog
          groupId={groupId}
          postId={post.id}
          commentId={denunciando.id}
          onClose={() => setDenunciando(null)}
        />
      )}
    </div>
  );
}

export function DenunciarDialog({
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
  const [motivo, setMotivo] = useState<ReportReason | null>(null);
  const [nota, setNota] = useState('');
  const enviar = useMutation({
    mutationFn: () =>
      feedApi.report(groupId, postId, {
        reason: motivo!,
        note: nota.trim() || null,
        commentId: commentId ?? null,
      }),
    onSuccess: () => {
      toast('Denúncia enviada. A equipe vai olhar, e ninguém fica sabendo que foi você.');
      onClose();
    },
    onError: (err) => toast(apiMessage(err, 'Não deu para enviar a denúncia agora.')),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{commentId ? 'Denunciar comentário' : 'Denunciar post'}</DialogTitle>
          <DialogDescription>
            A equipe da comunidade recebe a denúncia sem o seu nome.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Motivo</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="motivo"
                value={r}
                checked={motivo === r}
                onChange={() => setMotivo(r)}
              />
              {REPORT_REASON_LABEL[r]}
            </label>
          ))}
        </fieldset>
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={REPORT_NOTE_MAX}
          aria-label="Algo mais para a equipe saber (opcional)"
          placeholder="Algo mais para a equipe saber (opcional)"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!motivo || enviar.isPending} onClick={() => enviar.mutate()}>
            {enviar.isPending ? 'Enviando…' : 'Denunciar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Acao = 'delete' | 'remove' | 'pin' | 'unpin' | 'report';

function AcoesDoPost({
  post,
  onPick,
  onClose,
}: {
  post: Post;
  onPick: (a: Acao) => void;
  onClose: () => void;
}) {
  const acoes: { a: Acao; label: string; danger?: boolean }[] = [];
  if (post.canModerate && !post.pinned) acoes.push({ a: 'pin', label: 'Fixar no topo' });
  if (post.canModerate && post.pinned) acoes.push({ a: 'unpin', label: 'Desafixar' });
  if (!post.author.isMe && !post.removed) acoes.push({ a: 'report', label: 'Denunciar' });
  if (post.canModerate && !post.author.isMe)
    acoes.push({ a: 'remove', label: 'Remover do mural', danger: true });
  if (post.canDelete) acoes.push({ a: 'delete', label: 'Apagar post', danger: true });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ações do post</DialogTitle>
          <DialogDescription>{`Post de ${post.author.displayName}`}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {acoes.map(({ a, label, danger }) => (
            <Button
              key={a}
              variant="outline"
              className={cn('justify-start', danger && 'text-danger')}
              onClick={() => onPick(a)}
            >
              {label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Um post no mural: autor, texto, imagens, reações, comentários e ações. */
export function PostCard({ groupId, post, me }: { groupId: string; post: Post; me: MyName }) {
  const qc = useQueryClient();
  const [abertos, setAbertos] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmar, setConfirmar] = useState<'delete' | 'remove' | null>(null);
  const [denunciando, setDenunciando] = useState(false);

  const recarregar = () =>
    void qc.invalidateQueries({ queryKey: communityKeys.feed(groupId), exact: true });

  const reagir = useMutation({
    mutationFn: (k: PostReactionKind | null) => feedApi.react(groupId, post.id, k),
    onSuccess: recarregar,
    onError: (err) => toast(apiMessage(err, 'Não deu para reagir agora.')),
  });
  const acao = useMutation({
    mutationFn: (a: Exclude<Acao, 'report'>): Promise<unknown> => {
      if (a === 'delete') return feedApi.remove(groupId, post.id);
      if (a === 'remove') return moderationApi.removePost(groupId, post.id);
      if (a === 'pin') return moderationApi.pin(groupId, post.id);
      return moderationApi.unpin(groupId, post.id);
    },
    onSuccess: (_, a) => {
      setConfirmar(null);
      toast(
        a === 'delete'
          ? 'Post apagado.'
          : a === 'remove'
            ? 'Post removido do mural. Só quem publicou ainda vê.'
            : a === 'pin'
              ? 'Post fixado no topo.'
              : 'Post desafixado.',
      );
      recarregar();
    },
    onError: (err) => toast(apiMessage(err, 'Não deu para fazer isso agora.')),
  });

  const temAcoes = post.canDelete || post.canModerate || (!post.author.isMe && !post.removed);

  return (
    <article
      aria-label={`Post de ${post.author.displayName}`}
      className={cn(
        'space-y-3 rounded-2xl border border-subtle bg-card p-4',
        post.removed && 'border-dashed opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          {post.pinned && (
            <p className="flex items-center gap-1 text-xs font-semibold text-primary">
              <Pin size={12} aria-hidden /> Fixado pela equipe
            </p>
          )}
          <Autor author={post.author} createdAt={post.createdAt} />
        </div>
        {temAcoes && (
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={`Mais ações do post de ${post.author.displayName}`}
          >
            <MoreHorizontal size={16} />
          </button>
        )}
      </div>

      {post.removed && (
        <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          {removedNotice(post.removed.reason)}
        </p>
      )}

      {post.body && <MarkdownLite source={post.body} />}
      <Imagens post={post} />

      {!post.removed && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Reacoes post={post} onReact={(k) => reagir.mutate(k)} />
          <button
            type="button"
            aria-expanded={abertos}
            onClick={() => setAbertos((v) => !v)}
            className="flex min-h-[36px] items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <MessageCircle size={14} aria-hidden />
            {commentsLabel(post.commentCount)}
          </button>
        </div>
      )}

      {abertos && !post.removed && <Comentarios groupId={groupId} post={post} me={me} />}

      {menu && (
        <AcoesDoPost
          post={post}
          onClose={() => setMenu(false)}
          onPick={(a) => {
            setMenu(false);
            if (a === 'report') setDenunciando(true);
            else if (a === 'delete' || a === 'remove') setConfirmar(a);
            else acao.mutate(a);
          }}
        />
      )}
      {denunciando && (
        <DenunciarDialog groupId={groupId} postId={post.id} onClose={() => setDenunciando(false)} />
      )}
      <ConfirmDialog
        open={confirmar !== null}
        onOpenChange={(o) => !o && setConfirmar(null)}
        title={confirmar === 'delete' ? 'Apagar o post?' : 'Remover do mural?'}
        description={
          confirmar === 'delete'
            ? 'O post, as imagens e os comentários somem para todo mundo. Não dá para desfazer.'
            : 'O post some para os membros. Quem publicou ainda vê, com o aviso de que a equipe removeu. Dá para restaurar na Moderação.'
        }
        confirmLabel={confirmar === 'delete' ? 'Apagar' : 'Remover'}
        pending={acao.isPending}
        onConfirm={() => confirmar && acao.mutate(confirmar)}
      />
    </article>
  );
}
