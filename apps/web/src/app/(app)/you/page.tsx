'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { MenuLinks } from '@/components/layout/menu-links';
import { useNavMenu } from '@/components/layout/use-nav-menu';

/**
 * A aba Você (ADR 040 revisada): o que era o menu "Mais" — Progresso, metas,
 * perfil, registros, a IA e o plano — até a #387 redesenhar a tela. Os avisos
 * são a linha "Notificações" (ADR 040, item 4); o sino fica no topo do Hoje.
 */
export default function YouPage() {
  const sections = useNavMenu();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const name = me.data?.name ?? '';

  return (
    <div className="space-y-6 px-5 pt-4 pb-4">
      <Link
        href="/profile"
        className="flex min-h-14 items-center gap-3 rounded-3xl bg-card px-4 py-3"
      >
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary font-display text-base font-bold text-foreground"
        >
          {(name || '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-foreground">{name}</span>
          <span className="block text-xs text-muted-foreground">Ver perfil</span>
        </span>
        <Icon name="chevR" size={18} className="text-muted-foreground" />
      </Link>
      <MenuLinks sections={sections} />
    </div>
  );
}
