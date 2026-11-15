'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  PRIMARY_TABS,
  activeNavKey,
  dockedActionBottom,
  navBarMode,
  usersApi,
  workoutApi,
  type NavTab,
} from '@fatia/api-client';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import {
  ACTIVE_WORKOUT_BAR_GAP,
  ACTIVE_WORKOUT_BAR_HEIGHT,
  ActiveWorkoutBar,
} from './active-workout-bar';
import { AiFab } from './ai-fab';
import { AiPendingCard } from './ai-pending-card';
import { useAiMenu } from './ai-menu';
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
  const menu = useAiMenu();
  const usable = aiUsable(useChatAvailability().data);
  const active = activeNavKey(pathname);
  if (!visible) return null;

  const above = NAV_BOTTOM + NAV_HEIGHT + ACTIVE_WORKOUT_BAR_GAP;
  // Com o menu da IA aberto a barra desce e some (prancha `Al-H6c5`): o menu
  // ocupa a tela e tem o próprio campo embaixo.
  const away = menu.isOpen;
  const hide = cn(
    'transition-[opacity,transform] [transition-duration:400ms,600ms] [transition-timing-function:ease,cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
    away && 'pointer-events-none translate-y-[60px] opacity-0',
  );
  // z-40, abaixo das folhas, diálogos e menus (z-50): o fundo escuro deles
  // cobre a barra e os botões do modal nunca ficam atrás dela.
  return (
    <>
      {workoutBar && session && !away && <ActiveWorkoutBar session={session} bottom={above} />}
      <AiPendingCard
        enabled={usable && !menu.isOpen}
        bottom={above + 2 + (workoutBar ? ACTIVE_WORKOUT_BAR_HEIGHT + ACTIVE_WORKOUT_BAR_GAP : 0)}
      />
      <nav
        aria-label="Principal"
        style={{ bottom: `calc(${NAV_BOTTOM}px + env(safe-area-inset-bottom))` }}
        inert={away || undefined}
        className={cn(
          'fixed left-4 right-[96px] z-40 flex h-[68px] items-center gap-0.5 rounded-[22px] bg-card/85 px-1.5 shadow-[0_0_0_1px_hsl(var(--border-subtle)),0_20px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl md:hidden',
          hide,
        )}
      >
        {PRIMARY_TABS.map((tab) => (
          <TabLink key={tab.key} tab={tab} on={active === tab.key} />
        ))}
      </nav>
      <div
        style={{ bottom: `calc(${NAV_BOTTOM}px + env(safe-area-inset-bottom))` }}
        className={cn('fixed right-4 z-40 md:hidden', hide)}
      >
        <AiFab />
      </div>
    </>
  );
}

/**
 * O respiro embaixo do conteúdo, para o fim da lista e o último botão nunca
 * ficarem atrás da barra flutuante (22 + 68 px) nem do botão da IA: a altura
 * da barra mais o `pb-8` do `<main>` dá ~32 px livres acima dela, como o
 * `padding-bottom: 124–132px` das pranchas. Com a barra do treino em
 * andamento, mais 66 px (56 + 10). Sem a barra (tarefas de foco) e no
 * desktop, não ocupa nada.
 */
export function BottomSpacer() {
  const { visible, workoutBar } = useBottomChrome();
  if (!visible) return null;
  const height =
    NAV_BOTTOM + NAV_HEIGHT + (workoutBar ? ACTIVE_WORKOUT_BAR_HEIGHT + ACTIVE_WORKOUT_BAR_GAP : 0);
  return <div aria-hidden style={{ height }} className="md:hidden" />;
}

/** O que fica abaixo do `<main>`: o `pb-8` dele e, com a barra, o `BottomSpacer`. */
function belowContent(visible: boolean, workoutBar: boolean): number {
  if (!visible) return 32;
  return (
    32 +
    NAV_BOTTOM +
    NAV_HEIGHT +
    (workoutBar ? ACTIVE_WORKOUT_BAR_HEIGHT + ACTIVE_WORKOUT_BAR_GAP : 0)
  );
}

/**
 * A tela com botão preso embaixo (Al-T6, Al-T7, Al-T19): ocupa ao menos a
 * altura visível, em coluna, para o `DockedAction` descer até o lugar dele
 * mesmo quando a lista é curta.
 */
export function DockedPage({ children, className }: { children: ReactNode; className?: string }) {
  const { visible, workoutBar } = useBottomChrome();
  // 72 = a barra de topo (56) + o `pt-4` do `<main>`.
  const below = belowContent(visible, workoutBar);
  return (
    <div
      style={{ minHeight: `calc(100dvh - 72px - env(safe-area-inset-top) - ${below}px)` }}
      className={cn('flex flex-col gap-4', className)}
    >
      {children}
    </div>
  );
}

/**
 * O botão de ação preso embaixo da tela (pranchas Al-T6, Al-T7, Al-T19): fica
 * 14 px acima da barra flutuante e da barra do treino (`dockedActionBottom`,
 * api-client) — ou a 22 px do fim, sem a barra — e acompanha a rolagem. Vai no
 * fim de um `DockedPage`: `sticky` prende enquanto há conteúdo embaixo, e no
 * fim da página a margem negativa o deixa na mesma altura. Fica abaixo das
 * folhas e diálogos (z-50) e da barra (z-40).
 */
export function DockedAction({ children }: { children: ReactNode }) {
  const { visible, workoutBar } = useBottomChrome();
  const bottom = dockedActionBottom({ navVisible: visible, workoutBar });
  return (
    <div
      style={{
        ['--dock' as string]: `${bottom}px`,
        marginBottom: bottom - belowContent(visible, workoutBar),
      }}
      className="sticky bottom-[calc(var(--dock)+env(safe-area-inset-bottom))] z-30 mt-auto flex items-center gap-2 md:bottom-4"
    >
      {children}
    </div>
  );
}
