'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Apple, Dumbbell, Droplet, Footprints, Plus, Scale, type LucideIcon } from 'lucide-react';
import {
  QUICK_ADD_ITEMS,
  mealTypeForTime,
  showQuickAdd,
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

const ICON: Record<QuickAddKey, LucideIcon> = {
  meal: Apple,
  water: Droplet,
  weight: Scale,
  steps: Footprints,
  workout: Dumbbell,
};

type Target = 'water' | 'weight' | 'steps' | { meal: { date: string; mealType: MealType } };

/**
 * O "+" global: qualquer registro a um toque, de qualquer tela. Sem IA no
 * plano Free, é o caminho mais curto para registrar.
 *
 * O menu só escolhe; quem registra são os drawers de sempre, os mesmos da
 * Nutrição e do dashboard.
 */
export function QuickAdd() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);

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

  if (!showQuickAdd(pathname)) return null;

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
    <>
      {/*
        Respiro para o último card não ficar embaixo do "+". Mora aqui, e não no
        `pb-*` do `<main>`, porque o chat calcula a altura a partir daquele padding
        (`chat-cabe-na-tela.test.ts`) — e no chat o "+" não aparece.
      */}
      <div aria-hidden className="h-8 shrink-0" />
      <button
        type="button"
        aria-label="Registrar"
        onClick={() => setMenuOpen(true)}
        className="fixed right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>Registrar</DrawerTitle>
            <DrawerDescription>O que você quer registrar agora?</DrawerDescription>
          </DrawerHeader>
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
                    className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-card px-2 py-4 text-center text-[13px] font-semibold text-foreground transition-colors hover:bg-card/80 disabled:opacity-60"
                  >
                    <Icon size={24} className="text-primary" />
                    {text}
                  </button>
                </li>
              );
            })}
          </ul>
          {start.error && (
            <p role="alert" className="mt-3 text-sm text-rose-500">
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
    </>
  );
}
