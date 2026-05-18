'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workoutApi, type SessionSet } from '@/lib/api/workout';
import { StrengthSetRow } from './strength-set-row';
import { CardioEntryRow } from './cardio-entry-row';

interface Props {
  exerciseId: number;
  exerciseName: string;
  isCardio: boolean;
  sets: SessionSet[];
  sessionId: string;
  /** when provided, shows the "add set" quick-form */
  active?: boolean;
  targetSets?: number;
  targetReps?: string;
}

export function ExerciseCard({
  exerciseId,
  exerciseName,
  isCardio,
  sets,
  sessionId,
  active,
  targetSets,
  targetReps,
}: Props) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // strength form state
  const [kg, setKg] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  // cardio form state
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [hr, setHr] = useState('');
  const [kcal, setKcal] = useState('');

  const logSet = useMutation({
    mutationFn: () => {
      if (isCardio) {
        const parts = duration.split(':');
        let durationSeconds: number | undefined;
        if (parts.length === 2) {
          const m = parseInt(parts[0], 10);
          const s = parseInt(parts[1], 10);
          if (!isNaN(m) && !isNaN(s)) durationSeconds = m * 60 + s;
        } else {
          const n = parseInt(duration, 10);
          if (!isNaN(n)) durationSeconds = n;
        }
        return workoutApi.logSet(sessionId, {
          exerciseId,
          durationSeconds,
          distanceMeters: distance ? Number(distance) : undefined,
          avgHeartRate: hr ? Number(hr) : undefined,
          kcalBurned: kcal ? Number(kcal) : undefined,
        });
      }
      return workoutApi.logSet(sessionId, {
        exerciseId,
        weightKg: kg ? Number(kg) : undefined,
        reps: reps ? Number(reps) : undefined,
        rpe: rpe ? Number(rpe) : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      setKg('');
      setReps('');
      setRpe('');
      setDuration('');
      setDistance('');
      setHr('');
      setKcal('');
      setShowForm(false);
    },
  });

  const hasTarget = targetSets != null && targetSets > 0;
  const completed = hasTarget && sets.length >= (targetSets as number);

  return (
    <div
      className={`rounded-lg border bg-card p-3 ${completed ? 'border-primary/40' : ''}`}
      data-completed={completed ? 'true' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate font-medium">{exerciseName}</h3>
          {completed && (
            <Check size={14} className="shrink-0 text-primary" aria-label="Exercício completo" />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasTarget && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {sets.length}/{targetSets} séries{targetReps ? ` · ${targetReps} reps` : ''}
            </span>
          )}
          {active && (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Adicionar série"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>

      {/* column headers */}
      {sets.length > 0 && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-6 text-center">#</span>
          {isCardio ? (
            <>
              <span className="w-16 text-center">Duração</span>
              <span className="w-16 text-center">Distância</span>
            </>
          ) : (
            <>
              <span className="w-16 text-center">Kg</span>
              <span className="w-12 text-center">Reps</span>
              <span className="w-12 text-center">RPE</span>
            </>
          )}
        </div>
      )}

      <div className="divide-y">
        {sets.map((s) =>
          isCardio ? (
            <CardioEntryRow key={s.id} set={s} sessionId={sessionId} />
          ) : (
            <StrengthSetRow key={s.id} set={s} sessionId={sessionId} />
          ),
        )}
      </div>

      {showForm && active && (
        <div className="mt-2 border-t pt-2">
          {isCardio ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                className="w-20 rounded border px-2 py-1 text-center tabular-nums"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="mm:ss"
              />
              <input
                className="w-20 rounded border px-2 py-1 text-center tabular-nums"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="metros"
                type="number"
                min="0"
              />
              <input
                className="w-16 rounded border px-2 py-1 text-center tabular-nums"
                value={hr}
                onChange={(e) => setHr(e.target.value)}
                placeholder="bpm"
                type="number"
                min="0"
              />
              <input
                className="w-16 rounded border px-2 py-1 text-center tabular-nums"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                placeholder="kcal"
                type="number"
                min="0"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <input
                className="w-20 rounded border px-2 py-1 text-center tabular-nums"
                value={kg}
                onChange={(e) => setKg(e.target.value)}
                placeholder="kg"
                type="number"
                min="0"
                step="0.5"
              />
              <input
                className="w-16 rounded border px-2 py-1 text-center tabular-nums"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="reps"
                type="number"
                min="0"
              />
              <input
                className="w-16 rounded border px-2 py-1 text-center tabular-nums"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
                placeholder="RPE"
                type="number"
                min="0"
                max="10"
                step="0.5"
              />
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => logSet.mutate()}
              disabled={logSet.isPending}
              className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Registrar
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
