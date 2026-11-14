'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_TABS, activeNavKey } from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { AiFab } from './ai-fab';

/**
 * Desktop (`md+`): as mesmas cinco abas da barra de baixo, agora com o nome
 * ao lado do ícone, e o botão da IA no topo (ADR 040 revisada). O que era o
 * menu "Mais" mora na aba Você. No celular ela não existe (`hidden`), e o
 * leitor de tela também não a vê.
 */
export function SideNav() {
  const pathname = usePathname();
  const active = activeNavKey(pathname);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-6 overflow-y-auto border-r border-subtle bg-muted/40 px-4 py-6 md:flex">
      <div className="flex items-center justify-between gap-2 px-2">
        <Link
          href="/"
          aria-label="Fatia, ir para o Hoje"
          className="font-display text-2xl font-bold text-primary-text"
        >
          Fatia
        </Link>
        <AiFab className="h-14 w-14" />
      </div>
      <nav aria-label="Principal">
        <ul className="space-y-0.5">
          {PRIMARY_TABS.map(({ key, href, label, icon }) => {
            const on = active === key;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'bg-foreground text-background' : 'text-foreground hover:bg-card',
                  )}
                >
                  <Icon name={icon === 'avatar' ? 'user' : icon} size={20} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
