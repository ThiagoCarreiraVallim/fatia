import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Apple, Droplet, Dumbbell, Footprints, Scale, type LucideIcon } from 'lucide-react-native';
import {
  QUICK_ADD_ITEMS,
  mealTypeForTime,
  workoutApi,
  workoutQuickLabel,
  type MealType,
  type QuickAddKey,
  type WorkoutSession,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerLayer,
  DrawerTitle,
} from '@/components/ui';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { hojeIso } from '@/components/nutrition/helpers';
import { LogStepsDrawer, LogWaterDrawer, LogWeightDrawer } from '@/components/progress';
import { ChatHero, useChatMenuItem } from './chat-hero';
import { cores } from '@/theme/cores';

const ICON: Record<QuickAddKey, LucideIcon> = {
  meal: Apple,
  water: Droplet,
  weight: Scale,
  steps: Footprints,
  workout: Dumbbell,
};

type Target = 'water' | 'weight' | 'steps' | { meal: { day: string; type: MealType } };

const QuickAddContext = createContext<{ open: () => void }>({ open: () => undefined });

/** Abre o menu Registrar. Quem chama é o "+" do centro da `BottomNav`. */
export function useQuickAdd() {
  return useContext(QuickAddContext);
}

/**
 * Réplica de `apps/web/src/components/layout/quick-add.tsx`: o menu Registrar,
 * com as mesmas regras (vêm de `@fatia/api-client`). O gatilho é o "+" da
 * barra, que recebe `open` pelo contexto.
 *
 * Recebe a `BottomNav` como filho para acertar a ordem de pintura sem portal:
 * a camada dos drawers vem **depois** da nav e abre por cima dela, como os
 * drawers das telas.
 */
export function QuickAdd({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const chatItem = useChatMenuItem();
  const [target, setTarget] = useState<Target | null>(null);

  // Mesma key da tela de Treino: o menu e a tela concordam sobre a sessão aberta.
  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
    enabled: menuOpen,
  });
  const openSession = active.data ?? null;

  const goToSession = (session: WorkoutSession) => {
    setMenuOpen(false);
    router.push(`/workout/session/${session.id}`);
  };

  const start = useMutation({
    mutationFn: () => workoutApi.startSession({ startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      goToSession(session);
    },
  });

  const choose = (key: QuickAddKey) => {
    if (key === 'workout') {
      // Retoma a sessão aberta: a API criaria outra a cada toque.
      if (openSession) goToSession(openSession);
      else start.mutate();
      return;
    }
    setMenuOpen(false);
    setTarget(
      key === 'meal' ? { meal: { day: hojeIso(), type: mealTypeForTime(new Date()) } } : key,
    );
  };

  const close = () => setTarget(null);
  const meal = typeof target === 'object' && target !== null ? target.meal : null;

  return (
    <QuickAddContext.Provider value={{ open: () => setMenuOpen(true) }}>
      {children}

      <DrawerLayer>
        <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Registrar</DrawerTitle>
              <DrawerDescription>O que você quer registrar agora?</DrawerDescription>
            </DrawerHeader>
            {/* O chat registra qualquer coisa conversando: é o atalho mais largo do
                "+", e por isso vem em cima dos botões de um registro só. */}
            {chatItem ? (
              <View className="pt-2">
                <ChatHero
                  item={chatItem}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push(chatItem.href as never);
                  }}
                />
              </View>
            ) : null}
            <View className="flex-row flex-wrap gap-3 px-4 pb-6 pt-2">
              {QUICK_ADD_ITEMS.map(({ key, label }) => {
                const Icon = ICON[key];
                const text = key === 'workout' ? workoutQuickLabel(Boolean(openSession)) : label;
                const busy = key === 'workout' && (start.isPending || active.isLoading);
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={text}
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() => choose(key)}
                    className="min-h-24 w-[31%] items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 py-4 active:opacity-80"
                    style={busy ? { opacity: 0.6 } : undefined}
                  >
                    <Icon size={24} color={cores.primary} />
                    <Text className="text-center text-[13px] font-semibold text-foreground">
                      {text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {start.error ? (
              <Text accessibilityRole="alert" className="px-4 pb-4 text-sm text-rose-500">
                Não deu para começar o treino. Tente de novo.
              </Text>
            ) : null}
          </DrawerContent>
        </Drawer>

        {meal ? (
          <FoodSearchDrawer
            open
            onOpenChange={(isOpen) => !isOpen && close()}
            date={meal.day}
            mealType={meal.type}
          />
        ) : null}
        <LogWaterDrawer open={target === 'water'} onClose={close} />
        <LogWeightDrawer open={target === 'weight'} onClose={close} />
        <LogStepsDrawer open={target === 'steps'} onClose={close} />
      </DrawerLayer>
    </QuickAddContext.Provider>
  );
}
