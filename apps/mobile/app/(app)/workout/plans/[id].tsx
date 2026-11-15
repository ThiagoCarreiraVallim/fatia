import { useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, Pencil, Play, Plus, Trash2 } from 'lucide-react-native';
import {
  ApiError,
  planHistoryLine,
  planSummaryLine,
  usersApi,
  workoutApi,
  type PlanExerciseInput,
  type WorkoutPlan,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  useConfirm,
  useToast,
} from '@/components/ui';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { ExerciseDetailHost } from '@/components/workout/exercise-detail-host';
import { PlanExerciseRow } from '@/components/workout/plan-exercise-row';
import { PlanExerciseSheet } from '@/components/workout/plan-exercise-sheet';
import { PlanMuscleBar } from '@/components/workout/plan-muscle-bar';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import {
  applyPlanMove,
  planMoveAnnouncement,
  planMoveDecision,
  type PlanMove,
} from '@/components/workout/workout-stats';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/app/(app)/workout/plans/[id]/page.tsx`.
 *
 * A reordenação (issue #115) são dois botões por exercício, cada um com rótulo
 * próprio. Arrastar seria mais bonito e inacessível — com leitor de tela
 * ligado, arrastar é o gesto que move o foco.
 */

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameEdit, setNameEdit] = useState('');
  // Al-T7: ver por padrão; editar mostra setas, lixeira, renomear e excluir.
  const [editing, setEditing] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const { loadUnit } = useUnitPrefs();
  const me = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    staleTime: 5 * 60_000,
  });

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
    mutationFn: ({ exerciseId, body }: { exerciseId: string; body: PlanExerciseInput }) =>
      workoutApi.updatePlanExercise(id, exerciseId, body),
    onSuccess: () => {
      setConfigId(null);
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  const removeExercise = useMutation({
    mutationFn: (exerciseId: string) => workoutApi.removePlanExercise(id, exerciseId),
    onSuccess: () => {
      setConfigId(null);
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  // A troca vai numa requisição só: a API grava os dois `order` dentro de uma
  // transação, então não existe instante em que a lista esteja pela metade.
  const moveExercise = useMutation({
    mutationFn: (decision: PlanMove<WorkoutPlanExercise>) =>
      workoutApi.reorderPlanExercises(id, decision.payload),
    // O card troca de lugar no toque, não na resposta: no 4G do vestiário a ida
    // e volta some, e quem não vê nada acontecer toca de novo. Chegou do PWA
    // pela #221 — lá o otimismo é da #115, e a assimetria estava registrada no
    // `docs/MOBILE_PARITY.md`.
    onMutate: async (decision) => {
      // Sem cancelar, um refetch disparado antes do toque pode responder depois
      // e reescrever o cache com a ordem antiga — o card pula de volta sozinho.
      await qc.cancelQueries({ queryKey: ['workout', 'plan', id] });
      const previous = qc.getQueryData<WorkoutPlan>(['workout', 'plan', id]);
      qc.setQueryData<WorkoutPlan>(['workout', 'plan', id], (old) =>
        old ? { ...old, exercises: applyPlanMove(old.exercises, decision) } : old,
      );
      return { previous };
    },
    onSuccess: (updated, decision) => {
      // A resposta já é o plano reordenado — escrever no cache evita o refetch
      // que só confirmaria o que acabou de chegar.
      qc.setQueryData(['workout', 'plan', id], updated);
      // O anúncio só sai aqui. Saía junto com o toque, antes da resposta: com a
      // rede caída o leitor de tela afirmava um movimento que não aconteceu.
      // Posição e total saem da resposta, e não do snapshot do toque.
      const anuncio = planMoveAnnouncement(
        updated.exercises,
        decision.from.id,
        decision.from.exercise.name,
      );
      if (anuncio) AccessibilityInfo.announceForAccessibility(anuncio);
    },
    onError: (error, _decision, context) => {
      // Desfaz o otimismo e, logo depois, busca de novo — sempre. O snapshot é
      // do `onMutate` e pode ter envelhecido durante o voo: remover um
      // exercício nesta mesma tela invalida a query, e o refetch responde com a
      // lista já sem ele. Restaurar sem confirmar ressuscitaria na tela o que o
      // servidor apagou. O rollback dá o retorno imediato, o refetch dá a
      // verdade.
      if (context?.previous) qc.setQueryData(['workout', 'plan', id], context.previous);
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
      // 404 aqui não é "o plano sumiu": desde a #205 a API recusa a operação
      // inteira quando algum id do corpo não pertence mais ao plano —
      // exercício removido em outro aparelho, e esta tela ainda com o cache
      // velho. A mensagem crua seria "Plan exercise not found", em inglês e sem
      // dizer o que fazer.
      if (error instanceof ApiError && error.isNotFound) {
        toast.show({
          message:
            'Um exercício saiu do plano em outro lugar. Atualizamos a lista — tente mover de novo.',
        });
        return;
      }
      toast.show({
        message: `Não foi possível mover. ${error instanceof Error ? error.message : 'Tente novamente.'}`,
      });
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
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (plan.isError) {
    return (
      <Screen>
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      </Screen>
    );
  }

  if (!plan.data) {
    return (
      <Screen>
        <EmptyState title="Plano não encontrado." />
      </Screen>
    );
  }

  const planData = plan.data;
  const exercises = [...planData.exercises].sort((a, b) => a.order - b.order);
  const existingIds = new Set(exercises.map((e) => e.exerciseId));
  const configuring = exercises.find((e) => e.id === configId) ?? null;

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
    // A trava de "uma troca por vez" está aqui, além do `disabled` do botão,
    // porque só aqui ela impede o feedback tátil de um toque que não vai virar
    // requisição nenhuma.
    const decision = planMoveDecision(exercises, index, delta, {
      moveInFlight: moveExercise.isPending,
    });
    if (!decision) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    moveExercise.mutate(decision);
  }

  function confirmRemoveExercise(ex: WorkoutPlanExercise) {
    confirm({
      title: 'Remover exercício?',
      description: `${ex.exercise.name} sai deste plano. Os treinos já feitos continuam no histórico.`,
      confirmLabel: 'Remover',
      destructive: true,
      onConfirm: () => removeExercise.mutate(ex.id),
    });
  }

  function confirmDelete() {
    confirm({
      title: `Excluir “${planData.name}”?`,
      description: 'O histórico das sessões continua.',
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: () => deletePlan.mutate(),
    });
  }

  return (
    <ExerciseDetailHost>
      <Screen
        title={planData.name}
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Concluir edição' : 'Editar plano'}
            accessibilityState={{ selected: editing }}
            onPress={() => {
              setEditing((e) => !e);
              setEditingName(false);
            }}
            className={TOP_BAR_ACTION}
          >
            {editing ? (
              <Check size={20} color={colors.primaryText} />
            ) : (
              <Pencil size={19} color={colors.primaryText} />
            )}
          </Pressable>
        }
        refreshing={plan.isRefetching}
        onRefresh={() => void plan.refetch()}
      >
        <View className="gap-4 px-5 pb-4 pt-2">
          {editingName ? (
            <View className="flex-row items-center gap-2">
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
                className={TOP_BAR_ACTION}
              >
                <Check size={20} color={colors.primaryText} />
              </Pressable>
            </View>
          ) : null}

          <View className="gap-1 rounded-2xl border border-border bg-card p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {editing ? 'Editando plano' : planData.fromTemplateId ? 'modelo' : 'seu plano'}
            </Text>
            <Text className="text-2xl font-extrabold text-foreground">{planData.name}</Text>
            <Text className="text-xs text-muted-foreground">
              {planHistoryLine(planData.timesDone ?? 0, planData.lastDoneAt ?? null)}
            </Text>
            <Text className="mt-2 text-sm font-semibold text-foreground">
              {planSummaryLine(exercises)}
            </Text>
            <PlanMuscleBar exercises={exercises} legend className="mt-1" />
            {editing && !editingName ? (
              <View className="mt-2 flex-row gap-2">
                <Button variant="outline" size="sm" onPress={startEditName}>
                  <Pencil size={14} color={colors.foreground} />
                  <Text className="text-sm text-foreground">Renomear</Text>
                </Button>
                <Button variant="outline" size="sm" onPress={confirmDelete}>
                  <Trash2 size={14} color={colors.danger} />
                  <Text className="text-sm text-danger">Excluir plano</Text>
                </Button>
              </View>
            ) : null}
          </View>

          {exercises.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adicionar seu primeiro exercício"
              onPress={() => setAddOpen(true)}
              className="items-center gap-2 rounded-2xl border border-dashed border-border bg-accent p-6 active:opacity-80"
            >
              <Plus size={20} color={colors.primaryText} />
              <Text className="text-center text-sm text-muted-foreground">
                Plano criado! Agora{' '}
                <Text className="font-bold text-primary">adicione seu primeiro exercício</Text>.
              </Text>
            </Pressable>
          ) : null}

          <View className="gap-2">
            {exercises.map((ex, index) => (
              <PlanExerciseRow
                key={ex.id}
                item={ex}
                editing={editing}
                isFirst={index === 0}
                isLast={index === exercises.length - 1}
                isMoving={moveExercise.isPending}
                onConfigure={() => setConfigId(ex.id)}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onRemove={() => confirmRemoveExercise(ex)}
              />
            ))}
          </View>

          <Button variant="outline" className="rounded-2xl" onPress={() => setAddOpen(true)}>
            <Plus size={16} color={colors.foreground} />
            <Text className="text-sm font-medium text-foreground">Adicionar exercício</Text>
          </Button>

          <Text className="text-center text-xs text-muted-foreground">
            {editing
              ? 'Use as setas para mudar a ordem. Toque no exercício para mudar séries, repetições, descanso e técnica.'
              : 'Toque na imagem para ver como fazer. Toque no exercício para mudar séries, repetições e descanso.'}
          </Text>

          <Button
            className="h-14 rounded-full"
            disabled={exercises.length === 0}
            loading={start.isPending}
            onPress={() => start.mutate()}
          >
            <Play size={16} color={colors.background} fill={colors.background} />
            <Text className="text-base font-extrabold text-primary-foreground">
              Iniciar {planData.name}
            </Text>
          </Button>
        </View>
      </Screen>

      <PlanExerciseSheet
        item={configuring}
        open={configuring != null}
        onOpenChange={(open) => {
          if (!open) {
            setConfigId(null);
            updateExercise.reset();
          }
        }}
        loadUnit={loadUnit}
        birthDate={me.data?.birthDate ?? null}
        saving={updateExercise.isPending}
        error={
          updateExercise.isError
            ? `Não foi possível salvar. ${updateExercise.error instanceof Error ? updateExercise.error.message : ''}`
            : null
        }
        onSave={(body) =>
          configuring && updateExercise.mutate({ exerciseId: configuring.id, body })
        }
        onRemove={() => configuring && removeExercise.mutate(configuring.id)}
      />

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planId={id}
        planName={planData.name}
        existingExerciseIds={existingIds}
      />
    </ExerciseDetailHost>
  );
}
