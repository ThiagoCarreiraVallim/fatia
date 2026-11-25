'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IconName } from '@fatia/design';
import {
  IDEA_AREAS,
  IDEA_MAX,
  ideasApi,
  newsDate,
  panelHref,
  panelNewsApi,
  panelUnreadLabel,
  type IdeaArea,
  type PanelNewsItem,
  type PanelSection,
} from '@fatia/api-client';
import { panelNewsKey } from '@/components/community/query-keys';
import { useOrgGroup } from '@/components/org/org-shell';
import { useOptionalSidePanel } from '@/components/org/side-panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Novidades do painel (#413, pranchas Pn-27 e Pn-27b): o que mudou no Fatia
 * para a equipe, com "novo" e o friso verde no que não foi lido, "Marcar tudo
 * como lido" e "Sugerir uma ideia" no painel lateral.
 */
export default function PanelUpdatesPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const side = useOptionalSidePanel();
  const [ideaDialog, setIdeaDialog] = useState(false);
  const news = useQuery({ queryKey: panelNewsKey, queryFn: () => panelNewsApi.list() });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => panelNewsApi.markRead(ids),
    onSuccess: (feed, ids) => {
      qc.setQueryData(panelNewsKey, feed);
      if (!ids) toast('Tudo marcado como lido');
    },
  });

  const openIdea = () => {
    if (side) {
      side.open({ title: 'Sugerir uma ideia', body: <IdeaForm onDone={side.close} /> });
    } else {
      setIdeaDialog(true);
    }
  };

  const feed = news.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-h3 font-bold">Novidades</h1>
          <p className="text-sm text-muted-foreground">O que mudou no Fatia para a equipe.</p>
        </div>
        <Button variant="secondary" className="gap-1.5" onClick={openIdea}>
          <Icon name="spark" size={16} /> Sugerir uma ideia
        </Button>
      </div>

      {news.isPending && <Skeleton className="h-[320px] rounded-card" />}

      {news.isError && (
        <div className="flex flex-col items-start gap-2 rounded-card bg-card p-5">
          <b>Não deu para carregar as novidades.</b>
          <Button size="xs" variant="secondary" onClick={() => void news.refetch()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {feed && (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              aria-live="polite"
              className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold shadow-[inset_0_0_0_1px_hsl(var(--border))]"
            >
              <i
                aria-hidden
                className={cn(
                  'h-2 w-2 rounded-full',
                  feed.unreadCount > 0 ? 'bg-primary' : 'bg-faint',
                )}
              />
              {panelUnreadLabel(feed.unreadCount)}
            </span>
            <span className="flex-1" />
            {feed.unreadCount > 0 && (
              <Button
                size="xs"
                variant="secondary"
                className="gap-1.5"
                disabled={markRead.isPending}
                onClick={() => markRead.mutate(undefined)}
              >
                <Icon name="check" size={16} /> Marcar tudo como lido
              </Button>
            )}
          </div>
          <ul
            aria-label="Novidades do painel"
            className="divide-y divide-border overflow-hidden rounded-card bg-card"
          >
            {feed.items.map((item) => (
              <NewsRow
                key={item.id}
                item={item}
                href={item.section ? panelHref(g.id, item.section as PanelSection) : null}
                onOpen={() => {
                  if (item.unread) markRead.mutate([item.id]);
                }}
              />
            ))}
          </ul>
        </>
      )}

      {!side && (
        <Dialog open={ideaDialog} onOpenChange={setIdeaDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Sugerir uma ideia</DialogTitle>
              <DialogDescription className="sr-only">
                Conte o que faria o painel melhor para a equipe.
              </DialogDescription>
            </DialogHeader>
            <IdeaForm onDone={() => setIdeaDialog(false)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function NewsRow({
  item,
  href,
  onOpen,
}: {
  item: PanelNewsItem;
  href: string | null;
  onOpen: () => void;
}) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
        <Icon name={item.icon as IconName} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <b className="text-[14.5px]">{item.title}</b>
          {item.unread && (
            <span className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold text-primary-text shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.4)]">
              novo
            </span>
          )}
        </span>
        <span className="block text-[13px] text-muted-foreground">{item.body}</span>
      </span>
      <span className="w-[60px] shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">
        {newsDate(item.date)}
      </span>
      {href && <Icon name="chevR" size={16} className="shrink-0 text-faint" />}
    </>
  );
  const className = cn(
    'flex min-h-[72px] items-center gap-3.5 px-5 py-3',
    item.unread && 'shadow-[inset_3px_0_0_hsl(var(--primary))]',
  );
  return (
    <li>
      {href ? (
        <Link href={href} onClick={onOpen} className={cn(className, 'hover:bg-surface-3')}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

/** "Sugerir uma ideia" (Pn-27): o texto e onde ajudaria. Lemos todas. */
function IdeaForm({ onDone }: { onDone: () => void }) {
  const [texto, setTexto] = useState('');
  const [area, setArea] = useState<IdeaArea | null>(null);
  const envia = useMutation({
    mutationFn: () => ideasApi.send(texto.trim(), area ?? undefined),
    onSuccess: () => {
      setTexto('');
      setArea(null);
      toast('Ideia enviada · obrigado!');
      onDone();
    },
    onError: () => toast('Não deu para enviar. Tente de novo.'),
  });
  return (
    <form
      aria-label="Sugerir uma ideia"
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (texto.trim()) envia.mutate();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <label htmlFor="ideia-painel" className="text-[13px] font-semibold text-muted-foreground">
            Sua ideia
          </label>
          <textarea
            id="ideia-painel"
            rows={5}
            maxLength={IDEA_MAX}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: poder duplicar uma enquete antiga"
            className="w-full resize-none rounded-field bg-muted px-3.5 py-3 text-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <span id="onde-ajudaria" className="text-[13px] font-semibold text-muted-foreground">
            Onde ajudaria
          </span>
          <div role="radiogroup" aria-labelledby="onde-ajudaria" className="flex flex-wrap gap-1.5">
            {IDEA_AREAS.map((a) => {
              const on = area === a.value;
              return (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setArea(on ? null : a.value)}
                  className={cn(
                    'h-9 rounded-full px-3.5 text-[13px] font-semibold',
                    on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Lemos todas. Quando virar novidade, você recebe aqui.
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!texto.trim() || envia.isPending}>
          {envia.isPending ? 'Enviando…' : 'Enviar ideia'}
        </Button>
      </div>
    </form>
  );
}
