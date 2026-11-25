import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Trophy } from 'lucide-react-native';
import {
  feelingToRpe,
  isTouchedForSet,
  loadFieldValue,
  loadToKg,
  loadUnitLabel,
  newSetClientKey,
  prefillForNextSet,
  restoreSetDraft,
  setDraftKey,
  workoutApi,
  type ExerciseGroup,
  type LoadPrescription,
  type SetDraft,
} from '@fatia/api-client';
import { Button } from '@/components/ui';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { isExerciseComplete, loadValue, parseFirstRep, targetSetsOf } from './format';
import { FeelingPicker } from './feeling-picker';
import { loadStep, setHeadline, STEPS } from './guided-session';
import { useDockedAction } from './session-dock';
import { SetChips } from './set-chips';
import { SetEditor } from './set-editor';
import { ValueStepper } from './value-stepper';
import type { RestTimer as RestTimerState } from './use-rest-timer';
import { colors } from '@/theme/colors';

/** O rascunho da série vive até seis horas sem ninguém lendo. */
const SET_DRAFT_GC_MS = 6 * 3600_000;

/**
 * A série de força da sessão guiada (prancha `Al-T3-Sessao`): "Série N de M",
 * os chips das séries (tocar numa feita corrige), e — no
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
  nav,
  onAll,
  beforeSubmit,
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
  /** "1/7" e as setas do exercício, à direita da linha da série (prancha `Al-T3d`). */
  nav?: ReactNode;
  /** "Todas ›", ao lado dos chips das séries. */
  onAll?: () => void;
  /** O "Passar sozinho", que a prancha põe logo acima do "Concluir série". */
  beforeSubmit?: ReactNode;
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

  // "Como fazer" é outra tela e esta pode ser remontada na volta: o que foi
  // digitado para a série em andamento volta do rascunho no cache.
  const [saved] = useState(() =>
    restoreSetDraft(qc.getQueryData<SetDraft>(setDraftKey(sessionId, group.exerciseId)), doneSets),
  );
  const [weight, setWeight] = useState(saved?.weightKg ?? 0);
  const [reps, setReps] = useState(() => saved?.reps ?? parseFirstRep(group.targetReps));
  const [feeling, setFeeling] = useState<number | null>(saved?.feeling ?? null);
  // Em qual série a pessoa mexeu nos campos (#485): o toque vale só para a
  // série em andamento, e a seguinte volta a herdar a que acabou de sair.
  const [touchedAt, setTouchedAt] = useState<number | null>(saved?.touched ? doneSets : null);
  const touched = isTouchedForSet(touchedAt, doneSets);
  const touch = () => setTouchedAt(doneSets);

  // O palpite é aplicado durante o render, comparando os dois números (#187):
  // os objetos de série trocam de identidade a cada refetch e reescreveriam o
  // que a pessoa digitou. Com o campo tocado ele não vem (`prefillForNextSet`),
  // nem quando a série da sessão muda por baixo (correção, refetch).
  const prefill = prefillForNextSet({
    touched,
    sessionLastSet,
    previousSessionSet: reference,
    prescription,
  });
  const [prevPrefill, setPrevPrefill] = useState<{ weightKg: number | null; reps: number | null }>(
    saved?.prefill ?? { weightKg: null, reps: null },
  );
  if (
    !Object.is(prevPrefill.weightKg, prefill.weightKg) ||
    !Object.is(prevPrefill.reps, prefill.reps)
  ) {
    setPrevPrefill({ weightKg: prefill.weightKg, reps: prefill.reps });
    if (prefill.weightKg != null) setWeight(prefill.weightKg);
    if (prefill.reps != null) setReps(prefill.reps);
  }

  useEffect(() => {
    const key = setDraftKey(sessionId, group.exerciseId);
    // Fica enquanto durar o treino, mesmo sem ninguém lendo (o "Como fazer" demora).
    qc.setQueryDefaults(key, { gcTime: SET_DRAFT_GC_MS });
    qc.setQueryData<SetDraft>(key, {
      doneSets,
      weightKg: weight,
      reps,
      feeling,
      touched,
      prefill: prevPrefill,
    });
  }, [qc, sessionId, group.exerciseId, doneSets, weight, reps, feeling, touched, prevPrefill]);

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

  const record =
    prWeight != null
      ? `recorde ${loadValue(prWeight, units)} ${unitLabel}${prReps != null ? ` × ${prReps}` : ''}`
      : prReps != null
        ? `recorde ${prReps} reps`
        : null;
  const isComplete = isExerciseComplete(group);
  const editingSet = editing != null ? group.sets[editing] : undefined;

  // Preso no rodapé da sessão, fora da rolagem (prancha Al-T3, pedido do dono):
  // `useDockedAction` leva o botão para lá.
  const submitInline = useDockedAction(
    working && !isComplete ? (
      <Button
        className="h-[60px] rounded-full"
        disabled={logSet.isPending}
        loading={logSet.isPending}
        onPress={conclude}
      >
        <Check size={18} color={colors.primaryForeground} />
        <Text className="font-sans-bold text-base text-primary-foreground">
          Concluir série {doneSets + 1}
        </Text>
      </Button>
    ) : null,
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[13px] text-muted-foreground">
          {setHeadline({ done: doneSets, target: targetSets })}
        </Text>
        {nav}
      </View>

      <SetChips
        group={group}
        editing={editingSet ? editing : null}
        onEdit={setEditing}
        onAll={onAll}
      />

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
          <View className="flex-row gap-2.5">
            <ValueStepper
              label="Carga"
              unit={unitLabel}
              stacked={{ shortLabel: unitLabel }}
              caption={
                record ? (
                  <View className="flex-row items-center gap-1">
                    <Trophy size={13} color={colors.steps} />
                    <Text numberOfLines={1} className="font-sans-bold text-[11px] text-steps">
                      {record}
                    </Text>
                  </View>
                ) : null
              }
              accessibilityLabel={`carga em ${units.loadUnit === 'LB' ? 'libras' : 'quilos'} para ${group.exerciseName}`}
              value={loadFieldValue(weight, units.loadUnit)}
              step={loadStep(units.loadUnit)}
              onEditStart={touch}
              onChange={(next) => {
                touch();
                setWeight(loadToKg(next, units.loadUnit));
              }}
            />
            <ValueStepper
              label="Repetições"
              stacked={{ shortLabel: 'reps' }}
              caption={
                group.targetReps ? (
                  <Text className="font-sans-bold text-[11px] text-muted-foreground">
                    meta {group.targetReps}
                  </Text>
                ) : null
              }
              accessibilityLabel={`repetições para ${group.exerciseName}`}
              value={reps}
              step={STEPS.reps}
              integer
              onEditStart={touch}
              onChange={(next) => {
                touch();
                setReps(next);
              }}
            />
          </View>

          <FeelingPicker title="Como foi a série?" value={feeling} onChange={setFeeling} />

          {logSet.error ? (
            <Text className="text-xs text-danger">
              Não deu para registrar. Toque de novo — a série não sai dobrada.
            </Text>
          ) : null}

          {beforeSubmit}

          {submitInline}
        </>
      ) : null}
    </View>
  );
}
