'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workoutApi, type SessionSet } from '@/lib/api/workout';

interface Props {
  set: SessionSet;
  sessionId: string;
}

export function StrengthSetRow({ set, sessionId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [kg, setKg] = useState(String(set.weightKg ?? ''));
  const [reps, setReps] = useState(String(set.reps ?? ''));
  const [rpe, setRpe] = useState(String(set.rpe ?? ''));

  const update = useMutation({
    mutationFn: () =>
      workoutApi.updateSet(sessionId, set.id, {
        weightKg: kg ? Number(kg) : undefined,
        reps: reps ? Number(reps) : undefined,
        rpe: rpe ? Number(rpe) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      setEditing(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => workoutApi.deleteSet(sessionId, set.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-sm">
        <span className="w-6 text-center text-xs text-muted-foreground">{set.setNumber}</span>
        <input
          className="w-16 rounded border px-1.5 py-0.5 text-center tabular-nums"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          placeholder="kg"
          type="number"
          min="0"
          step="0.5"
        />
        <input
          className="w-12 rounded border px-1.5 py-0.5 text-center tabular-nums"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="reps"
          type="number"
          min="0"
        />
        <input
          className="w-12 rounded border px-1.5 py-0.5 text-center tabular-nums"
          value={rpe}
          onChange={(e) => setRpe(e.target.value)}
          placeholder="RPE"
          type="number"
          min="0"
          max="10"
          step="0.5"
        />
        <button
          type="button"
          onClick={() => update.mutate()}
          className="rounded p-1 text-green-600 hover:text-green-700"
          aria-label="Salvar"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Cancelar"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className="w-6 text-center text-xs text-muted-foreground">{set.setNumber}</span>
      <span className="w-16 text-center tabular-nums">
        {set.weightKg != null ? `${set.weightKg}kg` : '—'}
      </span>
      <span className="w-12 text-center tabular-nums">
        {set.reps != null ? `${set.reps}×` : '—'}
      </span>
      <span className="w-12 text-center tabular-nums text-muted-foreground">
        {set.rpe != null ? `@${set.rpe}` : ''}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label="Editar série"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => remove.mutate()}
        className="rounded p-1 text-muted-foreground hover:text-rose-500"
        aria-label="Remover série"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
