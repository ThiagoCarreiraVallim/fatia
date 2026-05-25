'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, Timer } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workoutApi, type SessionSet } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import type { ExerciseGroup } from '@/lib/workout-session-view';
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

  const pr = useQuery({
    queryKey: ['workout', 'pr', group.exerciseId],
    queryFn: () => workoutApi.getPersonalRecord(group.exerciseId),
    staleTime: 60_000,
  });
  const prWeight =
    pr.data && 'weightKg' in pr.data && pr.data.weightKg != null ? pr.data.weightKg : null;
  const prReps = pr.data && 'reps' in pr.data && pr.data.reps != null ? pr.data.reps : null;

  const [weight, setWeight] = useState<number>(lastSet?.weightKg ?? prWeight ?? 0);
  const [reps, setReps] = useState<number>(
    lastSet?.reps ?? prReps ?? parseFirstRep(group.targetReps),
  );
  const [touched, setTouched] = useState(false);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [rpeOpen, setRpeOpen] = useState(false);
  const [pendingSet, setPendingSet] = useState<SessionSet | null>(null);

  useEffect(() => {
    if (lastSet?.weightKg != null) setWeight(lastSet.weightKg);
    if (lastSet?.reps != null) setReps(lastSet.reps);
  }, [lastSet?.id, lastSet?.weightKg, lastSet?.reps]);

  // Initialize from PR only when user hasn't touched and no sets logged yet in this session
  useEffect(() => {
    if (touched || lastSet) return;
    if (prWeight != null) setWeight(prWeight);
    if (prReps != null) setReps(prReps);
  }, [prWeight, prReps, touched, lastSet]);

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
          step={2.5}
          onChange={(n) => {
            setTouched(true);
            setWeight(Math.max(0, n));
          }}
          format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))}
          previous={
            lastSet?.weightKg != null
              ? `Anterior: ${lastSet.weightKg}kg`
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
        <span className="text-2xl font-extrabold text-foreground tabular-nums">
          {format(value)}
        </span>
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
