import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Play, Plus, X } from 'lucide-react-native';
import {
  CIRCUIT_FORMAT_OPTIONS,
  CIRCUIT_STEPS,
  CIRCUIT_UNIT_DEFAULT,
  circuitDraftErrors,
  circuitDraftSummary,
  circuitDraftToInput,
  defaultCircuitName,
  workoutApi,
  type CircuitDraft,
  type CircuitDraftItem,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Text } from '@/components/ui/text';
import { cn, useToast } from '@/components/ui';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { ExerciseGroupLine } from '@/components/workout/plan-exercise-row';
import { colors } from '@/theme/colors';
import { CircuitStepper } from './circuit-stepper';
import { useStartCircuit } from './use-start-circuit';

const ROW = 'min-h-[60px] flex-row items-center justify-between gap-3';

/**
 * Novo circuito e editar circuito (Al-T22, #380). Réplica de
 * `apps/web/src/components/workout/circuit/circuit-editor.tsx`.
 */
export function CircuitEditor({ initial, planId }: { initial: CircuitDraft; planId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<CircuitDraft>(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(planId ?? null);
  const start = useStartCircuit();

  const update = (patch: Partial<CircuitDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      return next.nameTouched ? next : { ...next, name: defaultCircuitName(next) };
    });
  const updateItem = (i: number, patch: Partial<CircuitDraftItem>) =>
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)),
    }));

  const errors = circuitDraftErrors(draft);
  const save = useMutation({
    mutationFn: async () => {
      const body = circuitDraftToInput(draft);
      const plan = savedId
        ? await workoutApi.updateCircuit(savedId, body)
        : await workoutApi.createCircuit(body);
      setSavedId(plan.id);
      return plan;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'plan'] });
    },
  });

  const submit = async (then: 'list' | 'start') => {
    setShowErrors(true);
    if (errors.length > 0 || save.isPending || start.isPending) return;
    const plan = await save.mutateAsync().catch(() => null);
    if (!plan) return;
    if (then === 'start') {
      start.mutate(plan.id);
      return;
    }
    toast.show({ message: 'Salvo em Planos › Circuitos' });
    router.replace('/workout/plans?tab=circuitos' as Href);
  };

  const isTime = draft.format === 'AMRAP' || draft.format === 'EMOM';
  const busy = save.isPending || start.isPending;
  const failure = save.error ?? start.error;

  return (
    <>
      <Screen
        footer={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void submit('list')}
              className="h-14 items-center justify-center rounded-pill bg-muted px-5 active:opacity-80"
            >
              <Text className="font-sans-bold text-[15px] text-foreground">
                {save.isPending && !start.isPending ? 'Salvando...' : 'Salvar'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Começar agora"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void submit('start')}
              className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-primary active:opacity-80"
            >
              <Play size={16} color={colors.primaryForeground} />
              <Text className="font-sans-bold text-[15px] text-primary-foreground">
                {start.isPending ? 'Começando...' : 'Começar agora'}
              </Text>
            </Pressable>
          </>
        }
      >
        <View className="gap-4 px-4 pt-2">
          <View className="gap-2">
            <Text className="px-1 text-xs text-faint">Nome</Text>
            <TextInput
              value={draft.name}
              maxLength={80}
              accessibilityLabel="Nome do circuito"
              onChangeText={(name) => setDraft((d) => ({ ...d, name, nameTouched: true }))}
              returnKeyType="done"
              className="h-[52px] rounded-2xl bg-card px-4 font-sans-bold text-[17px] text-foreground"
            />
          </View>

          <View className="gap-2">
            <Text className="px-1 text-xs text-faint">Formato</Text>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {CIRCUIT_FORMAT_OPTIONS.map((o) => {
                const on = draft.format === o.format;
                return (
                  <Pressable
                    key={o.format}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${o.title}, ${o.subtitle}`}
                    onPress={() => update({ format: o.format })}
                    style={[
                      { width: '48.5%' },
                      on
                        ? { backgroundColor: `${colors.primary}1f`, borderColor: colors.primary }
                        : { borderColor: 'transparent' },
                    ]}
                    className={cn(
                      'min-h-[84px] gap-1 rounded-[18px] border-2 p-3.5 active:opacity-80',
                      !on && 'bg-card',
                    )}
                  >
                    <Text className="font-sans-bold text-base text-foreground">{o.title}</Text>
                    <Text className="text-xs text-faint">{o.subtitle}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="rounded-[20px] bg-card px-4">
            {isTime ? (
              <View className={ROW}>
                <View className="min-w-0 flex-1">
                  <Text className="font-sans-bold text-[15px] text-foreground">Duração</Text>
                  <Text className="text-xs text-faint">
                    {draft.format === 'AMRAP' ? 'faça o máximo de rounds' : 'troca a cada minuto'}
                  </Text>
                </View>
                <CircuitStepper
                  label="duração"
                  suffix="min"
                  value={draft.minutes}
                  onChange={(minutes) => update({ minutes })}
                  {...CIRCUIT_STEPS.minutes}
                />
              </View>
            ) : null}
            {draft.format === 'TABATA' ? (
              <>
                <View className={ROW}>
                  <Text className="font-sans-bold text-[15px] text-foreground">Trabalho</Text>
                  <CircuitStepper
                    label="trabalho"
                    suffix="s"
                    value={draft.workSeconds}
                    onChange={(workSeconds) => update({ workSeconds })}
                    {...CIRCUIT_STEPS.workSeconds}
                  />
                </View>
                <View className={cn(ROW, 'border-t border-border')}>
                  <Text className="font-sans-bold text-[15px] text-foreground">Descanso</Text>
                  <CircuitStepper
                    label="descanso"
                    suffix="s"
                    value={draft.restSeconds}
                    onChange={(restSeconds) => update({ restSeconds })}
                    {...CIRCUIT_STEPS.restSeconds}
                  />
                </View>
                <View className={cn(ROW, 'border-t border-border')}>
                  <Text className="font-sans-bold text-[15px] text-foreground">Intervalos</Text>
                  <CircuitStepper
                    label="intervalos"
                    value={draft.intervals}
                    onChange={(intervals) => update({ intervals })}
                    {...CIRCUIT_STEPS.intervals}
                  />
                </View>
              </>
            ) : null}
            {draft.format === 'FOR_TIME' ? (
              <>
                <View className={ROW}>
                  <Text className="font-sans-bold text-[15px] text-foreground">Rounds</Text>
                  <CircuitStepper
                    label="rounds"
                    value={draft.rounds}
                    onChange={(rounds) => update({ rounds })}
                    {...CIRCUIT_STEPS.rounds}
                  />
                </View>
                <View className={cn(ROW, 'border-t border-border')}>
                  <View className="min-w-0 flex-1">
                    <Text className="font-sans-bold text-[15px] text-foreground">Descanso</Text>
                    <Text className="text-xs text-faint">entre rounds</Text>
                  </View>
                  <CircuitStepper
                    label="descanso entre rounds"
                    suffix="s"
                    value={draft.restBetweenRounds}
                    onChange={(restBetweenRounds) => update({ restBetweenRounds })}
                    {...CIRCUIT_STEPS.restBetweenRounds}
                  />
                </View>
              </>
            ) : null}
          </View>

          <Text className="px-1 text-xs text-faint">{circuitDraftSummary(draft)}</Text>

          <View className="gap-2">
            <View className="flex-row items-baseline justify-between px-1">
              <Text className="text-xs text-faint">Exercícios</Text>
              <Text className="text-xs text-faint">na ordem do circuito</Text>
            </View>
            <View className="rounded-[20px] bg-card px-4">
              {draft.exercises.map((e, i) => {
                const steps = e.unit === 'REPS' ? CIRCUIT_STEPS.reps : CIRCUIT_STEPS.seconds;
                return (
                  <View
                    key={`${e.exerciseId}-${i}`}
                    className={cn('gap-2.5 py-3', i > 0 && 'border-t border-border')}
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="h-[26px] w-[26px] items-center justify-center rounded-full bg-muted">
                        <Text className="font-sans-extrabold text-xs text-foreground">{i + 1}</Text>
                      </View>
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text
                          numberOfLines={1}
                          className="font-sans-semibold text-[15px] text-foreground"
                        >
                          {e.name}
                        </Text>
                        <ExerciseGroupLine group={e.muscleGroup} />
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remover ${e.name}`}
                        onPress={() =>
                          setDraft((d) => ({
                            ...d,
                            exercises: d.exercises.filter((_, k) => k !== i),
                          }))
                        }
                        className="h-8 w-8 items-center justify-center rounded-full"
                      >
                        <X size={16} color={colors.faintForeground} />
                      </Pressable>
                    </View>
                    <View className="flex-row items-center justify-between gap-2 pl-[38px]">
                      <View
                        accessibilityRole="radiogroup"
                        accessibilityLabel={`Medida de ${e.name}`}
                        className="flex-row gap-[3px] rounded-[12px] bg-muted p-[3px]"
                      >
                        {(['REPS', 'SECONDS'] as const).map((unit) => {
                          const on = e.unit === unit;
                          return (
                            <Pressable
                              key={unit}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: on }}
                              onPress={() =>
                                !on && updateItem(i, { unit, target: CIRCUIT_UNIT_DEFAULT[unit] })
                              }
                              className={cn(
                                'h-8 justify-center rounded-[9px] px-3',
                                on && 'bg-foreground',
                              )}
                            >
                              <Text
                                className={cn(
                                  'font-sans-bold text-[13px]',
                                  on ? 'text-background' : 'text-muted-foreground',
                                )}
                              >
                                {unit === 'REPS' ? 'reps' : 'tempo'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <CircuitStepper
                        label={e.name}
                        suffix={e.unit === 'REPS' ? 'reps' : 's'}
                        value={e.target}
                        onChange={(target) => updateItem(i, { target })}
                        {...steps}
                      />
                    </View>
                  </View>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => setAddOpen(true)}
                className={cn(
                  'min-h-[52px] flex-row items-center gap-2 active:opacity-80',
                  draft.exercises.length > 0 && 'border-t border-border',
                )}
              >
                <Plus size={16} color={colors.primaryText} />
                <Text className="font-sans-bold text-sm text-primary-text">
                  Adicionar exercício
                </Text>
              </Pressable>
            </View>
          </View>

          {showErrors && errors.length > 0 ? (
            <View accessibilityRole="alert" className="gap-1 px-1">
              {errors.map((e) => (
                <Text key={e} className="text-sm text-danger">
                  {e}
                </Text>
              ))}
            </View>
          ) : null}
          {failure && !(showErrors && errors.length > 0) ? (
            <Text accessibilityRole="alert" className="px-1 text-sm text-danger">
              Não foi possível salvar o circuito.{' '}
              {failure instanceof Error ? failure.message : 'Tente de novo.'}
            </Text>
          ) : null}
        </View>
      </Screen>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planName={draft.name.trim() || undefined}
        existingExerciseIds={new Set(draft.exercises.map((e) => e.exerciseId))}
        onAddMany={(chosen) =>
          setDraft((d) => ({
            ...d,
            exercises: [
              ...d.exercises,
              ...chosen.map((x) => ({
                exerciseId: x.id,
                name: x.name,
                muscleGroup: x.muscleGroup,
                unit: 'REPS' as const,
                target: CIRCUIT_UNIT_DEFAULT.REPS,
              })),
            ],
          }))
        }
      />
    </>
  );
}
