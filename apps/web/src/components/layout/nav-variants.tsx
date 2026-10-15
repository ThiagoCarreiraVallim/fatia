'use client';

/**
 * PROTÓTIPO (Fase 5): variantes da barra com a aba Comunidade, escolhidas pelo
 * cookie `fatia_nav_variant` (a | b | c | d). Some quando o usuário escolher.
 */
import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Apple, Dumbbell, Home, Menu, Plus, Users } from 'lucide-react';
import { activeNavKey, usersApi } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { MenuMais } from './menu-mais';
import { useQuickAdd } from './quick-add';

export type NavVariant = 'atual' | 'a' | 'b' | 'c' | 'd';

function lerVariante(): NavVariant {
  const m = /(?:^|;\s*)fatia_nav_variant=([abcd])/.exec(document.cookie);
  return (m?.[1] as NavVariant | undefined) ?? 'atual';
}

export function useNavVariant(): NavVariant {
  return useSyncExternalStore(
    () => () => undefined,
    lerVariante,
    () => 'atual',
  );
}

type Key = 'home' | 'nutrition' | 'workout' | 'community' | 'more';
const TABS: Record<Exclude<Key, 'more'>, { label: string; href: string; Icon: typeof Home }> = {
  home: { label: 'Início', href: '/', Icon: Home },
  nutrition: { label: 'Nutrição', href: '/nutrition', Icon: Apple },
  workout: { label: 'Treino', href: '/workout', Icon: Dumbbell },
  community: { label: 'Comunidade', href: '/community', Icon: Users },
};

function activeKey(pathname: string): Key {
  if (pathname.startsWith('/community')) return 'community';
  return activeNavKey(pathname);
}

const ITEM = 'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px]';

export function VariantBottomNav({ variant }: { variant: Exclude<NavVariant, 'atual'> }) {
  const pathname = usePathname();
  const quickAdd = useQuickAdd();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = activeKey(pathname);

  const tab = (key: Exclude<Key, 'more'>) => {
    const { label, href, Icon } = TABS[key];
    const on = active === key;
    return (
      <Link key={key} href={href} aria-current={on ? 'page' : undefined} className={ITEM}>
        <Icon size={20} aria-hidden className={on ? 'text-primary' : 'text-muted-foreground'} />
        <span className={on ? 'font-bold text-primary' : 'text-muted-foreground'}>{label}</span>
      </Link>
    );
  };
  const plus = (
    <div key="plus" className="flex flex-1 items-center justify-center">
      <button
        type="button"
        aria-label="Registrar"
        onClick={quickAdd.open}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>
    </div>
  );
  const more = (
    <button
      key="more"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={menuOpen}
      onClick={() => setMenuOpen(true)}
      className={ITEM}
    >
      <Menu
        size={20}
        aria-hidden
        className={active === 'more' ? 'text-primary' : 'text-muted-foreground'}
      />
      <span className={cn(active === 'more' ? 'font-bold text-primary' : 'text-muted-foreground')}>
        Mais
      </span>
    </button>
  );

  const items =
    variant === 'a'
      ? [tab('home'), tab('nutrition'), plus, tab('workout'), tab('community')]
      : variant === 'b'
        ? [tab('home'), tab('nutrition'), plus, tab('workout'), tab('community'), more]
        : variant === 'c'
          ? [tab('nutrition'), tab('workout'), plus, tab('community'), more]
          : [tab('home'), tab('nutrition'), tab('workout'), tab('community'), more];

  return (
    <>
      {(variant === 'a' || variant === 'c') && (
        <TopBarPrototype variant={variant} onMenu={() => setMenuOpen(true)} />
      )}
      {variant === 'd' && (
        <button
          type="button"
          aria-label="Registrar"
          onClick={quickAdd.open}
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 md:hidden"
        >
          <Plus size={28} strokeWidth={2.5} />
        </button>
      )}
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-50 h-[calc(5rem+env(safe-area-inset-bottom))] rounded-tl-xl rounded-tr-xl border-t border-white/10 bg-muted/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="flex h-full items-center justify-around px-1">{items}</div>
      </nav>
      <MenuMais open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}

/** A: avatar no topo abre o menu. C: o logo no topo leva ao Início. */
function TopBarPrototype({ variant, onMenu }: { variant: 'a' | 'c'; onMenu: () => void }) {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const inicial = (me.data?.name || '?').slice(0, 1).toUpperCase();
  if (variant === 'a') {
    return (
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        onClick={onMenu}
        className="fixed right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-secondary text-sm font-bold text-primary shadow md:hidden"
      >
        {inicial}
      </button>
    );
  }
  return (
    <Link
      href="/"
      aria-label="Início"
      className="fixed right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex h-10 items-center rounded-full border border-subtle bg-secondary px-3 text-sm font-extrabold text-primary shadow md:hidden"
    >
      Fatia
    </Link>
  );
}
