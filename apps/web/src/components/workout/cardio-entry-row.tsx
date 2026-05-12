'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workoutApi, type SessionSet } from '@/lib/api/workout';

interface Props {
  set: SessionSet;
  sessionId: string;
}

function secondsToMmss(s: number | null): string {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function mmssToSeconds(v: string): number | undefined {
  const parts = v.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

export function CardioEntryRow({ set, sessionId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [duration, setDuration] = useState(secondsToMmss(set.durationSeconds));
  const [distance, setDistance] = useState(
    set.distanceMeters != null ? String(set.distanceMeters) : '',
  );
  const [hr, setHr] = useState(set.avgHeartRate != null ? String(set.avgHeartRate) : '');
  const [kcal, setKcal] = useState(set.kcalBurned != null ? String(set.kcalBurned) : '');

  const update = useMutation({
    mutationFn: () =>
      workoutApi.updateSet(sessionId, set.id, {
        durationSeconds: mmssToSeconds(duration),
        distanceMeters: distance ? Number(distance) : undefined,
        avgHeartRate: hr ? Number(hr) : undefined,
        kcalBurned: kcal ? Number(kcal) : undefined,
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

  const distKm = set.distanceMeters != null ? (set.distanceMeters / 1000).toFixed(2) + 'km' : null;

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        <span className="w-6 text-center text-xs text-muted-foreground">{set.setNumber}</span>
        <input
          className="w-16 rounded border px-1.5 py-0.5 text-center tabular-nums"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="mm:ss"
        />
        <input
          className="w-16 rounded border px-1.5 py-0.5 text-center tabular-nums"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          placeholder="m"
          type="number"
          min="0"
        />
        <input
          className="w-12 rounded border px-1.5 py-0.5 text-center tabular-nums"
          value={hr}
          onChange={(e) => setHr(e.target.value)}
          placeholder="bpm"
          type="number"
          min="0"
        />
        <input
          className="w-14 rounded border px-1.5 py-0.5 text-center tabular-nums"
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder="kcal"
          type="number"
          min="0"
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
        {secondsToMmss(set.durationSeconds) || '—'}
      </span>
      <span className="w-16 text-center tabular-nums text-muted-foreground">{distKm ?? '—'}</span>
      {set.avgHeartRate != null && (
        <span className="text-xs text-muted-foreground">{set.avgHeartRate}bpm</span>
      )}
      {set.kcalBurned != null && (
        <span className="text-xs text-muted-foreground">{set.kcalBurned}kcal</span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label="Editar entrada"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => remove.mutate()}
        className="rounded p-1 text-muted-foreground hover:text-rose-500"
        aria-label="Remover entrada"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
