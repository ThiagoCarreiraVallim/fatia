import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  type SharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { easing } from '@fatia/design';
import {
  AI_DRAWER_MANUAL_ITEMS,
  AI_MENU_DRAG_CLOSE_PX,
  AI_PRO_TEASER,
  aiMenuBackLabel,
  aiMenuFrame,
  aiMenuPlaceholder,
  completionHistory,
  conversationTimeLabel,
  drawerChipSection,
  drawerConversations,
  freeOfferCta,
  mealTypeForTime,
  nutritionApi,
  suggestionIcon,
  workoutApi,
  workoutQuickLabel,
  type AiDrawerManualKey,
  type AiMenuFrame,
  type MealType,
  type WorkoutSession,
} from '@fatia/api-client';
import { DrawerLayer, Icon } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { hojeIso } from '@/components/nutrition/helpers';
import { BodyLogSheet, LogWaterDrawer } from '@/components/progress';
import { inAppPurchaseAvailable } from '@/billing/purchases';
import { useChatSession } from '@/chat/chat-provider';
import { useDictation } from '@/chat/dictation';
import { colors } from '@/theme/colors';
import { AI_MENU_MOTION, menuBackdrop, navChrome, notchLayout } from './ai-menu-frame';
import { aiLocked, aiUsable, useChatAvailability, useDrawerConversations } from './use-ai-state';

type Target = 'water' | 'weight' | 'steps' | { meal: { day: string; type: MealType } };

interface AiMenuState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

interface AiMenuInternals extends AiMenuState {
  go: (href: string) => void;
  pick: (t: Target) => void;
  /** O menu está montado: aberto, ou a tela ainda voltando do notch. */
  mounted: boolean;
  unmount: () => void;
}

const AiMenuContext = createContext<AiMenuInternals>({
  isOpen: false,
  open: () => undefined,
  close: () => undefined,
  go: () => undefined,
  pick: () => undefined,
  mounted: false,
  unmount: () => undefined,
});

/** Abre o menu da IA. Quem chama é o botão redondo da `BottomNav`. */
export function useAiMenu(): AiMenuState {
  return useContext(AiMenuContext);
}

const curve = (c: readonly [number, number, number, number]) =>
  Easing.bezier(c[0], c[1], c[2], c[3]);
const timing = (duration: number, c: readonly [number, number, number, number]) => ({
  duration,
  easing: curve(c),
  // Com "reduzir movimento" a troca é instantânea.
  reduceMotion: ReduceMotion.System,
});

/**
 * Réplica de `apps/web/src/components/layout/ai-menu.tsx`: o menu "O que
 * vamos registrar?" (ADR 040, pranchas `Al-H6c5` a `Al-H6c9`), com as mesmas
 * regras e textos (vêm de `ai-drawer.ts` do api-client).
 *
 * Não é folha: ao abrir, a **tela atual** (o `children`, que é o `<Slot />`
 * das abas) encolhe e sobe até um notch arredondado no topo, e o menu aparece
 * atrás dela. Fechar — voltar, tocar ou arrastar o notch, o voltar do Android —
 * faz o inverso. A barra de abas (`nav`) desce e some.
 *
 * As folhas de registro (comida, água, peso, passos) continuam folhas: o menu
 * só escolhe, e elas abrem por cima da tela de onde a pessoa veio.
 */
export function AiMenuProvider({ children, nav }: { children: ReactNode; nav: ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [isOpen]);

  const open = useCallback(() => {
    setMounted(true);
    setIsOpen(true);
  }, []);
  const unmount = useCallback(() => setMounted(false), []);
  const close = useCallback(() => setIsOpen(false), []);
  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href as never);
    },
    [router],
  );
  const pick = useCallback((next: Target) => {
    setIsOpen(false);
    setTarget(next);
  }, []);

  const value = useMemo(
    () => ({ isOpen, open, close, go, pick, mounted, unmount }),
    [isOpen, open, close, go, pick, mounted, unmount],
  );
  const meal = typeof target === 'object' && target !== null ? target.meal : null;
  const closeTarget = () => setTarget(null);

  return (
    <AiMenuContext.Provider value={value}>
      <AiMenuStage nav={nav}>{children}</AiMenuStage>
      <DrawerLayer>
        {meal ? (
          <FoodSearchDrawer
            open
            onOpenChange={(o) => !o && closeTarget()}
            date={meal.day}
            mealType={meal.type}
          />
        ) : null}
        <LogWaterDrawer open={target === 'water'} onClose={closeTarget} />
        {/* Peso e passos são a mesma folha (Al-G7), com o segmentado no topo. */}
        <BodyLogSheet
          open={target === 'weight' || target === 'steps'}
          initialKind={target === 'steps' ? 'steps' : 'weight'}
          onClose={closeTarget}
        />
      </DrawerLayer>
    </AiMenuContext.Provider>
  );
}

function AiMenuStage({ children, nav }: { children: ReactNode; nav: ReactNode }) {
  const { isOpen, close, mounted, unmount } = useContext(AiMenuContext);
  const pathname = usePathname() ?? '/';
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [typing, setTyping] = useState(false);
  const keyboard = typing && isOpen;

  const progress = useSharedValue(0);
  const backdrop = useSharedValue(0);
  const navFade = useSharedValue(0);
  const navMove = useSharedValue(0);
  const kb = useSharedValue(0);

  useEffect(() => {
    const target = isOpen ? 1 : 0;
    progress.value = withTiming(target, timing(AI_MENU_MOTION.notch, easing.notch), (done) => {
      // O menu desmonta quando a tela termina de voltar.
      if (done && target === 0) scheduleOnRN(unmount);
    });
    backdrop.value = withDelay(
      AI_MENU_MOTION.menuDelay,
      withTiming(target, timing(AI_MENU_MOTION.menu, easing.ease)),
    );
    navFade.value = withTiming(target, timing(AI_MENU_MOTION.navFade, easing.ease));
    navMove.value = withTiming(target, timing(AI_MENU_MOTION.navMove, easing.ease));
  }, [isOpen, progress, backdrop, navFade, navMove, unmount]);

  useEffect(() => {
    kb.value = withTiming(keyboard ? 1 : 0, timing(AI_MENU_MOTION.header, easing.ease));
  }, [keyboard, kb]);

  const { width, height } = size;
  // A prancha tem 8 px do topo da tela; no aparelho o notch fica abaixo da
  // barra de status, que senão desenharia o relógio por cima dele.
  const safeTop = useSafeAreaInsets().top;
  const below = (f: AiMenuFrame): AiMenuFrame => ({
    ...f,
    top: f.top + safeTop,
    headerTop: f.headerTop + safeTop,
  });
  const open = below(aiMenuFrame(width));
  const withKeyboard = below(aiMenuFrame(width, { keyboard: true }));

  const frontStyle = useAnimatedStyle(() => {
    const l = notchLayout(progress.value, kb.value, open, withKeyboard, height);
    return {
      top: l.top,
      left: l.left,
      right: l.right,
      height: l.height,
      borderRadius: l.borderRadius,
    };
  });
  const innerStyle = useAnimatedStyle(() => {
    const l = notchLayout(progress.value, kb.value, open, withKeyboard, height);
    return { transform: [{ translateY: l.translateY }, { scale: l.scale }] };
  });
  const menuStyle = useAnimatedStyle(() => {
    const b = menuBackdrop(backdrop.value);
    return {
      opacity: b.opacity,
      transform: [{ translateY: b.translateY }, { scale: b.scale }],
    };
  });
  const navStyle = useAnimatedStyle(() => ({
    opacity: navChrome(navFade.value).opacity,
    transform: [{ translateY: navChrome(navMove.value).translateY }],
  }));

  const backLabel = aiMenuBackLabel(pathname);

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.sunken }]}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (w !== size.width || h !== size.height) setSize({ width: w, height: h });
      }}
    >
      {mounted ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transformOrigin: 'bottom' }, menuStyle]}
          accessibilityViewIsModal
        >
          <AiMenuPanel
            kb={kb}
            from={open.headerTop}
            to={withKeyboard.headerTop}
            backLabel={backLabel}
            keyboard={keyboard}
            onTyping={setTyping}
          />
        </Animated.View>
      ) : null}

      {/* A tela atual: fechada é a janela inteira; aberta, o notch. */}
      <Animated.View
        testID="ai-menu-front"
        pointerEvents={isOpen ? 'none' : 'auto'}
        accessibilityElementsHidden={isOpen}
        importantForAccessibility={isOpen ? 'no-hide-descendants' : 'auto'}
        style={[
          styles.front,
          mounted
            ? [styles.clip, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]
            : null,
          frontStyle,
        ]}
        className="bg-background"
      >
        <Animated.View
          style={[
            { width, height, marginLeft: -width / 2, transformOrigin: 'top' },
            styles.inner,
            innerStyle,
          ]}
        >
          {children}
        </Animated.View>
      </Animated.View>

      {isOpen ? (
        <NotchHandle
          label={backLabel}
          onClose={close}
          kb={kb}
          open={open}
          withKeyboard={withKeyboard}
        />
      ) : null}

      <Animated.View
        pointerEvents={isOpen ? 'none' : 'box-none'}
        accessibilityElementsHidden={isOpen}
        importantForAccessibility={isOpen ? 'no-hide-descendants' : 'auto'}
        style={[StyleSheet.absoluteFill, styles.nav, navStyle]}
      >
        {nav}
      </Animated.View>
    </View>
  );
}

/**
 * O notch inteiro é um botão que volta para a tela: tocar ou arrastar para
 * baixo fecha. A alcinha embaixo é o sinal de que dá para puxar.
 */
function NotchHandle({
  label,
  onClose,
  kb,
  open,
  withKeyboard,
}: {
  label: string;
  onClose: () => void;
  kb: SharedValue<number>;
  open: AiMenuFrame;
  withKeyboard: AiMenuFrame;
}) {
  const style = useAnimatedStyle(() => {
    const height = open.height + (withKeyboard.height - open.height) * kb.value;
    return { top: open.top, left: open.inset, right: open.inset, height };
  });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > AI_MENU_DRAG_CLOSE_PX) onClose();
        },
      }),
    [onClose],
  );
  return (
    <Animated.View style={[styles.notch, style]} {...pan.panHandlers}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      >
        <View
          style={[styles.grabber, { backgroundColor: colors.foreground }]}
          pointerEvents="none"
        />
      </Pressable>
    </Animated.View>
  );
}

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  // O `b3` da prancha: 12 px em tx3.
  return (
    <Text accessibilityRole="header" className={cn('px-2 text-xs text-faint', className)}>
      {children}
    </Text>
  );
}

function RoundIcon({ name }: { name: (typeof AI_DRAWER_MANUAL_ITEMS)[number]['icon'] }) {
  return (
    <View
      className="h-12 w-12 items-center justify-center rounded-full"
      style={{ borderWidth: 1, borderColor: colors.borderStrong }}
    >
      <Icon name={name} size={16} />
    </View>
  );
}

/** O menu, atrás da tela que encolheu. */
function AiMenuPanel({
  kb,
  from,
  to,
  backLabel,
  keyboard,
  onTyping,
}: {
  /** Teclado subido (0–1): o cabeçalho vai de `from` a `to`. */
  kb: SharedValue<number>;
  from: number;
  to: number;
  backLabel: string;
  keyboard: boolean;
  onTyping: (on: boolean) => void;
}) {
  const { close, go, pick } = useContext(AiMenuContext);
  const insets = useSafeAreaInsets();
  // O cabeçalho (e o corpo, 60 px abaixo) sobem com o notch no teclado (Al-H6c7).
  const headerTop = useAnimatedStyle(() => ({ top: from + (to - from) * kb.value }));
  const bodyTop = useAnimatedStyle(() => ({ top: from + 60 + (to - from) * kb.value }));
  const qc = useQueryClient();
  const session = useChatSession();
  const availability = useChatAvailability().data;
  const usable = aiUsable(availability);
  const locked = aiLocked(availability);
  const conversations = useDrawerConversations(usable);
  const input = useRef<TextInput>(null);
  const [draft, setDraft] = useState('');
  const [showManual, setShowManual] = useState(false);
  const dictation = useDictation((texto) =>
    setDraft((atual) => (atual.trim() ? `${atual.trimEnd()} ${texto}` : texto)),
  );

  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
  });
  const openSession = active.data ?? null;
  const goToSession = (s: WorkoutSession) => go(`/workout/session/${s.id}`);

  // O completar usa o que a pessoa já comeu (mesma chave da busca de comida).
  const myFoods = useQuery({
    queryKey: ['nutrition', 'my-foods', null],
    queryFn: () => nutritionApi.myFoods(),
    enabled: usable && keyboard,
    retry: false,
  });

  const start = useMutation({
    mutationFn: () => workoutApi.startSession({ startedAt: new Date().toISOString() }),
    onSuccess: (s) => {
      qc.setQueryData(['workout', 'active'], s);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      goToSession(s);
    },
  });

  const choose = (key: AiDrawerManualKey) => {
    if (key === 'workout') {
      // Retoma a sessão aberta: a API recusa a segunda (#350).
      if (openSession) goToSession(openSession);
      else start.mutate();
      return;
    }
    if (key === 'meal') {
      pick({ meal: { day: hojeIso(), type: mealTypeForTime(new Date()) } });
      return;
    }
    if (key === 'water' || key === 'weight' || key === 'steps') pick(key);
  };

  /** Conversa nova com a mensagem: a sessão do chat já manda, a tela só acompanha. */
  const send = (text: string) => {
    const message = text.trim();
    if (!message) return;
    const id = session.startNew();
    void session.send({ text: message });
    go(`/chat/${id}`);
  };

  const all = conversations.data ?? [];
  const foods = myFoods.data ? [...myFoods.data.favorites, ...myFoods.data.recent] : [];
  const chipSection = drawerChipSection(draft, completionHistory(all, foods));
  const listed = drawerConversations(all, 4);
  const cta = freeOfferCta(inAppPurchaseAvailable());
  const recording = dictation.state === 'recording';
  const empty = !draft.trim();

  const manualButton = (item: (typeof AI_DRAWER_MANUAL_ITEMS)[number], iconOnly: boolean) => {
    const busy = item.key === 'workout' && (start.isPending || active.isLoading);
    const name = item.key === 'workout' ? workoutQuickLabel(Boolean(openSession)) : item.label;
    return (
      <Pressable
        key={item.key}
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => choose(item.key)}
        className="items-center gap-1 active:opacity-70"
        style={[iconOnly ? null : { width: `${100 / 7}%` }, busy ? { opacity: 0.6 } : null]}
      >
        <RoundIcon name={item.icon} />
        {iconOnly ? null : <Text className="text-[11px] text-faint">{item.label}</Text>}
      </Pressable>
    );
  };

  const title = (
    <Text
      accessibilityRole="header"
      numberOfLines={1}
      className={cn('font-display text-h2 text-foreground', keyboard ? 'flex-1' : 'px-6')}
    >
      O que vamos registrar?
    </Text>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.fill}
    >
      <Animated.View
        style={[styles.header, headerTop]}
        className="flex-row items-center gap-2 pl-3 pr-4"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={close}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
        >
          <Icon name="chevL" size={20} color={colors.foreground} />
        </Pressable>
        {keyboard ? title : <View className="flex-1" />}
        {usable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Conversas"
            onPress={() => go('/chat')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <Icon name="list" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </Animated.View>

      <Animated.View style={[styles.body, { paddingBottom: insets.bottom + 22 }, bodyTop]}>
        <View style={styles.fill}>
          {keyboard ? (
            // Tocar no vazio entre o cabeçalho e a doca esconde o teclado.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Esconder teclado"
              onPress={() => input.current?.blur()}
              style={styles.fill}
            />
          ) : (
            <ScrollView
              style={styles.fill}
              contentContainerStyle={{ gap: 24, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              {title}

              <View className="gap-2 px-4">
                <SectionLabel>Registrar manual</SectionLabel>
                {/* Grade de 7 da prancha; sem Hábito e Check-in (#390), sobram 5 do mesmo tamanho. */}
                <View className="flex-row">
                  {AI_DRAWER_MANUAL_ITEMS.map((item) => manualButton(item, false))}
                </View>
                {start.error ? (
                  <Text accessibilityRole="alert" className="px-2 text-sm text-danger">
                    Não deu para começar o treino. Tente de novo.
                  </Text>
                ) : null}
              </View>

              {usable && listed.length > 0 ? (
                <View className="gap-2 px-4">
                  <SectionLabel>Conversas</SectionLabel>
                  <View className="px-1">
                    {listed.map((c) => (
                      <Pressable
                        key={c.id}
                        accessibilityRole="link"
                        accessibilityLabel={`${c.title ?? 'Conversa'}, ${conversationTimeLabel(c)}`}
                        onPress={() => go(`/chat/${c.id}`)}
                        className="min-h-[44px] flex-row items-center gap-3 rounded-xl px-1 active:bg-muted"
                      >
                        {c.state === 'waiting' ? (
                          <View className="h-2 w-2 rounded-full bg-primary" />
                        ) : c.state === 'thinking' ? (
                          <View
                            className="h-3 w-3 rounded-full"
                            style={{
                              borderWidth: 2,
                              borderColor: colors.surface3,
                              borderTopColor: colors.primary,
                            }}
                          />
                        ) : null}
                        <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
                          {c.title ?? 'Conversa'}
                        </Text>
                        <Text
                          className={cn(
                            'text-xs',
                            c.state === 'waiting' ? 'text-primary-text' : 'text-faint',
                          )}
                        >
                          {conversationTimeLabel(c)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {locked ? (
                // Prancha `Al-H6c6`: o que a IA Pro faria, e o convite embaixo.
                <View className="gap-6">
                  <View className="gap-2">
                    <SectionLabel className="px-6">{AI_PRO_TEASER.title}</SectionLabel>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
                    >
                      {AI_PRO_TEASER.items.map((item) => (
                        <Pressable
                          key={item}
                          accessibilityRole="button"
                          accessibilityLabel={`${item} (exige o plano PRO)`}
                          onPress={() => go(AI_PRO_TEASER.href)}
                          className="h-11 flex-row items-center gap-2 rounded-full px-3.5 active:opacity-70"
                          style={{ borderWidth: 1, borderColor: colors.borderStrong }}
                        >
                          <Icon name="lock" size={16} color={colors.mutedForeground} />
                          <Text className="text-b2 text-muted-foreground">{item}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                  {/* `card` sobre o fundo do menu, mais fundo que a tela: o `muted`
                      da folha antiga quase some no #0c0c0c e no claro. */}
                  <View className="mx-4 gap-3 rounded-card bg-card p-3.5">
                    <View className="flex-row items-center gap-3">
                      <View className="h-8 w-8 items-center justify-center rounded-full bg-primary">
                        <Icon name="spark" size={16} color={colors.primaryForeground} />
                      </View>
                      <View className="flex-1">
                        <Text className="font-sans-bold text-sm text-foreground">
                          {AI_PRO_TEASER.lead}
                        </Text>
                        <Text className="text-b2 text-muted-foreground">{AI_PRO_TEASER.body}</Text>
                      </View>
                    </View>
                    <View className="flex-row gap-2">
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => go(cta.href)}
                        className="min-h-[44px] flex-1 items-center justify-center rounded-full bg-primary px-4"
                      >
                        <Text className="font-sans-bold text-sm text-primary-foreground">
                          {cta.label}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => go('/profile/connect')}
                        className="min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-full px-4"
                        style={{ borderWidth: 1, borderColor: colors.borderStrong }}
                      >
                        <Icon name="link" size={16} color={colors.mutedForeground} />
                        <Text className="font-sans-semibold text-sm text-muted-foreground">
                          Minha IA (MCP)
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          )}

          {usable ? (
            <View className="gap-3 pt-2">
              {keyboard && showManual && empty ? (
                <View
                  accessibilityLabel="Registrar manual"
                  className="flex-row justify-between px-4"
                >
                  {AI_DRAWER_MANUAL_ITEMS.map((item) => manualButton(item, true))}
                </View>
              ) : null}

              {chipSection || keyboard ? (
                <ScrollView
                  horizontal
                  accessibilityLabel={chipSection?.title ?? 'Sugestões'}
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
                >
                  {keyboard && empty ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: showManual }}
                      onPress={() => setShowManual((v) => !v)}
                      className={cn(
                        'h-11 flex-row items-center gap-2 rounded-full px-3.5',
                        showManual ? 'bg-foreground' : 'bg-muted',
                      )}
                    >
                      <Icon
                        name="grid"
                        size={16}
                        color={showManual ? colors.background : colors.faintForeground}
                      />
                      <Text
                        className={cn(
                          'text-b2',
                          showManual ? 'text-background' : 'text-foreground',
                        )}
                      >
                        Manual
                      </Text>
                    </Pressable>
                  ) : null}
                  {chipSection?.chips.map((phrase) => {
                    const icon = chipSection.onTap === 'send' ? suggestionIcon(phrase) : null;
                    return (
                      <Pressable
                        key={phrase}
                        accessibilityRole="button"
                        onPress={() =>
                          chipSection.onTap === 'fill' ? setDraft(phrase) : send(phrase)
                        }
                        className="h-11 flex-row items-center gap-2 rounded-full bg-muted px-3.5 active:opacity-70"
                      >
                        {icon ? (
                          <Icon name={icon} size={16} color={colors.faintForeground} />
                        ) : null}
                        <Text className="text-b2 text-foreground">{phrase}</Text>
                      </Pressable>
                    );
                  })}
                  {availability?.photos && empty ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => go('/nutrition/photo')}
                      className="h-11 flex-row items-center gap-2 rounded-full bg-muted px-3.5"
                    >
                      <Icon name="camera" size={16} color={colors.faintForeground} />
                      <Text className="text-b2 text-foreground">Foto do prato</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              ) : null}

              {dictation.error ? (
                <Text accessibilityRole="alert" className="px-6 text-xs text-danger">
                  {dictation.error}
                </Text>
              ) : null}

              <View className="flex-row items-center gap-2 px-4">
                <View
                  className="h-14 flex-1 flex-row items-center gap-1 rounded-full bg-muted pl-1.5 pr-4"
                  style={{ borderWidth: 1.5, borderColor: colors.primary }}
                >
                  {availability?.photos ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Foto do prato"
                      onPress={() => go('/nutrition/photo')}
                      className="h-11 w-11 items-center justify-center rounded-full"
                    >
                      <Icon name="camera" size={20} color={colors.mutedForeground} />
                    </Pressable>
                  ) : (
                    <View className="w-3" />
                  )}
                  <TextInput
                    ref={input}
                    accessibilityLabel="Pergunte ou registre com a IA"
                    placeholder={aiMenuPlaceholder(all)}
                    placeholderTextColor={colors.placeholder}
                    value={draft}
                    onChangeText={setDraft}
                    onFocus={() => onTyping(true)}
                    onBlur={() => {
                      onTyping(false);
                      setShowManual(false);
                    }}
                    returnKeyType="send"
                    onSubmitEditing={() => send(draft)}
                    className="h-[52px] flex-1 font-sans text-base text-foreground"
                  />
                </View>
                {draft.trim() ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Enviar"
                    onPress={() => send(draft)}
                    className="h-14 w-14 items-center justify-center rounded-full bg-primary"
                  >
                    <Icon name="send" size={22} color={colors.primaryForeground} />
                  </Pressable>
                ) : availability?.dictation ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={recording ? 'Parar o ditado' : 'Ditar'}
                    accessibilityState={{
                      selected: recording,
                      disabled: dictation.state === 'transcribing',
                    }}
                    disabled={dictation.state === 'transcribing'}
                    onPress={() => void (recording ? dictation.stop() : dictation.start())}
                    className="h-14 w-14 items-center justify-center rounded-full bg-primary"
                  >
                    <Icon
                      name={recording ? 'pause' : 'mic'}
                      size={22}
                      color={colors.primaryForeground}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  front: { position: 'absolute', zIndex: 5 },
  // Só enquanto o menu existe: no Android o recorte com raio que voltou a 0
  // deixava a tela em branco depois de fechar.
  clip: { overflow: 'hidden' },
  inner: { position: 'absolute', top: 0, left: '50%' },
  notch: { position: 'absolute', zIndex: 6 },
  // Acima da tela atual (que tem zIndex 5 para ficar sobre o menu).
  nav: { zIndex: 10, elevation: 10 },
  grabber: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.35,
  },
  header: { position: 'absolute', left: 0, right: 0, zIndex: 1 },
  body: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
