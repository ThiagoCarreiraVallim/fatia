import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
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
  FormMessage,
  LoadingState,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { MuscleDiagram } from './muscle-diagram';
import { ExerciseGroupLine, ExerciseThumb } from './plan-exercise-row';
import { useStartSession } from './use-start-session';
import { startSessionErrorMessage } from './start-session-handlers';
import { previewAfterNavigation, type PreviewRequest } from './plan-preview-return';

/**
 * A prévia do treino antes de começar (#484): exercícios com séries e
 * repetições, músculos, equipamento, duração estimada, o "como fazer" de cada
 * exercício e o botão de começar.
 *
 * Mora no layout do app, numa `DrawerLayer` própria, como o `ConfirmProvider`:
 * quem pede a prévia (um card no meio de um carrossel, a linha da agenda) não
 * tem onde montar uma folha, então só chama `usePlanPreview().start(planId)`.
 */

const PlanPreviewContext = createContext<{ start: (planId: string) => void } | null>(null);

export function PlanPreviewProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [request, setRequest] = useState<PreviewRequest | null>(null);
  const [value] = useState(() => ({ start: (planId: string) => setRequest({ planId }) }));

  // Ajuste durante o render, e não num efeito (#187): a prévia que saiu para o
  // "Como fazer" reabre quando a pessoa volta para a tela de origem.
  const next = previewAfterNavigation(request, pathname);
  if (next !== request) setRequest(next);

  return (
    <PlanPreviewContext.Provider value={value}>
      {children}
      <DrawerLayer>
        <PlanPreviewSheet
          planId={request && !request.away ? request.planId : null}
          onOpenChange={(open) => {
            if (!open) setRequest(null);
          }}
          onShowExercise={(exerciseId) => {
            const to = exerciseDetailPath(exerciseId);
            // A folha sai da frente (ela fica por cima de todas as telas) e
            // volta junto com a pessoa.
            setRequest(
              (r) => r && { planId: r.planId, away: { from: pathname, to, arrived: false } },
            );
            router.push(to as never);
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
  onShowExercise,
}: {
  planId: string | null;
  onOpenChange: (open: boolean) => void;
  onShowExercise: (exerciseId: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const start = useStartSession();
  const plan = useQuery({
    queryKey: ['workout', 'plan', planId],
    queryFn: () => workoutApi.getPlan(planId!),
    enabled: planId != null,
  });
  const preview = plan.data ? planPreview(plan.data) : null;
  const empty = preview != null && preview.exercises.length === 0;
  // Erro que não é o 409 da sessão já aberta fica na folha, que não fecha (#484).
  const startError = startSessionErrorMessage(start.error);

  // Cada abertura começa sem o erro da anterior.
  const resetStart = start.reset;
  useEffect(() => {
    if (planId) resetStart();
  }, [planId, resetStart]);

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

            <View className={empty ? 'hidden' : 'rounded-card bg-card px-4'}>
              {preview.exercises.map((e, i) => (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.name}, ${e.summary}. Ver como fazer`}
                  onPress={() => onShowExercise(e.exerciseId)}
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
              {empty ? (
                <Text className="text-center text-sm text-muted-foreground">
                  Este plano ainda não tem exercícios. Adicione pelo menos um para começar.
                </Text>
              ) : null}
              {startError ? <FormMessage>{startError}</FormMessage> : null}
              <Button
                loading={start.isPending}
                disabled={empty}
                onPress={() => {
                  if (!planId || empty) return;
                  // Fecha quando a sessão abre, ou quando o 409 leva à que já
                  // estava aberta; outro erro fica na folha, com a mensagem.
                  start.mutate(
                    { planId },
                    {
                      onSuccess: () => onOpenChange(false),
                      onError: (error) => {
                        if (!startSessionErrorMessage(error)) onOpenChange(false);
                      },
                    },
                  );
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
