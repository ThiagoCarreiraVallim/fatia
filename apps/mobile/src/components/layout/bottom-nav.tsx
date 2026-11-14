import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  PRIMARY_TABS,
  activeNavKey,
  navBarMode,
  usersApi,
  workoutApi,
  type NavTab,
} from '@fatia/api-client';
import { Icon } from '@/components/ui';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';
import { ActiveWorkoutBar } from './active-workout-bar';
import {
  ACTIVE_WORKOUT_BAR_GAP,
  ACTIVE_WORKOUT_BAR_HEIGHT,
  NAV_BOTTOM,
  NAV_HEIGHT,
} from './bottom-space';
import { AiFab } from './ai-fab';
import { AiPendingCard } from './ai-pending-card';
import { useAiDrawer } from './ai-drawer';
import { aiUsable, useChatAvailability } from './use-ai-state';

/** A sessão aberta, com a mesma chave da tela de Treino e do menu da IA. */
export function useActiveSession(enabled = true) {
  return useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    enabled,
  });
}

interface BottomChrome {
  visible: boolean;
  /** A barra "treino em andamento" está na tela: `Screen` dá mais respiro embaixo. */
  workoutBar: boolean;
}

const BottomChromeContext = createContext<BottomChrome>({ visible: false, workoutBar: false });

/** O que aparece embaixo nesta rota. Fora do app logado, nada. */
export function useBottomChrome(): BottomChrome {
  return useContext(BottomChromeContext);
}

/**
 * Calcula uma vez, no layout do app logado, o que fica embaixo: a barra some
 * nas tarefas de foco (`navBarMode`), inclusive na tela da sessão aberta.
 */
export function BottomChromeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const session = useActiveSession().data ?? null;
  const visible = navBarMode(pathname, { activeSessionId: session?.id ?? null }) === 'visible';
  return (
    <BottomChromeContext.Provider value={{ visible, workoutBar: visible && session !== null }}>
      {children}
    </BottomChromeContext.Provider>
  );
}

function Avatar({ on }: { on: boolean }) {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const initial = (me.data?.name ?? '').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <View
      className="h-[30px] w-[30px] items-center justify-center rounded-full bg-secondary"
      style={on ? { borderWidth: 2, borderColor: colors.foreground } : undefined}
    >
      <Text className="font-sans-bold text-[11px] text-foreground">{initial}</Text>
    </View>
  );
}

function Tab({ tab, on }: { tab: NavTab; on: boolean }) {
  const router = useRouter();
  const pill = on && tab.icon !== 'avatar';
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: on }}
      onPress={() => router.navigate(tab.href as never)}
      className={cn(
        'h-[52px] min-w-0 flex-1 items-center justify-center rounded-2xl',
        pill && 'bg-foreground',
      )}
    >
      {tab.icon === 'avatar' ? (
        <Avatar on={on} />
      ) : (
        <Icon name={tab.icon} size={22} color={pill ? colors.background : colors.faintForeground} />
      )}
    </Pressable>
  );
}

/**
 * Réplica de `apps/web/src/components/layout/bottom-nav.tsx` (ADR 040
 * revisada): Hoje · Nutrição · Treino · Comunidade · Você, só ícone, com o
 * nome no leitor de tela, e o botão redondo da IA à direita. Acima, quando há,
 * a barra do treino em andamento e o cartão "esperando você".
 */
export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const insets = useSafeAreaInsets();
  const { visible, workoutBar } = useBottomChrome();
  const session = useActiveSession().data ?? null;
  const drawer = useAiDrawer();
  const usable = aiUsable(useChatAvailability().data);
  const active = activeNavKey(pathname);
  if (!visible) return null;

  const bottom = insets.bottom + NAV_BOTTOM;
  const above = bottom + NAV_HEIGHT + ACTIVE_WORKOUT_BAR_GAP;
  return (
    <>
      {workoutBar && session ? <ActiveWorkoutBar session={session} bottom={above} /> : null}
      <AiPendingCard
        enabled={usable && !drawer.isOpen}
        bottom={above + 2 + (workoutBar ? ACTIVE_WORKOUT_BAR_HEIGHT + ACTIVE_WORKOUT_BAR_GAP : 0)}
      />
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Principal"
        style={{ bottom, elevation: 10 }}
        className="absolute left-4 right-[96px] z-50 h-[68px] flex-row items-center gap-0.5 rounded-[22px] border border-border bg-muted px-1.5"
      >
        {PRIMARY_TABS.map((tab) => (
          <Tab key={tab.key} tab={tab} on={active === tab.key} />
        ))}
      </View>
      <View style={{ bottom }} className="absolute right-4 z-50">
        <AiFab />
      </View>
    </>
  );
}
