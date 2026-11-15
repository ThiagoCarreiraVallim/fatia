import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Layers, Plus, X } from 'lucide-react-native';
import {
  DEFAULT_PLAN_LINE,
  isCardioExercise,
  planDraftSummary,
  planExerciseSummary,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { cn } from '@/components/ui';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { ExerciseGroupLine, ExerciseThumb } from '@/components/workout/plan-exercise-row';
import { colors } from '@/theme/colors';

/** Réplica de `apps/web/src/app/(app)/workout/plans/new/page.tsx` (Al-T19, #378). */

export default function NewPlanScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Exercise[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  // Se o lote falhar depois do plano criado, tentar de novo não cria outro.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const id = createdId ?? (await workoutApi.createPlan({ name: name.trim() })).id;
      setCreatedId(id);
      if (picked.length > 0) {
        await workoutApi.addPlanExercises(
          id,
          picked.map((e) => e.id),
        );
      }
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.replace(`/workout/plans/${id}`);
    },
  });

  const lines = picked.map((e) => {
    const cardio = isCardioExercise(e);
    return {
      exercise: e,
      ...DEFAULT_PLAN_LINE,
      targetSets: cardio ? 1 : DEFAULT_PLAN_LINE.targetSets,
      targetReps: cardio ? '' : DEFAULT_PLAN_LINE.targetReps,
    };
  });
  const canCreate = name.trim().length > 0 && picked.length > 0;

  return (
    <>
      <Screen
        title="Novo plano"
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCreate || create.isPending }}
            disabled={!canCreate || create.isPending}
            onPress={() => canCreate && !create.isPending && create.mutate()}
            className={cn(
              'h-14 flex-1 items-center justify-center rounded-pill active:opacity-80',
              canCreate ? 'bg-primary' : 'bg-card',
            )}
          >
            <Text
              className={cn(
                'font-sans-bold text-[15px]',
                canCreate ? 'text-primary-foreground' : 'text-faint',
              )}
            >
              {create.isPending ? 'Criando...' : 'Criar plano'}
            </Text>
          </Pressable>
        }
      >
        <View className="gap-4 px-4 pt-2">
          <View className="gap-2">
            <Text className="px-1 text-xs text-faint">Nome do plano</Text>
            <TextInput
              autoFocus
              value={name}
              maxLength={80}
              onChangeText={setName}
              accessibilityLabel="Nome do plano"
              placeholder="Ex.: Costas e bíceps"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              className="h-14 rounded-2xl bg-card px-4 font-sans-bold text-lg text-foreground"
            />
          </View>

          <View className="gap-2">
            <View className="flex-row items-baseline justify-between px-1">
              <Text className="text-xs text-faint">Exercícios</Text>
              <Text className="text-xs text-faint">{planDraftSummary(lines)}</Text>
            </View>

            <View className="rounded-card bg-card px-4">
              {lines.length === 0 ? (
                <View className="items-center gap-1.5 py-6">
                  <Text className="font-sans-bold text-foreground">Nenhum exercício ainda</Text>
                  <Text className="text-xs text-faint">Adicione na ordem em que vai fazer</Text>
                </View>
              ) : null}
              {lines.map((l, i) => (
                <View
                  key={`${l.exercise.id}-${i}`}
                  className={cn(
                    'min-h-[72px] flex-row items-center gap-3',
                    i > 0 && 'border-t border-border',
                  )}
                >
                  <ExerciseThumb group={l.exercise.muscleGroup} size={48} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="font-sans-semibold text-[15px] text-foreground">
                      {l.exercise.name}
                    </Text>
                    <ExerciseGroupLine
                      group={l.exercise.muscleGroup}
                      detail={l.targetReps ? planExerciseSummary(l) : null}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${l.exercise.name}`}
                    onPress={() => setPicked((prev) => prev.filter((_, k) => k !== i))}
                    className="h-11 w-11 items-center justify-center rounded-full"
                  >
                    <X size={16} color={colors.faintForeground} />
                  </Pressable>
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => setAddOpen(true)}
                className="min-h-14 flex-row items-center gap-2 border-t border-border active:opacity-80"
              >
                <Plus size={16} color={colors.primaryText} />
                <Text className="font-sans-bold text-sm text-primary">Adicionar exercício</Text>
              </Pressable>
            </View>
            {/* Desvio do Al-T19: séries e descanso se ajustam no plano criado. */}
            <Text className="px-1 text-xs text-faint">
              Depois de criar, toque no exercício para definir séries, repetições e descanso.
            </Text>
          </View>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Começar de um modelo, planos prontos das suas comunidades"
            onPress={() => router.push('/community')}
            style={{ borderWidth: 1.5, borderColor: colors.borderStrong }}
            className="flex-row items-center gap-3 rounded-card px-4 py-3.5 active:opacity-80"
          >
            <Layers size={20} color={colors.mutedForeground} />
            <View className="min-w-0 flex-1">
              <Text className="font-sans-bold text-sm text-foreground">Começar de um modelo</Text>
              <Text className="text-xs text-faint">planos prontos das suas comunidades</Text>
            </View>
            <ChevronRight size={16} color={colors.faintForeground} />
          </Pressable>

          {create.isError ? (
            <Text accessibilityRole="alert" className="text-sm text-danger">
              Não foi possível criar o plano.{' '}
              {create.error instanceof Error ? create.error.message : 'Tente de novo.'}
            </Text>
          ) : null}
        </View>
      </Screen>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planName={name.trim() || undefined}
        existingExerciseIds={new Set(picked.map((e) => e.id))}
        onAddMany={(chosen) => setPicked((prev) => [...prev, ...chosen])}
      />
    </>
  );
}
