'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IconName } from '@fatia/design';
import {
  IDEA_MAX,
  ideasApi,
  newsApi,
  newsCountLabel,
  newsDate,
  type NewsFeed,
  type NewsItem,
  type NewsTone,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { NEWS_QUERY_KEY, offlineFeed, readNewsCache, writeNewsCache } from './news-cache';

const TONE: Record<NewsTone, string> = {
  lime: 'bg-primary/15 text-primary',
  amber: 'bg-[hsl(var(--warning)/0.14)] text-warning',
  blue: 'bg-[hsl(var(--info)/0.14)] text-info',
  neutral: 'bg-muted text-muted-foreground',
};

/**
 * Novidades (pranchas Al-V11/V11b): a lista com "novo" e o friso verde no que
 * não foi lido, "Marcar tudo como lido" e "Sugerir uma ideia". Sem internet,
 * mostra a última lista salva neste navegador, com o aviso e "Tentar de novo".
 */
export function NewsScreen() {
  const qc = useQueryClient();
  const [ideaOpen, setIdeaOpen] = useState(false);
  const news = useQuery({
    queryKey: NEWS_QUERY_KEY,
    queryFn: async () => {
      const feed = await newsApi.list();
      writeNewsCache(feed);
      return feed;
    },
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => newsApi.markRead(ids),
    onSuccess: (feed, ids) => {
      qc.setQueryData(NEWS_QUERY_KEY, feed);
      writeNewsCache(feed);
      if (!ids) toast('Tudo marcado como lido');
    },
  });

  const cached = news.isError ? readNewsCache() : null;
  const offline = news.isError && cached !== null;
  const feed: NewsFeed | undefined = news.data ?? (cached ? offlineFeed(cached) : undefined);

  const retry = async () => {
    const r = await news.refetch();
    if (r.isError) toast('Ainda sem conexão');
  };

  return (
    <div className="flex flex-col gap-3.5 px-6 pb-8 pt-4">
      {offline && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-field bg-[hsl(var(--warning)/0.12)] p-3"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[hsl(var(--warning)/0.18)] text-warning">
            <Icon name="alert" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-sm text-foreground">Sem conexão</b>
            <span className="text-[13px] text-muted-foreground">
              Mostrando o que já estava salvo
            </span>
          </span>
          <Button size="xs" variant="secondary" onClick={() => void retry()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {news.isPending && <Skeleton className="h-[320px] rounded-card" />}

      {news.isError && !offline && (
        <div className="flex flex-col items-start gap-2 rounded-card bg-card p-4">
          <b className="text-foreground">Não deu para carregar as novidades.</b>
          <Button size="xs" variant="secondary" onClick={() => void retry()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {feed && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground" aria-live="polite">
              {newsCountLabel(feed.unreadCount, offline ? cached?.savedAt : null)}
            </span>
            {!offline && feed.unreadCount > 0 && (
              <button
                type="button"
                className="min-h-11 px-1 text-[13px] font-bold text-primary"
                disabled={markRead.isPending}
                onClick={() => markRead.mutate(undefined)}
              >
                Marcar tudo como lido
              </button>
            )}
          </div>
          <ul className="divide-y divide-subtle overflow-hidden rounded-card bg-card">
            {feed.items.map((item) => (
              <NewsRow
                key={item.id}
                item={item}
                onOpen={() => {
                  if (item.unread && !offline) markRead.mutate([item.id]);
                }}
              />
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={() => setIdeaOpen(true)}
        className="flex items-center gap-3 rounded-card bg-muted p-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary/15 text-primary">
          <Icon name="spark" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] text-foreground">Sugerir uma ideia</b>
          <span className="text-[13px] text-muted-foreground">Lemos todas</span>
        </span>
        <Icon name="chevR" size={16} className="text-faint" />
      </button>

      <IdeaSheet open={ideaOpen} onOpenChange={setIdeaOpen} />
    </div>
  );
}

function NewsRow({ item, onOpen }: { item: NewsItem; onOpen: () => void }) {
  const body = (
    <>
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]',
          TONE[item.tone],
        )}
      >
        <Icon name={item.icon as IconName} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-foreground">{item.title}</span>
          {item.unread && (
            <span className="inline-flex h-[18px] items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              novo
            </span>
          )}
        </span>
        <span className="block text-[13px] text-muted-foreground">{item.body}</span>
        <span className="mt-0.5 block text-[13px] text-faint">{newsDate(item.date)}</span>
      </span>
    </>
  );
  const className = cn(
    'flex min-h-[76px] items-start gap-3 px-4 py-3.5',
    item.unread && 'shadow-[inset_3px_0_0_hsl(var(--primary))]',
  );
  return (
    <li>
      {item.href ? (
        <Link href={item.href} onClick={onOpen} className={cn(className, 'hover:bg-surface-3')}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

function IdeaSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState('');
  const send = useMutation({
    mutationFn: () => ideasApi.send(text.trim()),
    onSuccess: () => {
      setText('');
      onOpenChange(false);
      toast('Ideia enviada. Obrigado!');
    },
    onError: () => toast('Não deu para enviar. Tente de novo.'),
  });
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-6 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle className="font-display text-xl font-bold">Sugerir uma ideia</DrawerTitle>
          <DrawerDescription>O que faria o Fatia melhor para você? Lemos todas.</DrawerDescription>
        </DrawerHeader>
        <label htmlFor="ideia" className="sr-only">
          Sua ideia
        </label>
        <textarea
          id="ideia"
          className="h-32 w-full resize-none rounded-field bg-card px-3.5 py-3 text-[15px] text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={IDEA_MAX}
          placeholder="Ex.: ver a carga sugerida na próxima série"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          className="mt-4"
          size="xl"
          full
          disabled={!text.trim() || send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? 'Enviando…' : 'Enviar'}
        </Button>
      </DrawerContent>
    </Drawer>
  );
}
