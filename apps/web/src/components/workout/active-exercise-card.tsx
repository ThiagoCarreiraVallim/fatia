'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, Timer } from 'lucide-react';
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
import { RpeModal } from './rpe-modal';
import { SetRow } from './set-row';

interface Props {
  sessionId: string;
  /** Início da sessão em ISO. Recorta o histórico no que veio **antes** dela. */
  sessionStartedAt: string;
  group: ExerciseGroup;
  onFinishExercise: () => void;
  restSeconds?: number;
}

function parseFirstRep(targetReps?: string): number {
  if (!targetReps) return 10;
  const m = targetReps.match(/\d+/);
  return m ? parseInt(m[0], 10) : 10;
}

export function ActiveExerciseCard({
  sessionId,
  sessionStartedAt,
  group,
  onFinishExercise,
  restSeconds = 90,
}: Props) {
  const qc = useQueryClient();
  const targetSets = group.targetSets ?? Math.max(group.sets.length + 1, 3);
  const currentSetIdx = Math.min(group.sets.length, targetSets - 1);
  const isComplete = group.sets.length >= targetSets;

  const lastSet = group.sets[group.sets.length - 1];

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
  const hint = prescription && group.sets.length === 0 ? describePrescription(prescription) : null;
  // O descanso prescrito ganha do padrão da tela: 180s depois de uma tripla
  // pesada e 60s depois de rosca direta não são a mesma pausa.
  const restTarget = prescription?.restSeconds ?? restSeconds;

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
      setRestRemaining(restTarget);
      setPendingSet(created);
      setRpeOpen(true);
    },
  });

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  const restProgress = restRemaining != null ? Math.max(0, restRemaining) / restTarget : 0;

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
            reference?.weightKg != null
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
            reference?.reps != null
              ? `Anterior: ${reference.reps} reps`
              : prReps != null
                ? `🏆 Recorde: ${prReps} reps`
                : undefined
          }
        />
      </div>

      {hint && (
        <p className="mx-4 mt-2 text-center text-[10px] text-muted-foreground">
          <span className="font-bold text-primary">{hint.label}</span>
          <span className="ml-1">— {hint.reason}</span>
        </p>
      )}

      <div className="mx-4 mt-4 rounded-xl bg-muted/40 px-4 py-3">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Timer size={18} />
        </div>
        <p className="mt-1 text-center text-3xl font-extrabold text-primary tabular-nums">
          {fmt(restRemaining ?? restTarget)}
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
