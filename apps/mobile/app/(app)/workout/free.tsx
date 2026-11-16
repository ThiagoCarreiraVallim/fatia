import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Dumbbell, Play, Search, Star, X } from 'lucide-react-native';
import {
  activeSessionIdFromError,
  addToFreeWorkout,
  freeStartLabel,
  freeSuggestions,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Text } from '@/components/ui/text';
import { cn, useToast } from '@/components/ui';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { ExerciseGroupLine, ExerciseThumb } from '@/components/workout/plan-exercise-row';
import { useStartSession } from '@/components/workout/use-start-session';
import { groupColorName } from '@/components/workout/workout-home';
import { colors } from '@/theme/colors';

/** Quantos sugeridos aparecem embaixo da busca (a prancha mostra uma linha e meia). */
const SUGGESTIONS = 8;

/**
 * Réplica de `apps/web/src/app/(app)/workout/free/page.tsx` (prancha
 * `Al-T17b`, #381): "Treino atual · livre", vazio, para montar na hora. Nada
 * começa até o "Iniciar treino": o relógio da sessão só anda dali em diante.
 *
 * `?add=cardio` é o "Só cardio" da aba Treino: abre o Adicionar exercício já
 * no filtro Cardio. Cardio é exercício, não tipo de treino.
 */
export default function FreeWorkoutScreen() {
  const { add: addParam } = useLocalSearchParams<{ add?: string }>();
  const toast = useToast();
  const start = useStartSession();
  const [picked, setPicked] = useState<Exercise[]>([]);
  const [addOpen, setAddOpen] = useState(addParam === 'cardio');
  // O filtro Cardio vale só na primeira vez que a busca abre.
  const [cardioFirst, setCardioFirst] = useState(addParam === 'cardio');

  const suggestions = useQuery({
    queryKey: ['workout', 'exercises', 'suggested'],
    queryFn: () => workoutApi.searchExercises(undefined, undefined, { limit: SUGGESTIONS + 4 }),
  });
  const suggested = freeSuggestions(suggestions.data, picked, SUGGESTIONS);
  const canStart = picked.length > 0 && !start.isPending;

  function add(exercises: Exercise[]) {
    const next = addToFreeWorkout(picked, exercises);
    if (!next.message) return;
    setPicked(next.picked);
    toast.show({ message: next.message });
  }

  return (
    <>
      <Screen
        actions={
          <View className="rounded-pill bg-muted px-2.5 py-1">
            <Text className="font-sans-bold text-[11px] uppercase tracking-wide text-muted-foreground">
              livre
            </Text>
          </View>
        }
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canStart }}
            disabled={!canStart}
            onPress={() =>
              start.mutate({
                planId: null,
                pending: picked.map((e) => ({
                  id: e.id,
                  name: e.name,
                  muscleGroup: e.muscleGroup,
                })),
              })
            }
            className={cn(
              'h-14 flex-1 flex-row items-center justify-center gap-2 rounded-pill active:opacity-80',
              picked.length > 0 ? 'bg-primary' : 'bg-card',
            )}
          >
            <Play
              size={16}
              color={picked.length > 0 ? colors.primaryForeground : colors.faintForeground}
            />
            <Text
              className={cn(
                'font-sans-bold text-[15px]',
                picked.length > 0 ? 'text-primary-foreground' : 'text-faint',
              )}
            >
              {start.isPending ? 'Iniciando...' : freeStartLabel(picked.length)}
            </Text>
          </Pressable>
        }
      >
        <View className="gap-4 px-4 pt-2">
          <View className="gap-1 px-1">
            <Text
              accessibilityRole="header"
              className="font-display text-[26px] tracking-tight text-foreground"
            >
              Treino livre
            </Text>
            <Text className="text-sm text-muted-foreground">
              Monte na hora. O relógio começa quando você iniciar.
            </Text>
          </View>

          {picked.length === 0 ? (
            <View
              style={{ borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: 'dashed' }}
              className="items-center gap-2 rounded-card px-4 py-7"
            >
              <View className="h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primary/15">
                <Dumbbell size={24} color={colors.primaryText} />
              </View>
              <Text className="font-sans-bold text-foreground">Adicione o primeiro exercício</Text>
              <Text className="text-center text-sm text-muted-foreground">
                Busque ou toque num dos sugeridos abaixo
              </Text>
            </View>
          ) : (
            <View accessibilityLabel="Exercícios do treino" className="rounded-card bg-card px-4">
              {picked.map((e, i) => (
                <View
                  key={e.id}
                  className={cn(
                    'min-h-[68px] flex-row items-center gap-3',
                    i > 0 && 'border-t border-border',
                  )}
                >
                  <ExerciseThumb group={e.muscleGroup} size={40} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="font-sans-semibold text-[15px] text-foreground">{e.name}</Text>
                    <ExerciseGroupLine group={e.muscleGroup} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${e.name}`}
                    onPress={() => setPicked((prev) => prev.filter((p) => p.id !== e.id))}
                    className="h-11 w-11 items-center justify-center rounded-full"
                  >
                    <X size={16} color={colors.faintForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => setAddOpen(true)}
            className="min-h-[52px] flex-row items-center justify-center gap-2 rounded-card bg-card active:opacity-80"
          >
            <Search size={16} color={colors.foreground} />
            <Text className="font-sans-bold text-sm text-foreground">Buscar exercício</Text>
          </Pressable>

          {suggested.length > 0 ? (
            <View className="gap-2">
              <View className="flex-row items-baseline justify-between px-1">
                <Text accessibilityRole="header" className="text-xs text-muted-foreground">
                  Sugeridos
                </Text>
                <Text className="text-xs text-muted-foreground">favoritos primeiro</Text>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {suggested.map((e) => (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Adicionar ${e.name}${e.favorite ? ' (favorito)' : ''}`}
                    onPress={() => add([e])}
                    className="h-[38px] flex-row items-center gap-1.5 rounded-pill bg-card px-3.5 active:opacity-80"
                  >
                    {e.favorite ? (
                      <Star size={14} color={colors.steps} fill={colors.steps} />
                    ) : (
                      <View
                        className="h-2 w-2 rounded-[2px]"
                        style={{ backgroundColor: colors[groupColorName(e.muscleGroup)] }}
                      />
                    )}
                    <Text className="font-sans-semibold text-sm text-foreground">{e.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* O 409 (já havia um treino aberto) não é erro: o hook leva a ele. */}
          {start.isError && !activeSessionIdFromError(start.error) ? (
            <Text accessibilityRole="alert" className="text-sm text-danger">
              Não foi possível iniciar o treino. Tente de novo.
            </Text>
          ) : null}
        </View>
      </Screen>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setCardioFirst(false);
        }}
        initialTab={cardioFirst ? 'cardio' : undefined}
        existingExerciseIds={new Set(picked.map((e) => e.id))}
        onAddMany={add}
      />
    </>
  );
}
