'use client';

import { useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  describePrescription,
  prefillForNextSet,
  workoutApi,
  type ExerciseGroup,
  type LoadPrescription,
  type SessionSet,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { ExerciseTitle } from './exercise-title';
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
import { DEFAULT_REST_SECONDS, type RestTimer as RestTimerState } from './use-rest-timer';

/**
 * Card do exercício de força em foco na sessão.
 *
 * O descanso e o pedido de RPE são da página, não do card (ver
 * `use-rest-timer.ts`): ao registrar a última série o foco passa para o próximo
 * exercício e este card desmonta. Com os dois aqui dentro, o descanso zerava e
 * o drawer de RPE da última série sumia antes de a pessoa responder — o app já
 * tinha subido os dois para a tela, e o PWA segue o mesmo desenho.
 */
interface Props {
  sessionId: string;
  /** Início da sessão em ISO. Recorta o histórico no que veio **antes** dela. */
  sessionStartedAt: string;
  group: ExerciseGroup;
  rest: RestTimerState;
  onFinishExercise: () => void;
  /** Pede o RPE da série recém-registrada. */
  onAskRpe: (set: SessionSet) => void;
  /** Frase para o leitor de tela quando a série é registrada. */
  onAnnounce?: (message: string) => void;
}

export function ActiveExerciseCard({
  sessionId,
  sessionStartedAt,
  group,
  rest,
  onFinishExercise,
  onAskRpe,
  onAnnounce,
}: Props) {
  const qc = useQueryClient();
  const targetSets = targetSetsOf(group);
  const doneSets = group.sets.length;
  const isComplete = doneSets >= targetSets;

  const lastSet = group.sets[doneSets - 1];

  // A referência é a última série deste exercício **antes** desta sessão. O
  // recorte é do servidor, via `before`: filtrar no cliente exigiria manter a
  // resposta em cache para sempre e, quando o cache expirasse no meio do
  // treino, a única candidata seria a série de hoje — que o filtro descartaria,
  // fazendo a referência sumir sozinha.
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

  // A prescrição depende da faixa alvo do exercício no plano, que esta tela já
  // tem — por isso ela vai na chave do cache junto com o id.
  const prescriptionQuery = useQuery({
    queryKey: ['workout', 'prescription', group.exerciseId, group.targetReps],
    queryFn: () => workoutApi.getPrescription(group.exerciseId, group.targetReps),
    staleTime: 60_000,
  });
  // O tipo é anotado à mão: sem ele, o `data` chega ao teste de `status` como
  // inferência ainda pendente do `useQuery` e o TypeScript não estreita a
  // união — a anotação é o que faz `status: 'ok'` valer como discriminante.
  const prescribed: LoadPrescription | undefined = prescriptionQuery.data;
  const prescription = prescribed?.status === 'ok' ? prescribed : null;
  // A sugestão sai da tela assim que existe série **desta** sessão: o
  // `prefillForNextSet` dá precedência a ela, e a prescrição parte da última
  // sessão concluída. Manter o texto seria contradizer o campo — 70 kg × 8 no
  // stepper e "Sugestão: 62,5 kg × 8" logo abaixo.
  const hint = prescription && doneSets === 0 ? describePrescription(prescription) : null;
  // O descanso prescrito ganha do padrão da tela: 180s depois de uma tripla
  // pesada e 60s depois de rosca direta não são a mesma pausa.
  const restTarget = prescription?.restSeconds ?? DEFAULT_REST_SECONDS;

  const [weight, setWeight] = useState<number>(lastSet?.weightKg ?? 0);
  const [reps, setReps] = useState<number>(lastSet?.reps ?? parseFirstRep(group.targetReps));
  const [touched, setTouched] = useState(false);

  // Calculado no render e não dentro do efeito para que as dependências sejam
  // só os dois números: os objetos de série trocam de identidade a cada refetch
  // do React Query e reescreveriam o campo por cima do que a pessoa digita.
  const prefill = prefillForNextSet({
    touched,
    sessionLastSet: lastSet,
    previousSessionSet: reference,
    prescription,
  });
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
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      onAnnounce?.(`Série ${doneSets + 1} de ${targetSets} registrada. Descanso iniciado.`);
      rest.start(restTarget);
      onAskRpe(created);
    },
  });

  const previousLabel = formatPreviousSet(reference, false);
  const referenceCells = previousCells(reference, false);

  return (
    <div className="rounded-2xl border border-subtle bg-card p-4">
      {/* Nome, "Como fazer" e a série logo abaixo, como no app. A faixa de
          176px com gradiente que segurava o "SÉRIE 1 DE 3" empurrava os
          steppers e o descanso para fora da primeira tela do celular. */}
      <div className="flex flex-col items-center">
        <ExerciseTitle
          kicker="EM ANDAMENTO"
          exerciseId={group.exerciseId}
          exerciseName={group.exerciseName}
        />
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[10px] font-extrabold text-foreground">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          SÉRIE {Math.min(doneSets + 1, targetSets)} DE {targetSets}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stepper
          label="CARGA (KG)"
          accessibleLabel={`carga em quilos para ${group.exerciseName}`}
          value={weight}
          step={1}
          onChange={(n) => {
            setTouched(true);
            setWeight(Math.max(0, n));
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
          accessibleLabel={`repetições para ${group.exerciseName}`}
          value={reps}
          step={1}
          integer
          onChange={(n) => {
            setTouched(true);
            setReps(Math.max(0, Math.round(n)));
          }}
          hint={
            reference?.reps != null
              ? `Anterior: ${reference.reps} reps`
              : prReps != null
                ? `🏆 Recorde: ${prReps} reps`
                : undefined
          }
        />
      </div>

      {hint && (
        <div className="mt-2 text-center text-[10px]">
          <p className="font-bold text-primary">{hint.label}</p>
          <p className="text-muted-foreground">{hint.reason}</p>
        </div>
      )}

      <div className="mt-4">
        <RestTimer timer={rest} idleSeconds={restTarget} />
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-[10px] font-extrabold tracking-wide text-muted-foreground">
          SÉRIES REALIZADAS
        </p>
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_32px] gap-2 text-[10px] font-bold tracking-wide text-muted-foreground">
          <div>Série</div>
          <div>Reps</div>
          <div>Carga (kg)</div>
          <div>RPE</div>
          <div />
        </div>

        {/* A última vez, na mesma grade das séries de hoje: comparar coluna a
            coluna é mais rápido que ler "Anterior" embaixo de cada stepper. */}
        {previousLabel && (
          <div
            aria-label={`Última vez: ${previousLabel}`}
            role="group"
            className="grid grid-cols-[36px_1fr_1fr_1fr_32px] items-center gap-2 rounded-lg border border-dashed border-subtle py-2 text-sm text-muted-foreground tabular-nums"
          >
            <div aria-hidden className="text-center text-[10px] font-bold">
              ant.
            </div>
            {referenceCells.map((value, index) => (
              <div key={index} aria-hidden className="px-2">
                {value}
              </div>
            ))}
            <div />
          </div>
        )}

        {group.sets.map((s, idx) => (
          <SetRow
            key={s.id}
            set={s}
            index={idx}
            isCardio={group.isCardio}
            sessionId={sessionId}
            showDelete
          />
        ))}

        {group.sets.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">
            Nenhuma série registrada neste exercício ainda.
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Button
          className="h-12 w-full rounded-full text-sm font-extrabold shadow-[0_0_20px_hsl(var(--primary)/0.45)]"
          onClick={() => logSet.mutate()}
          disabled={logSet.isPending || isComplete}
        >
          <Check size={16} className="mr-1.5" />
          {logSet.isPending
            ? 'Registrando...'
            : isComplete
              ? 'Exercício completo'
              : 'Concluir Série'}
        </Button>
        {logSet.isError && (
          <p role="alert" className="text-center text-xs text-danger">
            Não foi possível registrar a série
            {logSet.error instanceof Error ? `: ${logSet.error.message}` : '.'}
          </p>
        )}
        <Button
          variant="outline"
          className="h-12 w-full rounded-full text-sm font-extrabold"
          onClick={onFinishExercise}
        >
          Finalizar Exercício
        </Button>
      </div>
    </div>
  );
}

/**
 * Campo de número com `−`/`+` e toque no valor para digitar.
 *
 * Os rótulos nomeiam o exercício ("Aumentar carga em quilos para Supino"), como
 * no app: dois "Aumentar" idênticos na mesma tela não dizem a quem usa leitor de
 * tela qual dos dois está sob o foco. Alvos de 44px pelo mesmo motivo do
 * descanso — a mão que toca acabou de largar a barra.
 */
function Stepper({
  label,
  accessibleLabel,
  value,
  step,
  integer,
  onChange,
  hint,
}: {
  label: string;
  /** Em minúscula: entra no meio de "Aumentar …" e "Editar …". */
  accessibleLabel: string;
  value: number;
  step: number;
  integer?: boolean;
  onChange: (n: number) => void;
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEditing() {
    setDraft(formatNumber(value));
    setEditing(true);
  }

  function commit() {
    const parsed = parseDecimalInput(draft);
    if (parsed != null) onChange(integer ? Math.round(parsed) : parsed);
    setEditing(false);
  }

  return (
    <div className="rounded-xl bg-muted/40 px-2 py-2">
      <p className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange(value - step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-foreground hover:bg-accent"
          aria-label={`Diminuir ${accessibleLabel}`}
        >
          <Minus size={16} />
        </button>
        {editing ? (
          <input
            autoFocus
            type="text"
            inputMode={integer ? 'numeric' : 'decimal'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-16 bg-transparent text-center text-2xl font-extrabold text-foreground tabular-nums outline-none"
            aria-label={`Valor de ${accessibleLabel}`}
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="min-h-11 min-w-14 text-2xl font-extrabold text-foreground tabular-nums"
            aria-label={`Editar ${accessibleLabel}: ${formatNumber(value)}`}
          >
            {formatNumber(value)}
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(value + step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-foreground hover:bg-accent"
          aria-label={`Aumentar ${accessibleLabel}`}
        >
          <Plus size={16} />
        </button>
      </div>
      {hint && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground tabular-nums">{hint}</p>
      )}
    </div>
  );
}
