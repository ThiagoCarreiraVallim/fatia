'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inboxApi, relativeTime } from '@fatia/api-client';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { ChipIcon } from './parts';

/**
 * Central de avisos do sino do Hoje: os avisos que o servidor guardou ao
 * entregar notificações. Abrir marca todos como lidos e some o ponto do sino.
 * Só abre com aviso novo; sem novidade, o Hoje mostra "Sem novos avisos".
 */
export function InboxSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: () => inboxApi.list(),
    enabled: open,
  });
  const marked = useRef(false);

  useEffect(() => {
    if (!open) {
      marked.current = false;
      return;
    }
    if (marked.current || !inbox.data || inbox.data.unread === 0) return;
    marked.current = true;
    inboxApi
      .markRead()
      .then(() => qc.invalidateQueries({ queryKey: ['dashboard'] }))
      .catch(() => {
        marked.current = false;
      });
  }, [open, inbox.data, qc]);

  const items = inbox.data?.items ?? [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="gap-4 px-6 pb-8 pt-3">
        <DrawerTitle className="font-display text-h2">Avisos</DrawerTitle>
        <DrawerDescription className="sr-only">Os avisos recentes do fatia.</DrawerDescription>
        <div className="max-h-[60vh] overflow-y-auto rounded-card bg-muted">
          {inbox.isLoading ? (
            <p className="px-[18px] py-4 text-b2 text-muted-foreground">Carregando avisos…</p>
          ) : inbox.isError ? (
            <button
              type="button"
              onClick={() => void inbox.refetch()}
              className="w-full px-[18px] py-4 text-left text-b2 text-danger"
            >
              Não deu para carregar. Tentar de novo
            </button>
          ) : items.length === 0 ? (
            <p className="px-[18px] py-4 text-b2 text-muted-foreground">Nenhum aviso por aqui.</p>
          ) : (
            <ul>
              {items.map((item) => {
                const body = (
                  <>
                    <ChipIcon icon="bell" tone={item.readAt ? 'blue' : 'lime'} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{item.title}</span>
                      <span className="block text-b2 text-muted-foreground">{item.body}</span>
                    </span>
                    <span className="shrink-0 text-xs text-faint">
                      {relativeTime(item.createdAt)}
                    </span>
                  </>
                );
                const cls = 'flex w-full items-start gap-3.5 px-[18px] py-3.5 text-left';
                return (
                  <li key={item.id} className="[&+&]:shadow-[inset_0_1px_0_hsl(var(--border))]">
                    {item.url.startsWith('/') ? (
                      <Link href={item.url} onClick={() => onOpenChange(false)} className={cls}>
                        {body}
                      </Link>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Link
          href="/profile/notifications"
          onClick={() => onOpenChange(false)}
          className="anim-press inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-field bg-muted text-[15px] font-bold"
        >
          <Icon name="gear" size={16} />
          Preferências de avisos
        </Link>
      </DrawerContent>
    </Drawer>
  );
}
