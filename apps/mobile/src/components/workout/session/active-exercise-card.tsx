import { useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Info, Minus, Plus } from 'lucide-react-native';
import {
  prefillForNextSet,
  workoutApi,
  type ExerciseGroup,
  type SessionSet,
} from '@fatia/api-client';
import { Button, Input } from '@/components/ui';
import { useOpenExerciseDetail } from '@/components/workout/exercise-detail-host';
import {
  formatNumber,
  formatPreviousSet,
  parseDecimalInput,
  parseFirstRep,
  previousCells,
  targetSetsOf,
} from './format';
import { RestTimer } from './rest-timer';
import { SetRow } from './set-row';
import type { RestTimer as RestTimerState } from './use-rest-timer';

/**
 * Réplica de `apps/web/src/components/workout/active-exercise-card.tsx`.
 *
 * Só campos de força: carga, repetições e RPE. O `log_set` da API é um schema
 * discriminado por tipo, e cardio tem card próprio (`active-cardio-card.tsx`) —
 * um formulário único mostraria "carga (kg)" numa esteira.
 *
 * O que muda em relação ao web:
 *
 * - o descanso é controlado pela tela (ver `use-rest-timer.ts`), para não zerar
 *   quando o foco passa para o próximo exercício.
 * - o RPE é pedido pela tela, num drawer montado fora do card — o bottom sheet
 *   nativo não é portal (ver `ui/drawer.tsx`).
 */

export function ActiveExerciseCard({
  sessionId,
  sessionStartedAt,
  group,
  rest,
  onFinishExercise,
  onAskRpe,
}: {
  sessionId: string;
  /** Início da sessão em ISO. Recorta o histórico no que veio **antes** dela. */
  sessionStartedAt: string;
  group: ExerciseGroup;
  rest: RestTimerState;
  onFinishExercise: () => void;
  onAskRpe: (set: SessionSet) => void;
}) {
  const qc = useQueryClient();
  const openDetail = useOpenExerciseDetail();

  const targetSets = targetSetsOf(group);
  const doneSets = group.sets.length;
  const isComplete = doneSets >= targetSets;
  const sessionLastSet = group.sets[doneSets - 1];

  // A referência é a última série deste exercício **antes** desta sessão. O
  // recorte é do servidor, via `before`: filtrar no cliente exigiria manter a
  // resposta em cache para sempre e, quando o cache expirasse no meio do treino,
  // a única candidata seria a série de hoje — que o filtro descartaria, fazendo
  // a referência sumir sozinha.
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

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(() => parseFirstRep(group.targetReps));
  const [touched, setTouched] = useState(false);

  // A regra do palpite mora no `@fatia/api-client`, compartilhada com o web.
  // Calculada no render e não dentro do efeito para que as dependências sejam
  // só os dois números: os objetos de série trocam de identidade a cada refetch
  // do React Query e reescreveriam o campo por cima do que a pessoa digita.
  const prefill = prefillForNextSet({ touched, sessionLastSet, previousSessionSet: reference });
  const prefillWeight = prefill.weightKg;
  const prefillReps = prefill.reps;

  // Ajuste durante o render, e não num efeito (#187). A comparação é a **mesma**
  // que o efeito fazia no array de dependências, então o palpite é aplicado
  // exatamente nos mesmos momentos — só que antes de pintar, em vez de um quadro
  // depois. O estado anterior começa em `null/null`, e não no palpite atual, para
  // reproduzir também a passagem de montagem que o `useEffect` fazia: sem isso, o
  // card montado já com série da sessão nasceria com os campos zerados.
  const [prevPrefill, setPrevPrefill] = useState<{ weightKg: number | null; reps: number | null }>({
    weightKg: null,
    reps: null,
  });
  if (
    !Object.is(prevPrefill.weightKg, prefillWeight) ||
    !Object.is(prevPrefill.reps, prefillReps)
  ) {
    setPrevPrefill({ weightKg: prefillWeight, reps: prefillReps });
    if (prefillWeight != null) setWeight(prefillWeight);
    if (prefillReps != null) setReps(prefillReps);
  }

  const logSet = useMutation({
    mutationFn: () =>
      workoutApi.logSet(sessionId, {
        exerciseId: group.exerciseId,
        // `??` e não `||`: carga 0 é carga. Barra fixa, paralela e afins são
        // peso corporal, e um `||` gravaria `null` — o exercício nunca teria
        // histórico e a referência da próxima vez nunca apareceria. Reps 0 não
        // tem essa leitura: é campo em branco, e segue sem ser enviado.
        weightKg: weight ?? undefined,
        reps: reps || undefined,
      }),
    onSuccess: (created) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AccessibilityInfo.announceForAccessibility(
        `Série ${doneSets + 1} de ${targetSets} registrada. Descanso iniciado.`,
      );
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      rest.start();
      onAskRpe(created);
    },
  });

  const previousLabel = formatPreviousSet(reference, false);
  const referenceCells = previousCells(reference, false);

  return (
    <View className="rounded-2xl border border-border bg-card p-4">
      <View className="items-center">
        <Text className="text-[10px] font-extrabold tracking-wide text-primary">EM ANDAMENTO</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver detalhes de ${group.exerciseName}`}
          onPress={() => openDetail(group.exerciseId)}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 px-2 active:opacity-80"
        >
          <Text className="text-base font-extrabold text-foreground">{group.exerciseName}</Text>
          <Info size={14} color="#baccaf" />
        </Pressable>
        <View className="mt-1 rounded-full bg-muted px-3 py-1">
          <Text className="text-[10px] font-extrabold text-foreground">
            SÉRIE {Math.min(doneSets + 1, targetSets)} DE {targetSets}
          </Text>
        </View>
      </View>

      <View className="mt-4 flex-row gap-3">
        <Stepper
          label="CARGA (KG)"
          accessibilityLabel={`Carga em quilos para ${group.exerciseName}`}
          value={weight}
          step={1}
          onChange={(next) => {
            setTouched(true);
            setWeight(Math.max(0, next));
          }}
          hint={
            reference?.weightKg != null
              ? `Anterior: ${formatNumber(reference.weightKg)} kg`
              : prWeight != null
                ? `🏆 Recorde: ${formatNumber(prWeight)} kg`
                : undefined
          }
        />
        <Stepper
          label="REPETIÇÕES"
          accessibilityLabel={`Repetições para ${group.exerciseName}`}
          value={reps}
          step={1}
          integer
          onChange={(next) => {
            setTouched(true);
            setReps(Math.max(0, Math.round(next)));
          }}
          hint={
            reference?.reps != null
              ? `Anterior: ${reference.reps} reps`
              : prReps != null
                ? `🏆 Recorde: ${prReps} reps`
                : undefined
          }
        />
      </View>

      <RestTimer timer={rest} />

      <View className="mt-4 gap-1.5">
        <Text className="text-[10px] font-extrabold tracking-wide text-muted-foreground">
          SÉRIES REALIZADAS
        </Text>

        <View className="flex-row items-center gap-2">
          <ColumnHeader>Série</ColumnHeader>
          <ColumnHeader wide>Reps</ColumnHeader>
          <ColumnHeader wide>Carga (kg)</ColumnHeader>
          <ColumnHeader wide>RPE</ColumnHeader>
          <View className="w-10" />
        </View>

        {previousLabel ? (
          <View
            accessibilityLabel={`Última vez: ${previousLabel}`}
            className="flex-row items-center gap-2 rounded-lg border border-dashed border-border px-1 py-2"
          >
            <View className="w-10 items-center">
              <Text className="text-[10px] font-bold text-muted-foreground">ant.</Text>
            </View>
            {referenceCells.map((value, index) => (
              <View key={index} className="flex-1">
                <Text className="text-sm text-muted-foreground">{value}</Text>
              </View>
            ))}
            <View className="w-10" />
          </View>
        ) : null}

        {group.sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            index={index}
            isCardio={false}
            sessionId={sessionId}
            showDelete
            onEditRpe={onAskRpe}
          />
        ))}

        {group.sets.length === 0 ? (
          <Text className="py-2 text-xs text-muted-foreground">
            Nenhuma série registrada neste exercício ainda.
          </Text>
        ) : null}
      </View>

      <View className="mt-4 gap-2">
        <Button
          className="h-12 rounded-full"
          disabled={isComplete}
          loading={logSet.isPending}
          onPress={() => logSet.mutate()}
        >
          <Check size={16} color="#131313" />
          <Text className="text-sm font-extrabold text-primary-foreground">
            {isComplete ? 'Exercício completo' : 'Concluir série'}
          </Text>
        </Button>
        <Button variant="outline" className="h-12 rounded-full" onPress={onFinishExercise}>
          Finalizar exercício
        </Button>
      </View>
    </View>
  );
}

function ColumnHeader({ children, wide }: { children: string; wide?: boolean }) {
  return (
    <View className={wide ? 'flex-1' : 'w-10'}>
      <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">{children}</Text>
    </View>
  );
}

function Stepper({
  label,
  accessibilityLabel,
  value,
  step,
  integer,
  hint,
  onChange,
}: {
  label: string;
  accessibilityLabel: string;
  value: number;
  step: number;
  integer?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function commit() {
    const parsed = parseDecimalInput(draft);
    if (parsed != null) onChange(integer ? Math.round(parsed) : parsed);
    setEditing(false);
  }

  return (
    <View className="flex-1 rounded-xl bg-muted px-2 py-2">
      <Text className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
        {label}
      </Text>

      <View className="mt-1 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Diminuir ${accessibilityLabel}`}
          onPress={() => onChange(value - step)}
          className="h-11 w-11 items-center justify-center rounded-full bg-background active:opacity-80"
        >
          <Minus size={16} color="#e5e2e1" />
        </Pressable>

        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            returnKeyType="done"
            keyboardType={integer ? 'numeric' : 'decimal-pad'}
            accessibilityLabel={accessibilityLabel}
            className="w-16 border-0 bg-transparent px-0 text-center text-2xl font-extrabold"
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${accessibilityLabel}: ${formatNumber(value)}. Tocar para digitar`}
            onPress={() => {
              setDraft(formatNumber(value));
              setEditing(true);
            }}
            className="min-h-[44px] min-w-[56px] justify-center"
          >
            <Text className="text-center text-2xl font-extrabold text-foreground">
              {formatNumber(value)}
            </Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aumentar ${accessibilityLabel}`}
          onPress={() => onChange(value + step)}
          className="h-11 w-11 items-center justify-center rounded-full bg-background active:opacity-80"
        >
          <Plus size={16} color="#e5e2e1" />
        </Pressable>
      </View>

      {hint ? (
        <Text className="mt-1 text-center text-[10px] text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}
