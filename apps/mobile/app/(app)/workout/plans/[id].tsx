import { useState } from 'react';
import { AccessibilityInfo, Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, Clock, Dumbbell, Lightbulb, Play, Plus, Trash2 } from 'lucide-react-native';
import { isCardioExercise, workoutApi, type WorkoutPlanExercise } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '@/components/ui';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { ExerciseDetailHost } from '@/components/workout/exercise-detail-host';
import { estimatePlanStats, nextPlanOrder, pluralize } from '@/components/workout/workout-stats';

/**
 * Réplica de `apps/web/src/app/(app)/workout/plans/[id]/page.tsx`.
 *
 * A reordenação (issue #115) é onde o app nativo passa na frente do PWA: a API
 * aceita `order` desde sempre, mas só o MCP usava. São dois botões por
 * exercício, cada um com rótulo próprio. Arrastar seria mais bonito e
 * inacessível — com leitor de tela ligado, arrastar é o gesto que move o foco.
 */

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={14} color="#2ce500" />
      <View>
        <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">{label}</Text>
        <Text className="text-sm font-extrabold text-foreground">{value}</Text>
      </View>
    </View>
  );
}

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameEdit, setNameEdit] = useState('');

  const plan = useQuery({
    queryKey: ['workout', 'plan', id],
    queryFn: () => workoutApi.getPlan(id),
  });

  const renamePlan = useMutation({
    mutationFn: (name: string) => workoutApi.updatePlan(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      setEditingName(false);
    },
  });

  const deletePlan = useMutation({
    mutationFn: () => workoutApi.deletePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.replace('/workout');
    },
  });

  const updateExercise = useMutation({
    mutationFn: ({
      exerciseId,
      body,
    }: {
      exerciseId: string;
      body: { targetSets?: number; targetReps?: string; order?: number };
    }) => workoutApi.updatePlanExercise(id, exerciseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  const removeExercise = useMutation({
    mutationFn: (exerciseId: string) => workoutApi.removePlanExercise(id, exerciseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  // A troca são dois PATCH de `order`. Sequenciais, não em paralelo: as duas
  // escritas se cruzam na mesma lista, e em paralelo a ordem de gravação no
  // servidor deixa de ser a ordem em que foram pedidas.
  const moveExercise = useMutation({
    mutationFn: async ({ a, b }: { a: WorkoutPlanExercise; b: WorkoutPlanExercise }) => {
      await workoutApi.updatePlanExercise(id, a.id, { order: b.order });
      await workoutApi.updatePlanExercise(id, b.id, { order: a.order });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  const start = useMutation({
    mutationFn: () => workoutApi.startSession({ planId: id, startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${session.id}`);
    },
  });

  if (plan.isLoading) {
    return (
      <Screen back title="Plano">
        <LoadingState />
      </Screen>
    );
  }

  if (plan.isError) {
    return (
      <Screen back title="Plano">
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      </Screen>
    );
  }

  if (!plan.data) {
    return (
      <Screen back title="Plano">
        <EmptyState title="Plano não encontrado." />
      </Screen>
    );
  }

  const planData = plan.data;
  const exercises = [...planData.exercises].sort((a, b) => a.order - b.order);
  const existingIds = new Set(exercises.map((e) => e.exerciseId));
  const { totalSets, estDurationMinutes, estVolumeTon } = estimatePlanStats(exercises);

  function startEditName() {
    setNameEdit(planData.name);
    setEditingName(true);
  }

  function submitName() {
    const trimmed = nameEdit.trim();
    if (trimmed && trimmed !== planData.name) renamePlan.mutate(trimmed);
    else setEditingName(false);
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= exercises.length) return;
    const a = exercises[index];
    const b = exercises[target];
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // O card só troca de lugar quando a API responde. Sem o aviso, quem usa
    // leitor de tela não tem como saber que o movimento aconteceu.
    AccessibilityInfo.announceForAccessibility(
      `${a.exercise.name} movido para a posição ${target + 1} de ${exercises.length}`,
    );
    moveExercise.mutate({ a, b });
  }

  function confirmDelete() {
    Alert.alert('Excluir plano', 'Excluir este plano de treino?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => deletePlan.mutate() },
    ]);
  }

  return (
    <ExerciseDetailHost>
      <Screen back title="Plano" refreshing={plan.isRefetching} onRefresh={() => void plan.refetch()}>
        <View className="gap-4 px-5 pb-4 pt-2">
          <View className="flex-row items-center gap-2">
            {editingName ? (
              <>
                <Input
                  autoFocus
                  value={nameEdit}
                  onChangeText={setNameEdit}
                  accessibilityLabel="Nome do plano"
                  returnKeyType="done"
                  onSubmitEditing={submitName}
                  className="flex-1 text-base font-bold"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Salvar nome"
                  accessibilityState={{ disabled: !nameEdit.trim() || renamePlan.isPending }}
                  disabled={!nameEdit.trim() || renamePlan.isPending}
                  onPress={submitName}
                  className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
                >
                  <Check size={20} color="#2ce500" />
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Renomear plano ${planData.name}`}
                onPress={startEditName}
                className="min-h-[44px] flex-1 justify-center"
              >
                <Text numberOfLines={1} className="text-2xl font-extrabold text-foreground">
                  {planData.name}
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Excluir plano"
              onPress={confirmDelete}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
            >
              <Trash2 size={18} color="#baccaf" />
            </Pressable>
          </View>

          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            <View className="gap-1 bg-muted p-4 pt-10">
              <View className="absolute left-4 top-4 rounded-md bg-primary px-2 py-0.5">
                <Text className="text-[10px] font-extrabold text-primary-foreground">
                  HIPERTROFIA
                </Text>
              </View>
              <Text className="text-2xl font-extrabold text-foreground">{planData.name}</Text>
              <Text className="text-xs text-muted-foreground">
                {exercises.length} {pluralize(exercises.length, 'exercício', 'exercícios')} •{' '}
                {totalSets} {pluralize(totalSets, 'série', 'séries')}
              </Text>
            </View>
            <View className="flex-row items-center gap-6 border-t border-border px-5 py-3">
              <Stat icon={Clock} label="Duração" value={`${estDurationMinutes}m`} />
              <Stat icon={Dumbbell} label="Volume" value={`${estVolumeTon} Ton`} />
            </View>
          </View>

          <Text accessibilityRole="header" className="text-base font-extrabold text-foreground">
            Exercícios{' '}
            <Text className="text-sm font-bold text-muted-foreground">({exercises.length})</Text>
          </Text>

          {exercises.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adicionar seu primeiro exercício"
              onPress={() => setAddOpen(true)}
              className="items-center gap-2 rounded-2xl border border-dashed border-border bg-accent p-6 active:opacity-80"
            >
              <Plus size={20} color="#2ce500" />
              <Text className="text-center text-sm text-muted-foreground">
                Plano criado! Agora{' '}
                <Text className="font-bold text-primary">adicione seu primeiro exercício</Text>.
              </Text>
            </Pressable>
          ) : null}

          <View className="gap-3">
            {exercises.map((ex, index) => (
              <ExerciseDetailCard
                key={ex.id}
                mode="plan"
                item={ex}
                isCardio={isCardioExercise(ex.exercise)}
                isFirst={index === 0}
                isLast={index === exercises.length - 1}
                onChangeSets={(n) =>
                  updateExercise.mutate({ exerciseId: ex.id, body: { targetSets: n } })
                }
                onChangeReps={(v) =>
                  updateExercise.mutate({ exerciseId: ex.id, body: { targetReps: v } })
                }
                onRemove={() => removeExercise.mutate(ex.id)}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
              />
            ))}
          </View>

          <Button variant="outline" className="rounded-2xl" onPress={() => setAddOpen(true)}>
            <Plus size={16} color="#e5e2e1" />
            <Text className="text-sm font-medium text-foreground">Adicionar exercício</Text>
          </Button>

          <View className="rounded-2xl border border-border bg-accent p-4">
            <View className="flex-row items-center gap-2">
              <Lightbulb size={16} color="#2ce500" />
              <Text className="text-sm font-extrabold text-foreground">Foco na Excêntrica</Text>
            </View>
            <Text className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Mantenha o controle da descida (fase excêntrica) por 3 segundos para maximizar a
              hipertrofia.
            </Text>
          </View>

          <Button
            className="h-14 rounded-full"
            disabled={exercises.length === 0}
            loading={start.isPending}
            onPress={() => start.mutate()}
          >
            <Play size={16} color="#131313" fill="#131313" />
            <Text className="text-base font-extrabold text-primary-foreground">Iniciar Treino</Text>
          </Button>
        </View>
      </Screen>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planId={id}
        existingExerciseIds={existingIds}
        nextOrder={nextPlanOrder(exercises)}
      />
    </ExerciseDetailHost>
  );
}
