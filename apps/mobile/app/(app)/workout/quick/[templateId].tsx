import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Clock, Dumbbell, Play, Plus } from 'lucide-react-native';
import { findQuickTemplate, isCardioExercise, workoutApi, type Exercise } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, Input, LoadingState } from '@/components/ui';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { ExerciseDetailHost } from '@/components/workout/exercise-detail-host';
import { quickVisual } from '@/components/workout/quick-template-visual';
import { estimatePlanStats, swapAt } from '@/components/workout/workout-stats';

/**
 * Réplica de `apps/web/src/app/(app)/workout/quick/[templateId]/page.tsx`.
 *
 * O template é só uma sugestão: a lista vive em memória e só vira plano de
 * verdade no "Iniciar Treino". Assim mexer nas séries antes de começar não deixa
 * um plano meio pronto para trás.
 */

interface LocalExercise {
  localId: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
}

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

export default function QuickTemplateScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const template = useMemo(() => findQuickTemplate(templateId), [templateId]);
  const [items, setItems] = useState<LocalExercise[]>([]);
  const [nameOverride, setNameOverride] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [resolved, setResolved] = useState(false);

  const lookups = useQueries({
    queries: (template?.exercises ?? []).map((ex) => ({
      queryKey: ['workout', 'exercises', ex.nameQuery],
      queryFn: () => workoutApi.searchExercises(ex.nameQuery),
    })),
  });

  useEffect(() => {
    if (!template || resolved) return;
    const allDone = lookups.every((q) => q.isSuccess || q.isError);
    if (!allDone) return;
    const seen = new Set<number>();
    const next: LocalExercise[] = [];
    template.exercises.forEach((tmpl, idx) => {
      const result = lookups[idx]?.data ?? [];
      const match = result.find((e) => !seen.has(e.id));
      if (match) {
        seen.add(match.id);
        next.push({
          localId: `${match.id}-${idx}`,
          exercise: match,
          targetSets: tmpl.targetSets,
          targetReps: tmpl.targetReps,
        });
      }
    });
    setItems(next);
    setResolved(true);
  }, [template, lookups, resolved]);

  const start = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error('Sem exercícios');
      const planName = (nameOverride || template?.title || 'Treino rápido').trim();
      const plan = await workoutApi.createPlan({ name: planName });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await workoutApi.addPlanExercise(plan.id, {
          exerciseId: it.exercise.id,
          order: i + 1,
          targetSets: it.targetSets,
          targetReps: it.targetReps,
        });
      }
      return workoutApi.startSession({ planId: plan.id, startedAt: new Date().toISOString() });
    },
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.push(`/workout/session/${session.id}`);
    },
  });

  if (!template) {
    return (
      <Screen back title="Treino rápido">
        <EmptyState
          title="Template não encontrado."
          action={
            <Button variant="outline" size="sm" onPress={() => router.replace('/workout')}>
              Voltar
            </Button>
          }
        />
      </Screen>
    );
  }

  const { totalSets, estDurationMinutes, estVolumeTon } = estimatePlanStats(items);
  const existingIds = new Set(items.map((i) => i.exercise.id));
  const planName = nameOverride || template.title;
  const { tint, icon: TemplateIcon } = quickVisual(template.id);
  const loading = !resolved;

  function updateItem(localId: string, patch: Partial<LocalExercise>) {
    setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));
  }

  function removeItem(localId: string) {
    setItems((prev) => prev.filter((i) => i.localId !== localId));
  }

  function moveItem(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AccessibilityInfo.announceForAccessibility(
      `${items[index].exercise.name} movido para a posição ${target + 1} de ${items.length}`,
    );
    setItems((prev) => swapAt(prev, index, delta));
  }

  function handleAdd(exercise: Exercise) {
    const cardio = isCardioExercise(exercise);
    setItems((prev) => [
      ...prev,
      {
        localId: `${exercise.id}-${Date.now()}`,
        exercise,
        targetSets: cardio ? 1 : 3,
        targetReps: cardio ? '—' : '8-12',
      },
    ]);
  }

  return (
    <ExerciseDetailHost>
      <Screen back title="Treino rápido">
        <View className="gap-4 px-5 pb-4 pt-2">
          {editingName ? (
            <Input
              autoFocus
              value={nameOverride || template.title}
              onChangeText={setNameOverride}
              accessibilityLabel="Nome do treino"
              returnKeyType="done"
              onBlur={() => setEditingName(false)}
              onSubmitEditing={() => setEditingName(false)}
              className="text-base font-bold"
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Renomear treino ${planName}`}
              onPress={() => setEditingName(true)}
              className="min-h-[44px] justify-center"
            >
              <Text numberOfLines={1} className="text-2xl font-extrabold text-foreground">
                {planName}
              </Text>
            </Pressable>
          )}

          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            <View style={{ backgroundColor: tint }} className="gap-1 p-4 pt-12">
              <View className="absolute right-3 top-3 opacity-30">
                <TemplateIcon size={56} color="#e5e2e1" />
              </View>
              <View className="absolute left-4 top-4 flex-row gap-2">
                <View className="rounded-md bg-primary px-2 py-0.5">
                  <Text className="text-[10px] font-extrabold text-primary-foreground">
                    TREINO RÁPIDO
                  </Text>
                </View>
                <View className="rounded-md bg-background px-2 py-0.5">
                  <Text className="text-[10px] font-extrabold text-foreground">
                    {template.level.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text className="text-2xl font-extrabold text-foreground">{planName}</Text>
              <Text className="text-xs text-muted-foreground">
                {template.duration} • {template.location}
              </Text>
            </View>
            <View className="flex-row items-center gap-6 border-t border-border px-5 py-3">
              <Stat icon={Clock} label="Duração" value={`${estDurationMinutes}m`} />
              <Stat icon={Dumbbell} label="Volume" value={`${estVolumeTon} Ton`} />
            </View>
          </View>

          <Text accessibilityRole="header" className="text-base font-extrabold text-foreground">
            Exercícios{' '}
            <Text className="text-sm font-bold text-muted-foreground">({items.length})</Text>
          </Text>

          {loading ? <LoadingState label="Montando o treino…" /> : null}

          {!loading && items.length === 0 ? (
            <EmptyState
              title="Nenhum exercício encontrado para esse template."
              description="Adicione manualmente."
            />
          ) : null}

          <View className="gap-3">
            {items.map((it, index) => (
              <ExerciseDetailCard
                key={it.localId}
                mode="plan"
                isCardio={isCardioExercise(it.exercise)}
                item={{
                  id: it.localId,
                  exercise: it.exercise,
                  targetSets: it.targetSets,
                  targetReps: it.targetReps,
                }}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                onChangeSets={(n) => updateItem(it.localId, { targetSets: n })}
                onChangeReps={(v) => updateItem(it.localId, { targetReps: v })}
                onRemove={() => removeItem(it.localId)}
                onMoveUp={() => moveItem(index, -1)}
                onMoveDown={() => moveItem(index, 1)}
              />
            ))}
          </View>

          <Button variant="outline" className="rounded-2xl" onPress={() => setAddOpen(true)}>
            <Plus size={16} color="#e5e2e1" />
            <Text className="text-sm font-medium text-foreground">Adicionar exercício</Text>
          </Button>

          <Button
            className="h-14 rounded-full"
            disabled={items.length === 0}
            loading={start.isPending}
            onPress={() => start.mutate()}
          >
            <Play size={16} color="#131313" fill="#131313" />
            <Text className="text-base font-extrabold text-primary-foreground">Iniciar Treino</Text>
          </Button>

          <Text className="text-center text-[11px] text-muted-foreground">
            {totalSets} {totalSets === 1 ? 'série planejada' : 'séries planejadas'}
          </Text>
        </View>
      </Screen>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        existingExerciseIds={existingIds}
        onAdd={handleAdd}
      />
    </ExerciseDetailHost>
  );
}
