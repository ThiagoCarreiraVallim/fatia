import { useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Trophy } from 'lucide-react-native';
import {
  describePrescription,
  feelingToRpe,
  loadFieldValue,
  loadToKg,
  loadUnitLabel,
  newSetClientKey,
  prefillForNextSet,
  workoutApi,
  type ExerciseGroup,
  type LoadPrescription,
} from '@fatia/api-client';
import { Button } from '@/components/ui';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { isExerciseComplete, loadValue, parseFirstRep, targetSetsOf } from './format';
import { FeelingPicker } from './feeling-picker';
import { setHeadline, STEPS } from './guided-session';
import { SetChips } from './set-chips';
import { SetEditor } from './set-editor';
import { ValueStepper } from './value-stepper';
import type { RestTimer as RestTimerState } from './use-rest-timer';
import { colors } from '@/theme/colors';

/**
 * A série de força da sessão guiada (prancha `Al-T3-Sessao`): "Série N de M ·
 * meta · última vez", os chips das séries (tocar numa feita corrige), e — no
 * estado de trabalho — carga e reps digitáveis, o recorde, "Como foi a série?"
 * e "Concluir série N".
 *
 * O palpite de carga segue o de antes (`prefillForNextSet`, #187/#190); o RPE
 * agora é a carinha escolhida antes de concluir, gravada como RPE 6–10.
 *
 * Cada toque em "Concluir série" leva uma `clientKey`: a mesma é reaproveitada
 * se o envio falhar e a pessoa tocar de novo, então a rede que cai depois de o
 * servidor gravar não vira série dobrada.
 */
export function ActiveExerciseCard({
  sessionId,
  sessionStartedAt,
  group,
  rest,
  working,
  onLogged,
}: {
  sessionId: string;
  /** Início da sessão em ISO. Recorta o histórico no que veio **antes** dela. */
  sessionStartedAt: string;
  group: ExerciseGroup;
  rest: RestTimerState;
  /** Falso no descanso e na escolha do próximo: só os chips aparecem. */
  working: boolean;
  /** `completed`: esta série fechou o exercício. */
  onLogged: (completed: boolean) => void;
}) {
  const qc = useQueryClient();
  const units = useUnitPrefs();
  const unitLabel = loadUnitLabel(units.loadUnit);

  const targetSets = targetSetsOf(group);
  const doneSets = group.sets.length;
  const sessionLastSet = group.sets[doneSets - 1];
  const [editing, setEditing] = useState<number | null>(null);

  // A referência é a última série deste exercício **antes** desta sessão — o
  // recorte é do servidor, via `before` (ver o histórico desta decisão no git).
  const previous = useQuery({
    queryKey: ['workout', 'last-set', group.exerciseId, sessionStartedAt],
    queryFn: () => workoutApi.getLastSet(group.exerciseId, sessionStartedAt),
  });
  const reference = previous.data ?? null;

  const pr = useQuery({
    queryKey: ['workout', 'pr', group.exerciseId],
    queryFn: () => workoutApi.getPersonalRecord(group.exerciseId),
    staleTime: 60_000,
  });
  const prWeight =
    pr.data && 'weightKg' in pr.data && pr.data.weightKg != null ? pr.data.weightKg : null;
  const prReps = pr.data && 'reps' in pr.data && pr.data.reps != null ? pr.data.reps : null;

  const prescriptionQuery = useQuery({
    queryKey: ['workout', 'prescription', group.exerciseId, group.targetReps],
    queryFn: () => workoutApi.getPrescription(group.exerciseId, group.targetReps),
    staleTime: 60_000,
  });
  const prescribed: LoadPrescription | undefined = prescriptionQuery.data;
  const prescription = prescribed?.status === 'ok' ? prescribed : null;
  const hint = prescription && doneSets === 0 ? describePrescription(prescription) : null;

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(() => parseFirstRep(group.targetReps));
  const [feeling, setFeeling] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  // O palpite é aplicado durante o render, comparando os dois números (#187):
  // os objetos de série trocam de identidade a cada refetch e reescreveriam o
  // que a pessoa digitou.
  const prefill = prefillForNextSet({
    touched,
    sessionLastSet,
    previousSessionSet: reference,
    prescription,
  });
  const [prevPrefill, setPrevPrefill] = useState<{ weightKg: number | null; reps: number | null }>({
    weightKg: null,
    reps: null,
  });
  if (
    !Object.is(prevPrefill.weightKg, prefill.weightKg) ||
    !Object.is(prevPrefill.reps, prefill.reps)
  ) {
    setPrevPrefill({ weightKg: prefill.weightKg, reps: prefill.reps });
    if (prefill.weightKg != null) setWeight(prefill.weightKg);
    if (prefill.reps != null) setReps(prefill.reps);
  }

  // Uma chave por toque; sobrevive à falha para o reenvio ser o mesmo pedido.
  const clientKey = useRef<string | null>(null);

  const logSet = useMutation({
    mutationFn: (key: string) =>
      workoutApi.logSet(sessionId, {
        exerciseId: group.exerciseId,
        // `??` e não `||`: carga 0 é carga (peso do corpo).
        weightKg: weight ?? undefined,
        reps: reps || undefined,
        rpe: feeling != null ? feelingToRpe(feeling) : undefined,
        clientKey: key,
      }),
    onSuccess: () => {
      clientKey.current = null;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const completed = group.targetSets ? doneSets + 1 >= group.targetSets : false;
      AccessibilityInfo.announceForAccessibility(
        `Série ${doneSets + 1} de ${targetSets} registrada. Descanso iniciado.`,
      );
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      // O descanso prescrito ganha do padrão: 180 s depois de uma tripla
      // pesada e 60 s depois de rosca não são a mesma pausa.
      rest.start(prescription?.restSeconds);
      setFeeling(null);
      onLogged(completed);
    },
  });

  function conclude() {
    if (logSet.isPending) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clientKey.current ??= newSetClientKey();
    logSet.mutate(clientKey.current);
  }

  const lastTime = reference
    ? reference.weightKg
      ? `${loadValue(reference.weightKg, units)} ${unitLabel} × ${reference.reps ?? 0}`
      : `${reference.reps ?? 0} reps`
    : null;
  const record =
    prWeight != null
      ? `recorde ${loadValue(prWeight, units)} ${unitLabel}${prReps != null ? ` × ${prReps}` : ''}`
      : prReps != null
        ? `recorde ${prReps} reps`
        : null;
  const isComplete = isExerciseComplete(group);
  const editingSet = editing != null ? group.sets[editing] : undefined;

  return (
    <View className="gap-3">
      <Text className="text-[13px] text-muted-foreground">
        {setHeadline({
          done: doneSets,
          target: targetSets,
          targetReps: group.targetReps,
          lastTime,
        })}
      </Text>

      <SetChips group={group} editing={editingSet ? editing : null} onEdit={setEditing} />

      {editingSet && editing != null ? (
        <SetEditor
          key={editingSet.id}
          set={editingSet}
          index={editing}
          isCardio={false}
          sessionId={sessionId}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {working && !isComplete ? (
        <>
          <View className="flex-row gap-2">
            <ValueStepper
              label="Carga"
              unit={unitLabel}
              accessibilityLabel={`carga em ${units.loadUnit === 'LB' ? 'libras' : 'quilos'} para ${group.exerciseName}`}
              value={loadFieldValue(weight, units.loadUnit)}
              step={STEPS.load}
              onChange={(next) => {
                setTouched(true);
                setWeight(loadToKg(next, units.loadUnit));
              }}
            />
            <ValueStepper
              label="Repetições"
              accessibilityLabel={`repetições para ${group.exerciseName}`}
              value={reps}
              step={STEPS.reps}
              integer
              onChange={(next) => {
                setTouched(true);
                setReps(next);
              }}
            />
          </View>

          {record || hint ? (
            <View className="flex-row flex-wrap items-center gap-2">
              {record ? (
                <View className="min-h-[28px] flex-row items-center gap-1.5 rounded-full bg-muted px-3">
                  <Trophy size={13} color={colors.steps} />
                  <Text className="text-[12px] font-sans-bold text-foreground">{record}</Text>
                </View>
              ) : null}
              {hint ? (
                <Text className="flex-1 text-[12px] text-muted-foreground">
                  {hint.label} · {hint.reason}
                </Text>
              ) : null}
            </View>
          ) : null}

          <FeelingPicker title="Como foi a série?" value={feeling} onChange={setFeeling} />

          {logSet.error ? (
            <Text className="text-xs text-danger">
              Não deu para registrar. Toque de novo — a série não sai dobrada.
            </Text>
          ) : null}

          <Button
            className="h-14 rounded-full"
            disabled={logSet.isPending}
            loading={logSet.isPending}
            onPress={conclude}
          >
            <Check size={18} color={colors.primaryForeground} />
            <Text className="font-sans-bold text-base text-primary-foreground">
              Concluir série {doneSets + 1}
            </Text>
          </Button>
        </>
      ) : null}
    </View>
  );
}
