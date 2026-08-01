'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, Timer } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workoutApi, type ExerciseGroup, type SessionSet } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { RpeModal } from './rpe-modal';
import { SetRow } from './set-row';

interface Props {
  sessionId: string;
  group: ExerciseGroup;
  onFinishExercise: () => void;
  restSeconds?: number;
}

function parseFirstRep(targetReps?: string): number {
  if (!targetReps) return 10;
  const m = targetReps.match(/\d+/);
  return m ? parseInt(m[0], 10) : 10;
}

/** Palpite para os campos da próxima série. `null` num campo = não mexer nele. */
interface SetPrefill {
  weightKg: number | null;
  reps: number | null;
}

/**
 * De onde sai o palpite de carga e repetições da próxima série.
 *
 * Gêmea de `prefillForNextSet` em
 * `apps/mobile/src/components/workout/session/format.ts` — a paridade web↔mobile
 * da sessão de treino foi auditada na #130 e é para continuar valendo.
 *
 * A ordem é: série já registrada **nesta** sessão manda, inclusive por cima do
 * que a pessoa digitou — acabou de levantar aquilo, é o sinal mais recente que
 * existe. Sem série nesta sessão, e enquanto ninguém tiver mexido nos campos,
 * vale a última série do exercício numa sessão **anterior**.
 *
 * O recorde pessoal ficou de fora de propósito (#190). Ele é a maior carga já
 * levantada na vida: propô-la na série de abertura ancora a pessoa no teto
 * justamente na série fria, e um clique em "Concluir Série" grava um PR que não
 * aconteceu — que por sua vez vira o novo teto proposto e distorce o gráfico de
 * progresso para sempre. Sem referência anterior o certo é não sugerir nada:
 * campo vazio é uma pergunta, campo com o número errado é uma resposta errada.
 * O recorde continua visível ao lado do campo, como referência.
 */
function prefillForNextSet({
  touched,
  sessionLastSet,
  previousSessionSet,
}: {
  touched: boolean;
  sessionLastSet?: SessionSet | null;
  previousSessionSet?: SessionSet | null;
}): SetPrefill {
  if (sessionLastSet) {
    return { weightKg: sessionLastSet.weightKg, reps: sessionLastSet.reps };
  }
  if (touched) return { weightKg: null, reps: null };
  return {
    weightKg: previousSessionSet?.weightKg ?? null,
    reps: previousSessionSet?.reps ?? null,
  };
}

export function ActiveExerciseCard({
  sessionId,
  group,
  onFinishExercise,
  restSeconds = 90,
}: Props) {
  const qc = useQueryClient();
  const targetSets = group.targetSets ?? Math.max(group.sets.length + 1, 3);
  const currentSetIdx = Math.min(group.sets.length, targetSets - 1);
  const isComplete = group.sets.length >= targetSets;

  const lastSet = group.sets[group.sets.length - 1];

  // A referência da vez anterior é a última série deste exercício em qualquer
  // sessão. O endpoint devolve a série mais recente **incluindo a desta
  // sessão** e o cliente compartilhado não expõe o `before`, daí as duas
  // medidas: buscar uma vez só (`staleTime: Infinity`) e descartar o que for
  // desta sessão — senão, depois da primeira série, "anterior" viraria "o que
  // acabei de fazer".
  const previous = useQuery({
    queryKey: ['workout', 'last-set', group.exerciseId],
    queryFn: () => workoutApi.getLastSet(group.exerciseId),
    staleTime: Infinity,
  });
  const reference = previous.data && previous.data.sessionId !== sessionId ? previous.data : null;

  const pr = useQuery({
    queryKey: ['workout', 'pr', group.exerciseId],
    queryFn: () => workoutApi.getPersonalRecord(group.exerciseId),
    staleTime: 60_000,
  });
  const prWeight =
    pr.data && 'weightKg' in pr.data && pr.data.weightKg != null ? pr.data.weightKg : null;
  const prReps = pr.data && 'reps' in pr.data && pr.data.reps != null ? pr.data.reps : null;

  const [weight, setWeight] = useState<number>(lastSet?.weightKg ?? 0);
  const [reps, setReps] = useState<number>(lastSet?.reps ?? parseFirstRep(group.targetReps));
  const [touched, setTouched] = useState(false);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [rpeOpen, setRpeOpen] = useState(false);
  const [pendingSet, setPendingSet] = useState<SessionSet | null>(null);

  // Calculado no render e não dentro do efeito para que as dependências sejam
  // só os dois números: os objetos de série trocam de identidade a cada refetch
  // do React Query e reescreveriam o campo por cima do que a pessoa digita.
  const prefill = prefillForNextSet({
    touched,
    sessionLastSet: lastSet,
    previousSessionSet: reference,
  });
  const prefillWeight = prefill.weightKg;
  const prefillReps = prefill.reps;

  useEffect(() => {
    if (prefillWeight != null) setWeight(prefillWeight);
    if (prefillReps != null) setReps(prefillReps);
  }, [prefillWeight, prefillReps]);

  useEffect(() => {
    if (restRemaining == null || restRemaining <= 0) return;
    const t = setInterval(() => {
      setRestRemaining((r) => (r != null ? r - 1 : null));
    }, 1000);
    return () => clearInterval(t);
  }, [restRemaining]);

  const logSet = useMutation({
    mutationFn: () =>
      workoutApi.logSet(sessionId, {
        exerciseId: group.exerciseId,
        weightKg: weight || undefined,
        reps: reps || undefined,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      setRestRemaining(restSeconds);
      setPendingSet(created);
      setRpeOpen(true);
    },
  });

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  const restProgress = restRemaining != null ? Math.max(0, restRemaining) / restSeconds : 0;

  return (
    <div className="rounded-2xl border border-white/5 bg-card">
      <div className="flex items-center justify-between px-4 pt-3">
        <button type="button" aria-label="Recolher" className="text-muted-foreground">
          <ChevronDown size={18} />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-extrabold tracking-wide text-primary">EM ANDAMENTO</p>
          <h2 className="text-base font-extrabold text-foreground">{group.exerciseName}</h2>
        </div>
        <div className="w-5" />
      </div>

      <div className="relative mx-4 mt-3 h-44 overflow-hidden rounded-xl bg-gradient-to-br from-slate-700 via-stone-800 to-stone-900">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[10px] font-extrabold text-white backdrop-blur-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          SÉRIE {Math.min(currentSetIdx + 1, targetSets)} DE {targetSets}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        <Stepper
          label="CARGA (KG)"
          value={weight}
          step={1}
          onChange={(n) => {
            setTouched(true);
            setWeight(Math.max(0, n));
          }}
          format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))}
          previous={
            lastSet?.weightKg != null
              ? `Anterior: ${lastSet.weightKg}kg`
              : reference?.weightKg != null
                ? `Anterior: ${reference.weightKg}kg`
                : prWeight != null
                  ? `🏆 Recorde: ${prWeight}kg`
                  : undefined
          }
        />
        <Stepper
          label="REPETIÇÕES"
          value={reps}
          step={1}
          onChange={(n) => {
            setTouched(true);
            setReps(Math.max(0, Math.round(n)));
          }}
          format={(n) => String(n)}
          previous={
            lastSet?.reps != null
              ? `Anterior: ${lastSet.reps} reps`
              : reference?.reps != null
                ? `Anterior: ${reference.reps} reps`
                : prReps != null
                  ? `🏆 Recorde: ${prReps} reps`
                  : undefined
          }
        />
      </div>

      <div className="mx-4 mt-4 rounded-xl bg-muted/40 px-4 py-3">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Timer size={18} />
        </div>
        <p className="mt-1 text-center text-3xl font-extrabold text-primary tabular-nums">
          {fmt(restRemaining ?? restSeconds)}
        </p>
        <p className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
          TEMPO DE DESCANSO
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-primary to-blue-500 transition-all"
            style={{ width: `${(1 - restProgress) * 100}%` }}
          />
        </div>
      </div>

      {group.sets.length > 0 && (
        <div className="mx-4 mt-4 space-y-1.5">
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
        </div>
      )}

      <div className="space-y-2 p-4">
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
        <Button
          variant="outline"
          className="h-12 w-full rounded-full text-sm font-extrabold"
          onClick={onFinishExercise}
        >
          Finalizar Exercício
        </Button>
      </div>

      <RpeModal open={rpeOpen} onOpenChange={setRpeOpen} sessionId={sessionId} set={pendingSet} />
    </div>
  );
}

function Stepper({
  label,
  value,
  step,
  onChange,
  format,
  previous,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
  previous?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEditing() {
    setDraft(format(value));
    setEditing(true);
  }

  function commit() {
    const n = Number(draft.replace(',', '.'));
    if (Number.isFinite(n)) onChange(n);
    setEditing(false);
  }

  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange(value - step)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground"
          aria-label="Diminuir"
        >
          <Minus size={14} />
        </button>
        {editing ? (
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-16 bg-transparent text-center text-2xl font-extrabold text-foreground tabular-nums outline-none"
            aria-label={label}
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="min-w-16 text-2xl font-extrabold text-foreground tabular-nums"
            aria-label={`Editar ${label}`}
          >
            {format(value)}
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(value + step)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground"
          aria-label="Aumentar"
        >
          <Plus size={14} />
        </button>
      </div>
      {previous && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground tabular-nums">
          {previous}
        </p>
      )}
    </div>
  );
}
