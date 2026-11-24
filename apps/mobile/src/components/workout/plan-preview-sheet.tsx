import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { exerciseDetailPath, planPreview, workoutApi } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerLayer,
  DrawerScrollView,
  DrawerTitle,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { MuscleDiagram } from './muscle-diagram';
import { ExerciseGroupLine, ExerciseThumb } from './plan-exercise-row';
import { useStartSession } from './use-start-session';

/**
 * A prévia do treino antes de começar (#484): exercícios com séries e
 * repetições, músculos, equipamento, duração estimada, o "como fazer" de cada
 * exercício e o botão de começar.
 *
 * Mora no layout do app, numa `DrawerLayer` própria, como o `ConfirmProvider`:
 * quem pede a prévia (um card no meio de um carrossel, a linha da agenda) não
 * tem onde montar uma folha, então só chama `usePlanPreview().start(planId)`.
 */

interface PreviewRequest {
  planId: string;
}

const PlanPreviewContext = createContext<{ start: (planId: string) => void } | null>(null);

export function PlanPreviewProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PreviewRequest | null>(null);
  const [value] = useState(() => ({ start: (planId: string) => setRequest({ planId }) }));
  return (
    <PlanPreviewContext.Provider value={value}>
      {children}
      <DrawerLayer>
        <PlanPreviewSheet
          planId={request?.planId ?? null}
          onOpenChange={(open) => {
            if (!open) setRequest(null);
          }}
        />
      </DrawerLayer>
    </PlanPreviewContext.Provider>
  );
}

/**
 * `start(planId)` abre a prévia; o "Começar" dela inicia a sessão. Fora do
 * provider (não deveria acontecer), começa direto, como antes.
 */
export function usePlanPreview(): { start: (planId: string) => void; isPending: boolean } {
  const context = useContext(PlanPreviewContext);
  const direct = useStartSession();
  const start = useCallback(
    (planId: string) => {
      if (context) context.start(planId);
      else direct.mutate({ planId });
    },
    [context, direct],
  );
  return { start, isPending: direct.isPending };
}

function PlanPreviewSheet({
  planId,
  onOpenChange,
}: {
  planId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const start = useStartSession();
  const plan = useQuery({
    queryKey: ['workout', 'plan', planId],
    queryFn: () => workoutApi.getPlan(planId!),
    enabled: planId != null,
  });
  const preview = plan.data ? planPreview(plan.data) : null;

  return (
    <Drawer open={planId != null} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <DrawerHeader>
        <DrawerTitle className="font-display text-[22px] leading-7">
          {plan.data?.name ?? 'Treino'}
        </DrawerTitle>
        <DrawerDescription>{preview?.info ?? ' '}</DrawerDescription>
      </DrawerHeader>

      {plan.isLoading ? <LoadingState label="Carregando o treino…" /> : null}
      {plan.isError ? <ErrorState error={plan.error} onRetry={() => void plan.refetch()} /> : null}

      {preview ? (
        <>
          <DrawerScrollView
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-4 px-4 pb-4"
          >
            <View className="flex-row items-center gap-4 rounded-card bg-card p-4">
              <MuscleDiagram
                primaryMuscles={preview.primaryMuscles}
                secondaryMuscles={preview.secondaryMuscles}
                width={56}
              />
              <View className="min-w-0 flex-1 gap-1.5">
                <Text className="font-sans-bold text-[13px] text-muted-foreground">
                  Equipamento
                </Text>
                <Text className="text-sm text-foreground">
                  {preview.equipment.length ? preview.equipment.join(', ') : 'Sem equipamento'}
                </Text>
              </View>
            </View>

            <View className="rounded-card bg-card px-4">
              {preview.exercises.map((e, i) => (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.name}, ${e.summary}. Ver como fazer`}
                  onPress={() => {
                    // A folha fecha antes: o "Como fazer" é uma tela.
                    onOpenChange(false);
                    router.push(exerciseDetailPath(e.exerciseId) as never);
                  }}
                  className={
                    i > 0
                      ? 'min-h-[64px] flex-row items-center gap-3 border-t border-border py-2.5 active:opacity-80'
                      : 'min-h-[64px] flex-row items-center gap-3 py-2.5 active:opacity-80'
                  }
                >
                  <ExerciseThumb group={e.group} size={44} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text numberOfLines={2} className="font-sans-bold text-sm text-foreground">
                      {e.name}
                    </Text>
                    <ExerciseGroupLine group={e.group} detail="como fazer" />
                  </View>
                  <Text className="font-sans-bold text-sm text-foreground">{e.summary}</Text>
                  <ChevronRight size={16} color={colors.faintForeground} />
                </Pressable>
              ))}
            </View>
          </DrawerScrollView>
          <View style={{ paddingBottom: insets.bottom + 16 }}>
            <DrawerFooter className="pt-3">
              <Button
                loading={start.isPending}
                onPress={() => {
                  if (!planId) return;
                  start.mutate({ planId }, { onSettled: () => onOpenChange(false) });
                }}
              >
                Começar
              </Button>
            </DrawerFooter>
          </View>
        </>
      ) : null}
    </Drawer>
  );
}
