'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Apple, Dumbbell, Home, Plus, Users } from 'lucide-react';
import { PRIMARY_TABS, activeNavKey } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { MenuLinks } from './menu-mais';
import { useQuickAdd } from './quick-add';
import { useNavMenu } from './use-nav-menu';
import { useNavVariant } from './nav-variants';

const ICON = { home: Home, nutrition: Apple, workout: Dumbbell, community: Users } as const;

/**
 * Desktop (`md+`): a barra de baixo vira esta lateral, com tudo à vista — as
 * abas principais, o Registrar e as seções do menu "Mais". No celular ela não
 * existe (`hidden`), e o leitor de tela também não a vê.
 */
export function SideNav() {
  const pathname = usePathname();
  const quickAdd = useQuickAdd();
  const sections = useNavMenu();
  const active = activeNavKey(pathname);
  const variant = useNavVariant();
  const tabs =
    variant === 'atual'
      ? PRIMARY_TABS
      : [...PRIMARY_TABS, { key: 'community' as const, href: '/community', label: 'Comunidade' }];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-6 overflow-y-auto border-r border-subtle bg-muted/40 px-4 py-6 md:flex">
      <Link href="/" className="px-2 text-2xl font-extrabold text-primary">
        Fatia
      </Link>
      <button
        type="button"
        aria-label="Registrar"
        onClick={quickAdd.open}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Plus size={20} strokeWidth={2.5} aria-hidden />
        Registrar
      </button>
      <nav aria-label="Navegação principal">
        <ul className="space-y-0.5">
          {tabs.map(({ key, href, label }) => {
            const Icon = ICON[key];
            const on = key === 'community' ? pathname.startsWith('/community') : active === key;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-semibold transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'bg-card text-primary' : 'text-foreground',
                  )}
                >
                  <Icon
                    size={20}
                    aria-hidden
                    className={on ? 'text-primary' : 'text-muted-foreground'}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <MenuLinks sections={sections} compact />
    </aside>
  );
}
