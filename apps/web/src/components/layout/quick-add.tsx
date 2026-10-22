'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Apple, Dumbbell, Droplet, Footprints, Scale, type LucideIcon } from 'lucide-react';
import {
  QUICK_ADD_ITEMS,
  mealTypeForTime,
  workoutApi,
  workoutQuickLabel,
  type MealType,
  type QuickAddKey,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';
import { LogWaterDrawer } from '@/components/progress/log-water-drawer';
import { LogWeightDrawer } from '@/components/progress/log-weight-drawer';
import { hojeIso } from '@/lib/dias';
import { ChatHero, useChatMenuItem } from './chat-hero';

const ICON: Record<QuickAddKey, LucideIcon> = {
  meal: Apple,
  water: Droplet,
  weight: Scale,
  steps: Footprints,
  workout: Dumbbell,
};

type Target = 'water' | 'weight' | 'steps' | { meal: { date: string; mealType: MealType } };

const QuickAddContext = createContext<{ open: () => void }>({ open: () => undefined });

/** Abre o menu Registrar. Quem chama é o "+" da barra de baixo e o da barra lateral. */
export function useQuickAdd() {
  return useContext(QuickAddContext);
}

/**
 * O menu Registrar: qualquer registro a um toque, de qualquer tela. Sem IA no
 * plano Free, é o caminho mais curto para registrar.
 *
 * O menu só escolhe; quem registra são os drawers de sempre, os mesmos da
 * Nutrição e do dashboard. O gatilho mora na navegação (`useQuickAdd`).
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const chatItem = useChatMenuItem();

  // Mesma chave e mesmas opções da tela de Treino: o menu e a tela concordam
  // sobre haver sessão aberta.
  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
    enabled: menuOpen,
  });
  const hasActive = Boolean(active.data);

  const start = useMutation({
    mutationFn: () => workoutApi.startSession({ startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.setQueryData(['workout', 'active'], session);
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      setMenuOpen(false);
      router.push('/workout');
    },
  });

  const choose = (key: QuickAddKey) => {
    if (key === 'workout') {
      // Retoma a sessão aberta: a API criaria outra a cada toque.
      if (hasActive) {
        setMenuOpen(false);
        router.push('/workout');
      } else {
        start.mutate();
      }
      return;
    }
    setMenuOpen(false);
    setTarget(
      key === 'meal' ? { meal: { date: hojeIso(), mealType: mealTypeForTime(new Date()) } } : key,
    );
  };

  const close = () => setTarget(null);
  const meal = typeof target === 'object' && target !== null ? target.meal : null;

  return (
    <QuickAddContext.Provider value={{ open: () => setMenuOpen(true) }}>
      {children}

      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>Registrar</DrawerTitle>
            <DrawerDescription>O que você quer registrar agora?</DrawerDescription>
          </DrawerHeader>
          {/* O chat registra qualquer coisa conversando: é o atalho mais largo do
              "+", e por isso vem em cima dos botões de um registro só. */}
          {chatItem && (
            <ChatHero item={chatItem} onNavigate={() => setMenuOpen(false)} className="mt-2 mb-1" />
          )}
          <ul className="mt-2 grid grid-cols-3 gap-3">
            {QUICK_ADD_ITEMS.map(({ key, label }) => {
              const Icon = ICON[key];
              const text = key === 'workout' ? workoutQuickLabel(hasActive) : label;
              const busy = key === 'workout' && (start.isPending || active.isLoading);
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => choose(key)}
                    className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-subtle bg-card px-2 py-4 text-center text-[13px] font-semibold text-foreground transition-colors hover:bg-card/80 disabled:opacity-60"
                  >
                    <Icon size={24} className="text-primary" />
                    {text}
                  </button>
                </li>
              );
            })}
          </ul>
          {start.error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              Não deu para começar o treino. Tente de novo.
            </p>
          )}
        </DrawerContent>
      </Drawer>

      {meal && (
        <FoodSearchDrawer
          open
          onOpenChange={(open) => !open && close()}
          date={meal.date}
          mealType={meal.mealType}
        />
      )}
      <LogWaterDrawer open={target === 'water'} onClose={close} />
      <LogWeightDrawer open={target === 'weight'} onClose={close} />
      <LogStepsDrawer open={target === 'steps'} onClose={close} />
    </QuickAddContext.Provider>
  );
}
