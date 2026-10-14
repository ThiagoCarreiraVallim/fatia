import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Apple,
  Droplet,
  Dumbbell,
  Footprints,
  Plus,
  Scale,
  type LucideIcon,
} from 'lucide-react-native';
import {
  QUICK_ADD_ITEMS,
  mealTypeForTime,
  showQuickAdd,
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

/** Altura da `BottomNav` sem o inset: o "+" flutua logo acima dela. */
const ALTURA_DA_NAV = 80;

const ICONE: Record<QuickAddKey, LucideIcon> = {
  meal: Apple,
  water: Droplet,
  weight: Scale,
  steps: Footprints,
  workout: Dumbbell,
};

type Alvo = 'water' | 'weight' | 'steps' | { refeicao: { dia: string; tipo: MealType } };

/**
 * Réplica de `apps/web/src/components/layout/quick-add.tsx`: o "+" global, com
 * o mesmo menu e as mesmas regras (vêm de `@fatia/api-client`).
 *
 * Recebe a `BottomNav` como filho para acertar a ordem de pintura sem portal:
 * o botão vem **antes** da nav (os drawers das telas o cobrem do mesmo jeito
 * que cobrem a nav) e a camada dos drawers dele vem **depois** (abrem por cima
 * da nav, como os das telas).
 */
export function RegistroRapido({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [menuAberto, setMenuAberto] = useState(false);
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  // Mesma chave da tela de Treino: o menu e a tela concordam sobre a sessão aberta.
  const ativa = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
    enabled: menuAberto,
  });
  const sessaoAberta = ativa.data ?? null;

  const irParaSessao = (sessao: WorkoutSession) => {
    setMenuAberto(false);
    router.push(`/workout/session/${sessao.id}`);
  };

  const comecar = useMutation({
    mutationFn: () => workoutApi.startSession({ startedAt: new Date().toISOString() }),
    onSuccess: (sessao) => {
      qc.setQueryData(['workout', 'active'], sessao);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      irParaSessao(sessao);
    },
  });

  const escolher = (chave: QuickAddKey) => {
    if (chave === 'workout') {
      // Retoma a sessão aberta: a API criaria outra a cada toque.
      if (sessaoAberta) irParaSessao(sessaoAberta);
      else comecar.mutate();
      return;
    }
    setMenuAberto(false);
    setAlvo(
      chave === 'meal'
        ? { refeicao: { dia: hojeIso(), tipo: mealTypeForTime(new Date()) } }
        : chave,
    );
  };

  const fechar = () => setAlvo(null);
  const refeicao = typeof alvo === 'object' && alvo !== null ? alvo.refeicao : null;

  return (
    <>
      {showQuickAdd(pathname) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Registrar"
          onPress={() => setMenuAberto(true)}
          style={{ bottom: ALTURA_DA_NAV + insets.bottom + 16, zIndex: 40, elevation: 6 }}
          className="absolute right-4 h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <Plus size={28} strokeWidth={2.5} color="#131313" />
        </Pressable>
      ) : null}

      {children}

      <DrawerLayer>
        <Drawer open={menuAberto} onOpenChange={setMenuAberto}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Registrar</DrawerTitle>
              <DrawerDescription>O que você quer registrar agora?</DrawerDescription>
            </DrawerHeader>
            <View className="flex-row flex-wrap gap-3 px-4 pb-6 pt-2">
              {QUICK_ADD_ITEMS.map(({ key, label }) => {
                const Icone = ICONE[key];
                const texto = key === 'workout' ? workoutQuickLabel(Boolean(sessaoAberta)) : label;
                const ocupado = key === 'workout' && (comecar.isPending || ativa.isLoading);
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={texto}
                    accessibilityState={{ disabled: ocupado }}
                    disabled={ocupado}
                    onPress={() => escolher(key)}
                    className="min-h-24 w-[31%] items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 py-4 active:opacity-80"
                    style={ocupado ? { opacity: 0.6 } : undefined}
                  >
                    <Icone size={24} color="#2ce500" />
                    <Text className="text-center text-[13px] font-semibold text-foreground">
                      {texto}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {comecar.error ? (
              <Text accessibilityRole="alert" className="px-4 pb-4 text-sm text-rose-500">
                Não deu para começar o treino. Tente de novo.
              </Text>
            ) : null}
          </DrawerContent>
        </Drawer>

        {refeicao ? (
          <FoodSearchDrawer
            open
            onOpenChange={(aberto) => !aberto && fechar()}
            date={refeicao.dia}
            mealType={refeicao.tipo}
          />
        ) : null}
        <LogWaterDrawer open={alvo === 'water'} onClose={fechar} />
        <LogWeightDrawer open={alvo === 'weight'} onClose={fechar} />
        <LogStepsDrawer open={alvo === 'steps'} onClose={fechar} />
      </DrawerLayer>
    </>
  );
}
