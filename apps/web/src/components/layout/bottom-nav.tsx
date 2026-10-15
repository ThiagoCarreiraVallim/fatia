'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Apple, Dumbbell, Home, Menu, Plus } from 'lucide-react';
import { PRIMARY_TABS, activeNavKey, type NavTab } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { MenuMais } from './menu-mais';
import { useQuickAdd } from './quick-add';
import { VariantBottomNav, useNavVariant } from './nav-variants';

const ICON = { home: Home, nutrition: Apple, workout: Dumbbell } as const;

/**
 * Início · Nutrição · [ + ] · Treino · Mais — a mesma barra do app
 * (`navigation.ts` do api-client).
 *
 * O "+" no centro é o Registrar: o registro a um toque de qualquer tela, que é
 * o que o plano Free tem no lugar da IA. "Mais" abre o menu com todas as outras
 * telas (Progresso, Metas, Perfil, Chat…). No desktop a barra some e a lateral
 * (`side-nav.tsx`) mostra tudo.
 */
export function BottomNav() {
  const pathname = usePathname();
  const quickAdd = useQuickAdd();
  const [menuOpen, setMenuOpen] = useState(false);
  const variant = useNavVariant();
  const active = activeNavKey(pathname);
  const tab = (key: NavTab['key']) => PRIMARY_TABS.find((t) => t.key === key)!;

  const link = ({ key, href, label }: NavTab) => {
    const Icon = ICON[key];
    const on = active === key;
    return (
      <Link
        key={key}
        href={href}
        aria-current={on ? 'page' : undefined}
        className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors"
      >
        <Icon size={20} aria-hidden className={on ? 'text-primary' : 'text-muted-foreground'} />
        <span className={on ? 'font-bold text-primary' : 'text-muted-foreground'}>{label}</span>
      </Link>
    );
  };

  if (variant !== 'atual') return <VariantBottomNav variant={variant} />;

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-50 h-[calc(5rem+env(safe-area-inset-bottom))] rounded-tl-xl rounded-tr-xl border-t border-white/10 bg-muted/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="flex h-full items-center justify-around px-1">
          {link(tab('home'))}
          {link(tab('nutrition'))}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              aria-label="Registrar"
              onClick={quickAdd.open}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Plus size={28} strokeWidth={2.5} />
            </button>
          </div>
          {link(tab('workout'))}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px]"
          >
            <Menu
              size={20}
              aria-hidden
              className={active === 'more' ? 'text-primary' : 'text-muted-foreground'}
            />
            <span
              className={cn(active === 'more' ? 'font-bold text-primary' : 'text-muted-foreground')}
            >
              Mais
            </span>
          </button>
        </div>
      </nav>
      <MenuMais open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
