'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  PRIMARY_TABS,
  activeNavKey,
  navBarMode,
  usersApi,
  workoutApi,
  type NavTab,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import {
  ACTIVE_WORKOUT_BAR_GAP,
  ACTIVE_WORKOUT_BAR_HEIGHT,
  ActiveWorkoutBar,
} from './active-workout-bar';
import { AiFab } from './ai-fab';
import { AiPendingCard } from './ai-pending-card';
import { useAiDrawer } from './ai-drawer';
import { aiUsable, useChatAvailability } from './use-ai-state';

/** A barra flutua 22 px acima do fim da tela e tem 68 px (prancha `Al-H6c5`). */
const NAV_BOTTOM = 22;
const NAV_HEIGHT = 68;

/** A sessão aberta, com a mesma chave da tela de Treino e do menu da IA. */
export function useActiveSession() {
  return useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    refetchOnWindowFocus: true,
  });
}

/**
 * O que aparece embaixo nesta rota. No PWA a sessão aberta vive em `/workout`:
 * com treino em andamento, `/workout` é a tarefa de foco e a barra some.
 */
export function useBottomChrome() {
  const pathname = usePathname() ?? '/';
  const active = useActiveSession();
  const session = active.data ?? null;
  const inWebSession = pathname === '/workout' && session !== null;
  const navVisible = navBarMode(pathname, { activeSessionId: session?.id ?? null }) === 'visible';
  const visible = navVisible && !inWebSession;
  return { pathname, session, visible, workoutBar: visible && session !== null };
}

/** A inicial da pessoa no lugar do ícone da aba Você. */
function Avatar({ on }: { on: boolean }) {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const initial = (me.data?.name ?? '').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[30px] w-[30px] items-center justify-center rounded-full bg-secondary text-[11px] font-extrabold text-foreground',
        on && 'shadow-[0_0_0_2px_hsl(var(--background)),0_0_0_4px_hsl(var(--foreground))]',
      )}
    >
      {initial}
    </span>
  );
}

function TabLink({ tab, on }: { tab: NavTab; on: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-label={tab.label}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-2xl transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on && tab.icon !== 'avatar'
          ? 'bg-foreground text-background'
          : 'text-faint hover:text-foreground',
      )}
    >
      {tab.icon === 'avatar' ? <Avatar on={on} /> : <Icon name={tab.icon} size={22} />}
    </Link>
  );
}

/**
 * Hoje · Nutrição · Treino · Comunidade · Você, só ícone, e o botão redondo da
 * IA à direita (ADR 040 revisada, `navigation.ts` do api-client). A barra
 * some nas tarefas de foco (`navBarMode`): conversa, câmera, sessão em
 * andamento, criar comunidade, onboarding. Acima dela, quando há, ficam a
 * barra do treino em andamento e o cartão "esperando você". No desktop a
 * lateral (`side-nav.tsx`) faz o papel.
 */
export function BottomNav() {
  const { pathname, session, visible, workoutBar } = useBottomChrome();
  const drawer = useAiDrawer();
  const usable = aiUsable(useChatAvailability().data);
  const active = activeNavKey(pathname);
  if (!visible) return null;

  const above = NAV_BOTTOM + NAV_HEIGHT + ACTIVE_WORKOUT_BAR_GAP;
  return (
    <>
      {workoutBar && session && <ActiveWorkoutBar session={session} bottom={above} />}
      <AiPendingCard
        enabled={usable && !drawer.isOpen}
        bottom={above + 2 + (workoutBar ? ACTIVE_WORKOUT_BAR_HEIGHT + ACTIVE_WORKOUT_BAR_GAP : 0)}
      />
      <nav
        aria-label="Principal"
        style={{ bottom: `calc(${NAV_BOTTOM}px + env(safe-area-inset-bottom))` }}
        className="fixed left-4 right-[96px] z-50 flex h-[68px] items-center gap-0.5 rounded-[22px] bg-muted/85 px-1.5 shadow-[0_0_0_1px_hsl(var(--border-subtle)),0_20px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl md:hidden"
      >
        {PRIMARY_TABS.map((tab) => (
          <TabLink key={tab.key} tab={tab} on={active === tab.key} />
        ))}
      </nav>
      <div
        style={{ bottom: `calc(${NAV_BOTTOM}px + env(safe-area-inset-bottom))` }}
        className="fixed right-4 z-50 md:hidden"
      >
        <AiFab />
      </div>
    </>
  );
}

/**
 * O respiro embaixo do conteúdo: o `pb-24` do `<main>` cobre a barra; com a
 * barra do treino em andamento, mais 64 px (56 + 8) para nada ficar atrás dela.
 */
export function BottomSpacer() {
  const { workoutBar } = useBottomChrome();
  return workoutBar ? <div aria-hidden className="h-16 md:hidden" /> : null;
}
