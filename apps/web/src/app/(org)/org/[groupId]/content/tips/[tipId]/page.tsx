'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bold, ChevronLeft, Eye, Italic, Link2, List, Megaphone, Pin } from 'lucide-react';
import {
  ApiError,
  contentApi,
  MAX_TIP_BODY,
  tipEditorCategories,
  TIP_CATEGORY_LABEL,
  wrapSelection,
  type GroupTip,
  type TipCategory,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { DeleteButton } from '@/components/content/content-ui';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/** Nova dica (`/tips/new`) ou a edição de uma existente (Pn-10, #408). */
export default function OrgTipPage() {
  const g = useOrgGroup();
  const { tipId } = useParams<{ tipId: string }>();
  const isNew = tipId === 'new';
  // A equipe não tem rota de uma dica só: a lista já traz tudo.
  const tips = useQuery({
    queryKey: orgKeys.contentTips(g.id),
    queryFn: () => contentApi.tips(g.id),
    enabled: !isNew,
  });

  if (isNew) return <TipEditor key="new" groupId={g.id} groupName={g.name} tip={null} />;
  if (tips.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  const tip = tips.data?.find((d) => d.id === tipId);
  if (!tip) {
    return (
      <EmptyState
        title="Dica não encontrada"
        description="Ela foi apagada, ou o endereço está errado."
      />
    );
  }
  return (
    <TipEditor key={`${tip.id}:${tip.updatedAt}`} groupId={g.id} groupName={g.name} tip={tip} />
  );
}

type Marker = '**' | '*';

function TipEditor({
  groupId,
  groupName,
  tip,
}: {
  groupId: string;
  groupName: string;
  tip: GroupTip | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const canEdit = tip === null || tip.canEdit !== false;
  useTopBarTitle(tip?.title ?? 'Nova dica');
  const area = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState(tip?.title ?? '');
  const [category, setCategory] = useState<TipCategory>(tip?.category ?? 'WORKOUT');
  const [body, setBody] = useState(tip?.body ?? '');
  const [image, setImage] = useState<ImageValue | null>(
    tip?.image ? { fileId: tip.image.id, url: tip.image.url } : null,
  );
  const [pinned, setPinned] = useState(tip?.pinned ?? false);
  const [published, setPublished] = useState(Boolean(tip?.publishedAt));
  const [announce, setAnnounce] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  // O que já está salvo: sem mudança no texto, o "Salvar" só muda o estado.
  const snapshot = JSON.stringify([title.trim(), category, body.trim(), image?.fileId ?? null]);
  const [savedSnapshot, setSavedSnapshot] = useState(
    tip ? JSON.stringify([tip.title, tip.category, tip.body, tip.image?.id ?? null]) : null,
  );
  const wasPublished = Boolean(tip?.publishedAt);
  // Anunciar só vale na primeira publicação (a API ignora depois).
  const canAnnounce = published && !wasPublished;

  const invalidate = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });

  const save = useMutation({
    mutationFn: async () => {
      let saved = tip;
      if (!tip || snapshot !== savedSnapshot) {
        const input = {
          title: title.trim(),
          body: body.trim(),
          category,
          imageFileId: image?.fileId ?? null,
        };
        saved = tip
          ? await contentApi.updateTip(groupId, tip.id, input)
          : await contentApi.createTip(groupId, input);
      }
      const state: { pinned?: boolean; published?: boolean } = {};
      if (pinned !== (tip?.pinned ?? false)) state.pinned = pinned;
      if (published !== wasPublished) state.published = published;
      if (Object.keys(state).length) {
        await contentApi.setTipState(
          groupId,
          saved!.id,
          state,
          state.published ? { announce } : {},
        );
      }
      return { saved: saved!, state };
    },
    onSuccess: ({ saved, state }) => {
      setSavedSnapshot(snapshot);
      setUnpublishing(false);
      toast(
        state.published === true
          ? announce
            ? 'Publicada · post no mural criado.'
            : 'Publicada para os membros.'
          : state.published === false
            ? 'Saiu do ar.'
            : tip
              ? 'Dica salva.'
              : 'Rascunho criado. Publique quando estiver pronta.',
      );
      void invalidate();
      if (!tip) router.replace(`/org/${groupId}/content/tips/${saved.id}`);
    },
    onError: (err) => {
      setUnpublishing(false);
      toast(apiErrorMessage(err, 'Não deu para salvar agora.'));
    },
  });

  const remove = useMutation({
    mutationFn: () => contentApi.deleteTip(groupId, tip!.id),
    onSuccess: () => {
      toast('Dica apagada.');
      void invalidate();
      // De volta à lista, na aba de dicas.
      router.replace(`/org/${groupId}/content?tab=tips`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para apagar agora.')),
  });

  const submit = () => {
    if (!title.trim() || !body.trim()) return toast('Preencha o título e o texto da dica.');
    // A dica antiga, mais longa, segue valendo enquanto o texto não muda.
    if (body.length > MAX_TIP_BODY && body !== tip?.body) {
      return toast(`A dica vai até ${MAX_TIP_BODY} caracteres.`);
    }
    if (wasPublished && !published) return setUnpublishing(true);
    save.mutate();
  };

  /** Troca o texto e devolve a seleção ao mesmo trecho. */
  const replaceBody = (next: string, start: number, end: number) => {
    setBody(next);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(start, end);
    });
  };
  const mark = (marker: Marker) => {
    const el = area.current;
    if (!el) return;
    const r = wrapSelection(body, el.selectionStart, el.selectionEnd, marker);
    replaceBody(r.text, r.start, r.end);
  };
  const listItem = () => {
    const el = area.current;
    if (!el) return;
    const lineStart = body.lastIndexOf('\n', el.selectionStart - 1) + 1;
    if (body.startsWith('- ', lineStart)) return;
    replaceBody(
      `${body.slice(0, lineStart)}- ${body.slice(lineStart)}`,
      el.selectionStart + 2,
      el.selectionEnd + 2,
    );
  };
  const link = () => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const label = body.slice(s, e) || 'texto';
    const next = `${body.slice(0, s)}[${label}](https://)${body.slice(e)}`;
    // A seleção cai no endereço, para colar por cima.
    const urlStart = s + label.length + 3;
    replaceBody(next, urlStart, urlStart + 8);
  };

  const firstName = (tip?.authorName ?? 'Você').split(' ')[0];

  return (
    <form
      aria-label="Dica"
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Link
          href={`/org/${groupId}/content?tab=tips`}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-border pl-2 pr-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Planos e dicas
        </Link>
        <div className="min-w-0 flex-1">
          <label htmlFor="titulo" className="sr-only">
            Título
          </label>
          <input
            id="titulo"
            maxLength={100}
            value={title}
            disabled={!canEdit}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da dica"
            className="w-full rounded-lg bg-transparent font-display text-2xl font-bold outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100 sm:text-3xl"
          />
          <p className="text-sm text-muted-foreground">
            {`Dica · por ${tip?.authorName ?? 'você'} · na biblioteca da ${groupName}`}
          </p>
        </div>
        {canEdit && (
          <Button type="submit" className="shrink-0" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        )}
      </div>

      {!canEdit && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda esta dica.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Categoria</p>
              <Segmented<TipCategory>
                label="Categoria"
                value={category}
                onChange={setCategory}
                className="w-fit [&>button]:flex-none [&>button]:px-3.5"
                options={tipEditorCategories(tip?.category ?? category).map((c) => ({
                  value: c,
                  label: TIP_CATEGORY_LABEL[c],
                }))}
              />
            </div>
            {canEdit && (
              <div className="w-full max-w-[220px]">
                <ImageField
                  groupId={groupId}
                  label="Capa"
                  value={image}
                  onChange={setImage}
                  aspect="aspect-[2/1]"
                />
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-1 border-b border-subtle px-2 py-1.5">
              <ToolButton label="Negrito" onClick={() => mark('**')}>
                <Bold className="h-4 w-4" aria-hidden />
              </ToolButton>
              <ToolButton label="Itálico" onClick={() => mark('*')}>
                <Italic className="h-4 w-4" aria-hidden />
              </ToolButton>
              <ToolButton label="Lista" onClick={listItem}>
                <List className="h-4 w-4" aria-hidden />
              </ToolButton>
              <ToolButton label="Link" onClick={link}>
                <Link2 className="h-4 w-4" aria-hidden />
              </ToolButton>
              <span
                className={cn(
                  'ml-auto pr-2 text-xs tabular-nums',
                  body.length > MAX_TIP_BODY ? 'font-semibold text-destructive' : 'text-muted-foreground',
                )}
              >
                {`${body.length} de ${MAX_TIP_BODY} caracteres`}
              </span>
            </div>
            <label htmlFor="corpo" className="sr-only">
              Texto
            </label>
            <textarea
              id="corpo"
              ref={area}
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="O que a equipe quer que todo mundo saiba. **negrito**, *itálico*, listas com “- ” e links."
              className="block w-full resize-y bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
            />
          </div>

          <div className="space-y-4 border-t border-subtle pt-5">
            <ToggleRow
              icon={<Pin className="h-4 w-4" aria-hidden />}
              title="Fixar no topo"
              detail="aparece antes das outras dicas"
              checked={pinned}
              onChange={setPinned}
            />
            <ToggleRow
              icon={<Eye className="h-4 w-4" aria-hidden />}
              title="Publicada na comunidade"
              detail={published ? 'todos os membros veem em Dicas' : 'rascunho: só a equipe vê'}
              checked={published}
              onChange={setPublished}
            />
            <ToggleRow
              icon={<Megaphone className="h-4 w-4" aria-hidden />}
              title="Anunciar no mural"
              detail={
                wasPublished
                  ? 'só na primeira publicação'
                  : `post “${firstName} publicou uma dica”`
              }
              checked={canAnnounce && announce}
              disabled={!canAnnounce}
              onChange={setAnnounce}
            />
          </div>

          {canEdit && tip && (
            <div className="border-t border-subtle pt-5">
              <DeleteButton
                label="Apagar dica"
                pending={remove.isPending}
                onClick={() => setDeleting(true)}
              />
            </div>
          )}
        </fieldset>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Como o membro vê</p>
          <div className="rounded-[28px] border border-border bg-background p-3 shadow-sm">
            <article
              aria-label="Prévia da dica"
              className="overflow-hidden rounded-[20px] bg-card"
            >
              <div className="relative h-36 bg-gradient-to-br from-muted to-surface-3">
                {image?.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute bottom-2 left-3 flex gap-1.5">
                  {pinned && (
                    <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-bold uppercase text-primary">
                      Fixada
                    </span>
                  )}
                  <span className="rounded-md border border-border bg-background/70 px-2 py-0.5 text-[11px] font-bold uppercase">
                    {TIP_CATEGORY_LABEL[category]}
                  </span>
                </span>
              </div>
              <div className="space-y-2 p-4">
                <h3 className="font-display text-lg font-bold leading-tight">
                  {title.trim() || 'Título da dica'}
                </h3>
                <div className="text-sm">
                  <MarkdownLite source={body || 'Nada escrito ainda.'} />
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  {`${groupName} · por ${firstName}`}
                </p>
              </div>
            </article>
          </div>
        </div>
      </div>

      {tip && (
        <>
          <ConfirmDialog
            open={unpublishing}
            onOpenChange={setUnpublishing}
            title="Tirar esta dica do ar?"
            description="Ela some para os membros na hora."
            confirmLabel="Tirar do ar"
            pendingLabel="Tirando do ar..."
            pending={save.isPending}
            onConfirm={() => save.mutate()}
          />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Apagar esta dica?"
            description="Ela some para os membros, e a imagem é apagada junto."
            confirmLabel="Apagar"
            pendingLabel="Apagando..."
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </>
      )}
    </form>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Sem roubar o foco: a seleção do texto continua lá.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function ToggleRow({
  icon,
  title,
  detail,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className={cn('flex items-center gap-3', disabled && 'opacity-60')}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}
