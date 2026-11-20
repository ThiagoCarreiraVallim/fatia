import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
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
import { Icon, useAnyDrawerOpen } from '@/components/ui';
import { colors } from '@/theme/colors';
import { UserAvatar } from '@/components/you/user-avatar';
import { ActiveWorkoutBar } from './active-workout-bar';
import {
  ACTIVE_WORKOUT_BAR_GAP,
  ACTIVE_WORKOUT_BAR_HEIGHT,
  NAV_BOTTOM,
  NAV_HEIGHT,
} from './bottom-space';
import { AiFab } from './ai-fab';
import { AiPendingCard } from './ai-pending-card';
import { useAiMenu } from './ai-menu';
import { aiUsable, useChatAvailability } from './use-ai-state';
import {
  SCROLL_CHROME,
  chromeAfterIdle,
  initialScrollChrome,
  nextScrollChrome,
} from './scroll-chrome';
import { pillEdgeSprings, pillRect } from './tab-pill';

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

/**
 * A barra escondida pela rolagem (item 4): `hide` vai de 0 (na tela) a 1 (fora,
 * embaixo) e `target` é para onde ela está indo. Moram no provider para que
 * qualquer lista da tela atual mexa na mesma barra.
 */
interface ChromeMotion {
  hide: SharedValue<number>;
  target: SharedValue<number>;
  /** Uma volta "parou de rolar" está agendada. */
  idle: SharedValue<boolean>;
}

const ChromeMotionContext = createContext<ChromeMotion | null>(null);

/** O que aparece embaixo nesta rota. Fora do app logado, nada. */
export function useBottomChrome(): BottomChrome {
  return useContext(BottomChromeContext);
}

/**
 * Calcula uma vez, no layout do app logado, o que fica embaixo: a barra some
 * nas tarefas de foco (`navBarMode`), inclusive na tela da sessão aberta.
 *
 * O valor é memorizado: com as abas montadas (item 6), toda `Screen` de aba lê
 * este contexto, e um objeto novo a cada troca de rota re-renderizava todas.
 */
export function BottomChromeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const session = useActiveSession().data ?? null;
  const visible = navBarMode(pathname, { activeSessionId: session?.id ?? null }) === 'visible';
  const workoutBar = visible && session !== null;
  const value = useMemo(() => ({ visible, workoutBar }), [visible, workoutBar]);

  const hide = useSharedValue(0);
  const target = useSharedValue(0);
  const idle = useSharedValue(false);
  const motion = useMemo(() => ({ hide, target, idle }), [hide, target, idle]);
  // Trocou de tela: a barra volta.
  useEffect(() => {
    target.set(0);
    idle.set(false);
    hide.set(withTiming(0, { duration: SCROLL_CHROME.slideMs }));
  }, [pathname, hide, target, idle]);

  return (
    <ChromeMotionContext.Provider value={motion}>
      <BottomChromeContext.Provider value={value}>{children}</BottomChromeContext.Provider>
    </ChromeMotionContext.Provider>
  );
}

/**
 * O `onScroll` de qualquer rolagem vertical da tela (o `Screen`, uma
 * `Animated.FlatList`): esconde a barra ao descer, mostra ao subir, perto do
 * topo, no fim e depois de ~250 ms parada (`scroll-chrome.ts`). Tudo na thread
 * de UI, sem re-render.
 */
export function useChromeScrollHandler() {
  const motion = useContext(ChromeMotionContext);
  const state = useSharedValue(initialScrollChrome());
  return useAnimatedScrollHandler({
    onScroll: (e) => {
      if (!motion) return;
      const next = nextScrollChrome(state.value, {
        y: e.contentOffset.y,
        contentHeight: e.contentSize.height,
        viewportHeight: e.layoutMeasurement.height,
      });
      state.set(next);
      const desired = next.hidden ? 1 : 0;
      if (motion.idle.value) {
        // Voltou a rolar antes da volta "parada": cancela a volta.
        motion.idle.set(false);
        if (desired === 1) motion.hide.set(withTiming(1, { duration: SCROLL_CHROME.slideMs }));
      }
      if (desired !== motion.target.value) {
        motion.target.set(desired);
        motion.hide.set(withTiming(desired, { duration: SCROLL_CHROME.slideMs }));
      }
    },
    onEndDrag: () => {
      if (!motion || motion.target.value === 0) return;
      scheduleIdleShow(motion, state);
    },
    onMomentumEnd: () => {
      if (!motion || motion.target.value === 0) return;
      scheduleIdleShow(motion, state);
    },
  });
}

function scheduleIdleShow(
  motion: ChromeMotion,
  state: SharedValue<ReturnType<typeof initialScrollChrome>>,
) {
  'worklet';
  motion.idle.set(true);
  motion.hide.set(
    withDelay(
      SCROLL_CHROME.idleMs,
      withTiming(0, { duration: SCROLL_CHROME.slideMs }, (finished) => {
        if (!finished || !motion.idle.value) return;
        motion.idle.value = false;
        motion.target.value = 0;
        state.value = chromeAfterIdle(state.value);
      }),
    ),
  );
}

function YouAvatar() {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  return <UserAvatar name={me.data?.name} url={me.data?.avatarUrl} size={30} />;
}

function Tab({ tab, on }: { tab: NavTab; on: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: on }}
      onPress={() => router.navigate(tab.href as never)}
      className="h-[52px] min-w-0 flex-1 items-center justify-center rounded-2xl"
    >
      {tab.icon === 'avatar' ? (
        <YouAvatar />
      ) : (
        <Icon name={tab.icon} size={22} color={on ? colors.background : colors.faintForeground} />
      )}
    </Pressable>
  );
}

/**
 * A pílula clara atrás da aba ativa, inclusive em Você (onde a foto ou a
 * inicial fica dentro dela). Desliza com duas molas e estica no caminho
 * (`tab-pill.ts`). Anima `translateX` e `width` de uma view folha, absoluta e
 * sem filhos: a largura muda o desenho (escala deformaria o raio dos cantos) e
 * não refaz o layout de mais nada.
 */
function TabPill({ index, slot }: { index: number; slot: number }) {
  const left = useSharedValue(Math.max(index, 0));
  const right = useSharedValue(Math.max(index, 0));
  const shown = useSharedValue(index >= 0 ? 1 : 0);
  const previous = useRef(index);

  useEffect(() => {
    const from = previous.current;
    previous.current = index;
    if (index < 0) {
      shown.set(withTiming(0, { duration: 150 }));
      return;
    }
    if (from < 0) {
      left.set(index);
      right.set(index);
      shown.set(withTiming(1, { duration: 150 }));
      return;
    }
    const springs = pillEdgeSprings(from, index);
    left.set(withSpring(index, springs.left));
    right.set(withSpring(index, springs.right));
  }, [index, left, right, shown]);

  const style = useAnimatedStyle(() => {
    const r = pillRect(left.value, right.value, slot);
    return { width: r.width, opacity: shown.value, transform: [{ translateX: r.x }] };
  });
  if (slot <= 0) return null;
  return <Animated.View pointerEvents="none" style={[styles.pill, style]} />;
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
  const motion = useContext(ChromeMotionContext);
  const session = useActiveSession().data ?? null;
  const menu = useAiMenu();
  const usable = aiUsable(useChatAvailability().data);
  const active = activeNavKey(pathname);
  const activeIndex = PRIMARY_TABS.findIndex((t) => t.key === active);
  const [rowWidth, setRowWidth] = useState(0);
  // Com um drawer aberto a barra sai: ela mora fora da tela e cobriria o
  // rodapé do sheet (botões de salvar, confirmar).
  const drawerOpen = useAnyDrawerOpen();

  const bottom = insets.bottom + NAV_BOTTOM;
  const above = bottom + NAV_HEIGHT + ACTIVE_WORKOUT_BAR_GAP;
  // Desce o bastante para levar junto a barra do treino e o cartão da IA.
  const travel =
    above + (workoutBar ? ACTIVE_WORKOUT_BAR_HEIGHT + ACTIVE_WORKOUT_BAR_GAP : 0) + 120;
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: (motion?.hide.value ?? 0) * travel }],
  }));

  if (!visible || drawerOpen) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, slide]}>
      {workoutBar && session ? <ActiveWorkoutBar session={session} bottom={above} /> : null}
      <AiPendingCard
        enabled={usable && !menu.isOpen}
        bottom={above + 2 + (workoutBar ? ACTIVE_WORKOUT_BAR_HEIGHT + ACTIVE_WORKOUT_BAR_GAP : 0)}
      />
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Principal"
        style={{ bottom, elevation: 10 }}
        className="absolute left-4 right-[96px] z-50 h-[68px] flex-row items-center rounded-[22px] border border-border bg-card px-1.5"
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      >
        <TabPill
          index={activeIndex}
          slot={rowWidth > 0 ? (rowWidth - 2 - 12) / PRIMARY_TABS.length : 0}
        />
        {PRIMARY_TABS.map((tab) => (
          <Tab key={tab.key} tab={tab} on={active === tab.key} />
        ))}
      </View>
      <View style={{ bottom }} className="absolute right-4 z-50">
        <AiFab />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 6,
    top: 7,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.foreground,
  },
});
