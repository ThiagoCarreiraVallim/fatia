import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus, Users, X } from 'lucide-react-native';
import {
  DEFAULT_PLAN_LINE,
  estimatePlanMinutes,
  isCardioExercise,
  muscleGroupName,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, Input } from '@/components/ui';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
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
  const totalSets = lines.reduce((acc, l) => acc + l.targetSets, 0);
  const canCreate = name.trim().length > 0 && picked.length > 0;

  return (
    <>
      <Screen title="Novo plano">
        <View className="gap-5 px-5 pb-4 pt-4">
          <View className="gap-1.5">
            <Text className="text-sm font-bold text-foreground">Nome do plano</Text>
            <Input
              autoFocus
              value={name}
              maxLength={80}
              onChangeText={setName}
              accessibilityLabel="Nome do plano"
              placeholder="Ex.: Costas e bíceps"
              returnKeyType="done"
            />
          </View>

          <View className="gap-2">
            <View className="flex-row items-baseline justify-between">
              <Text accessibilityRole="header" className="text-base font-extrabold text-foreground">
                Exercícios
              </Text>
              {lines.length > 0 ? (
                <Text className="text-xs text-muted-foreground">
                  {lines.length} · {totalSets} séries · ~{estimatePlanMinutes(lines)} min
                </Text>
              ) : null}
            </View>

            {lines.length === 0 ? (
              <View className="items-center rounded-2xl border border-dashed border-border px-4 py-6">
                <Text className="text-sm font-semibold text-foreground">
                  Nenhum exercício ainda
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Adicione na ordem em que vai fazer
                </Text>
              </View>
            ) : (
              <View className="rounded-2xl border border-border bg-card">
                {lines.map((l, i) => (
                  <View
                    key={`${l.exercise.id}-${i}`}
                    className={`flex-row items-center gap-3 px-4 py-2 ${i ? 'border-t border-border' : ''}`}
                  >
                    <Text className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</Text>
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                        {l.exercise.name}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {muscleGroupName(l.exercise.muscleGroup)}
                        {l.targetReps
                          ? ` · ${l.targetSets} × ${l.targetReps.replace('-', '–')}`
                          : ''}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remover ${l.exercise.name}`}
                      onPress={() => setPicked((prev) => prev.filter((_, k) => k !== i))}
                      className="h-11 w-11 items-center justify-center rounded-full"
                    >
                      <X size={16} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Button variant="outline" className="rounded-2xl" onPress={() => setAddOpen(true)}>
              <Plus size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground">Adicionar exercício</Text>
            </Button>
            <Text className="text-xs text-muted-foreground">
              Depois de criar, toque no exercício para definir séries, repetições e descanso.
            </Text>
          </View>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Começar de um modelo, planos prontos das suas comunidades"
            onPress={() => router.push('/community')}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-field bg-muted">
              <Users size={18} color={colors.primaryText} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-foreground">Começar de um modelo</Text>
              <Text className="text-xs text-muted-foreground">
                planos prontos das suas comunidades
              </Text>
            </View>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>

          {create.isError ? (
            <Text accessibilityRole="alert" className="text-sm text-danger">
              Não foi possível criar o plano.{' '}
              {create.error instanceof Error ? create.error.message : 'Tente de novo.'}
            </Text>
          ) : null}

          <Button
            className="h-14 rounded-full"
            disabled={!canCreate}
            loading={create.isPending}
            onPress={() => canCreate && !create.isPending && create.mutate()}
          >
            Criar plano
          </Button>
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
