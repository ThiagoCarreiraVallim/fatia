import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AI_DRAWER_MANUAL_ITEMS,
  AI_PRO_TEASER,
  conversationTimeLabel,
  drawerChipSection,
  drawerConversations,
  freeOfferCta,
  mealTypeForTime,
  workoutApi,
  workoutQuickLabel,
  type AiDrawerManualKey,
  type MealType,
  type WorkoutSession,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerHeader,
  DrawerLayer,
  DrawerScrollView,
  DrawerTextInput,
  DrawerTitle,
  Icon,
} from '@/components/ui';
import { cn } from '@/components/ui/utils';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { hojeIso } from '@/components/nutrition/helpers';
import { LogStepsDrawer, LogWaterDrawer, LogWeightDrawer } from '@/components/progress';
import { inAppPurchaseAvailable } from '@/billing/purchases';
import { useChatSession } from '@/chat/chat-provider';
import { useDictation } from '@/chat/dictation';
import { colors } from '@/theme/colors';
import { aiLocked, aiUsable, useChatAvailability, useDrawerConversations } from './use-ai-state';

type Target = 'water' | 'weight' | 'steps' | { meal: { day: string; type: MealType } };

interface AiDrawerState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const AiDrawerContext = createContext<AiDrawerState>({
  isOpen: false,
  open: () => undefined,
  close: () => undefined,
});

/** Abre o menu da IA. Quem chama é o botão redondo da `BottomNav`. */
export function useAiDrawer(): AiDrawerState {
  return useContext(AiDrawerContext);
}

/**
 * Réplica de `apps/web/src/components/layout/ai-drawer.tsx`: o menu "O que
 * vamos registrar?" (ADR 040, prancha `Ia-Drawer`), com as mesmas regras e
 * textos (vêm de `ai-drawer.ts` do api-client). O registro manual vem primeiro
 * e funciona sem IA, no Free e com a IA fora do ar (PRD §3.1).
 *
 * Recebe a barra como filho para acertar a ordem de pintura sem portal (ver
 * `DrawerLayer`): a camada dos drawers vem depois e abre por cima dela. O
 * "voltar" do Android fecha o menu antes de sair da tela.
 */
export function AiDrawerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [isOpen]);

  const open = useCallback(() => setIsOpen(true), []);
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

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  const meal = typeof target === 'object' && target !== null ? target.meal : null;
  const closeTarget = () => setTarget(null);

  return (
    <AiDrawerContext.Provider value={value}>
      {children}
      <DrawerLayer>
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <AiDrawerBody onPick={pick} onGo={go} />
        </Drawer>
        {meal ? (
          <FoodSearchDrawer
            open
            onOpenChange={(o) => !o && closeTarget()}
            date={meal.day}
            mealType={meal.type}
          />
        ) : null}
        <LogWaterDrawer open={target === 'water'} onClose={closeTarget} />
        <LogWeightDrawer open={target === 'weight'} onClose={closeTarget} />
        <LogStepsDrawer open={target === 'steps'} onClose={closeTarget} />
      </DrawerLayer>
    </AiDrawerContext.Provider>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      className="px-2 text-b2 font-sans-semibold text-muted-foreground"
    >
      {children}
    </Text>
  );
}

function AiDrawerBody({
  onPick,
  onGo,
}: {
  onPick: (t: Target) => void;
  onGo: (href: string) => void;
}) {
  const qc = useQueryClient();
  const session = useChatSession();
  const availability = useChatAvailability().data;
  const usable = aiUsable(availability);
  const locked = aiLocked(availability);
  const conversations = useDrawerConversations(usable);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
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
  const goToSession = (s: WorkoutSession) => onGo(`/workout/session/${s.id}`);

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
      onPick({ meal: { day: hojeIso(), type: mealTypeForTime(new Date()) } });
      return;
    }
    if (key === 'water' || key === 'weight' || key === 'steps') onPick(key);
  };

  /** Conversa nova com a mensagem: a sessão do chat já manda, a tela só acompanha. */
  const send = (text: string) => {
    const message = text.trim();
    if (!message) return;
    const id = session.startNew();
    void session.send({ text: message });
    onGo(`/chat/${id}`);
  };

  const keyboard = typing;
  const manualVisible = !keyboard || showManual;
  const chipSection = drawerChipSection(draft);
  const listed = drawerConversations(conversations.data ?? [], 4);
  const cta = freeOfferCta(inAppPurchaseAvailable());
  const recording = dictation.state === 'recording';

  return (
    <DrawerScrollView
      contentContainerStyle={{ paddingBottom: 32, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <DrawerHeader className="flex-row items-center gap-2 px-6">
        <View className="flex-1">
          <DrawerTitle className="font-display-semibold text-h2">
            O que vamos registrar?
          </DrawerTitle>
        </View>
        {usable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Conversas"
            onPress={() => onGo('/chat')}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <Icon name="list" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </DrawerHeader>

      <View className="gap-2 px-4">
        <View className="flex-row items-center justify-between">
          <SectionLabel>Registrar manual</SectionLabel>
          {keyboard ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: showManual }}
              onPress={() => setShowManual((v) => !v)}
              className="min-h-[44px] justify-center rounded-full px-3"
            >
              <Text className="text-b2 font-sans-semibold text-foreground">Manual</Text>
            </Pressable>
          ) : null}
        </View>
        {manualVisible ? (
          // Grade de 4 colunas da prancha `Al-H6c6`.
          <View className="flex-row flex-wrap" style={{ rowGap: 12 }}>
            {AI_DRAWER_MANUAL_ITEMS.map((item) => {
              const busy = item.key === 'workout' && (start.isPending || active.isLoading);
              const name =
                item.key === 'workout' ? workoutQuickLabel(Boolean(openSession)) : item.label;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => choose(item.key)}
                  className="items-center gap-1 py-1 active:opacity-70"
                  style={[{ width: '25%' }, busy ? { opacity: 0.6 } : null]}
                >
                  <View
                    className="h-12 w-12 items-center justify-center rounded-full border"
                    style={{ borderColor: colors.borderStrong }}
                  >
                    <Icon name={item.icon} size={18} />
                  </View>
                  <Text className="text-[11px] text-muted-foreground">{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {start.error ? (
          <Text accessibilityRole="alert" className="px-2 text-sm text-danger">
            Não deu para começar o treino. Tente de novo.
          </Text>
        ) : null}
      </View>

      {usable && !keyboard && listed.length > 0 ? (
        <View className="gap-1 px-4">
          <SectionLabel>Conversas</SectionLabel>
          {listed.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="link"
              accessibilityLabel={`${c.title ?? 'Conversa'}, ${conversationTimeLabel(c)}`}
              onPress={() => onGo(`/chat/${c.id}`)}
              className="min-h-[44px] flex-row items-center gap-2 rounded-xl px-2 active:bg-muted"
            >
              <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
                {c.title ?? 'Conversa'}
              </Text>
              <Text
                className={cn(
                  'text-b2',
                  c.state === 'waiting'
                    ? 'font-sans-semibold text-primary-text'
                    : 'text-muted-foreground',
                )}
              >
                {conversationTimeLabel(c)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {locked ? (
        // Prancha `Al-H6c6`: o que a IA Pro faria, em chips com cadeado, e o card
        // com o convite embaixo.
        <View className="gap-3">
          <View className="gap-2 px-4">
            <SectionLabel>{AI_PRO_TEASER.title}</SectionLabel>
            <View className="flex-row flex-wrap gap-2">
              {AI_PRO_TEASER.items.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={`${item} (exige o plano PRO)`}
                  onPress={() => onGo(AI_PRO_TEASER.href)}
                  className="h-11 flex-row items-center gap-2 rounded-full bg-muted px-4 active:opacity-70"
                >
                  <Icon name="lock" size={14} color={colors.mutedForeground} />
                  <Text className="text-b2 text-foreground">{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View className="mx-4 gap-3 rounded-card bg-card p-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
                <Icon name="spark" size={16} color={colors.primaryForeground} />
              </View>
              <View className="flex-1">
                <Text className="font-sans-bold text-sm text-foreground">{AI_PRO_TEASER.lead}</Text>
                <Text className="text-b2 text-muted-foreground">{AI_PRO_TEASER.body}</Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => onGo(cta.href)}
                className="min-h-[44px] items-center justify-center rounded-full bg-primary px-4"
              >
                <Text className="font-sans-bold text-sm text-primary-foreground">{cta.label}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => onGo('/profile/tokens')}
                className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-full px-4"
              >
                <Icon name="link" size={16} color={colors.foreground} />
                <Text className="font-sans-semibold text-sm text-foreground">Minha IA (MCP)</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {usable ? (
        <View className="gap-3">
          {chipSection ? (
            <View className="gap-1 px-4">
              <SectionLabel>{chipSection.title}</SectionLabel>
              <View className="flex-row flex-wrap gap-2">
                {chipSection.chips.map((phrase) => (
                  <Pressable
                    key={phrase}
                    accessibilityRole="button"
                    onPress={() => (chipSection.onTap === 'fill' ? setDraft(phrase) : send(phrase))}
                    className="h-11 justify-center rounded-full bg-muted px-4 active:opacity-70"
                  >
                    <Text className="text-b2 text-foreground">{phrase}</Text>
                  </Pressable>
                ))}
                {availability?.photos && !draft.trim() ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onGo('/nutrition/photo')}
                    className="h-11 flex-row items-center gap-2 rounded-full bg-muted px-4"
                  >
                    <Icon name="camera" size={16} color={colors.faintForeground} />
                    <Text className="text-b2 text-foreground">Foto do prato</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
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
                  onPress={() => onGo('/nutrition/photo')}
                  className="h-11 w-11 items-center justify-center rounded-full"
                >
                  <Icon name="camera" size={20} color={colors.mutedForeground} />
                </Pressable>
              ) : (
                <View className="w-3" />
              )}
              <DrawerTextInput
                accessibilityLabel="Pergunte ou registre com a IA"
                placeholder="Comi, treinei… ou pergunte"
                placeholderTextColor={colors.placeholder}
                value={draft}
                onChangeText={setDraft}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                returnKeyType="send"
                onSubmitEditing={() => send(draft)}
                className="h-12 flex-1 text-base text-foreground"
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
    </DrawerScrollView>
  );
}
