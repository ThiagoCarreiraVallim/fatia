'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { workoutApi, type SessionSet } from '@/lib/api/workout';
import { getRpeInfo } from '@/lib/workout/rpe';
import { RpeBadge } from './rpe-badge';

export function SetRow({
  set,
  index,
  isCardio,
  sessionId,
  showDelete,
}: {
  set: SessionSet;
  index: number;
  isCardio: boolean;
  sessionId?: string;
  showDelete: boolean;
}) {
  const editable = !!sessionId;
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: (body: Parameters<typeof workoutApi.updateSet>[2]) => {
      if (!sessionId) throw new Error('sessionId required');
      return workoutApi.updateSet(sessionId, set.id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
    },
  });

  const remove = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error('sessionId required');
      return workoutApi.deleteSet(sessionId, set.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
    },
  });

  const gridCols = showDelete
    ? 'grid-cols-[36px_1fr_1fr_1fr_32px]'
    : 'grid-cols-[40px_1fr_1fr_1fr]';

  return (
    <div className={`grid ${gridCols} items-center gap-2 text-sm`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
        {index + 1}
      </div>
      {isCardio ? (
        <>
          <DurationCell
            seconds={set.durationSeconds}
            editable={editable}
            onChange={(seconds) => update.mutate({ durationSeconds: seconds })}
          />
          <NumberCell
            value={set.distanceMeters}
            editable={editable}
            suffix="m"
            onChange={(distanceMeters) => update.mutate({ distanceMeters })}
          />
          <NumberCell
            value={set.avgHeartRate}
            editable={editable}
            onChange={(avgHeartRate) => update.mutate({ avgHeartRate })}
          />
        </>
      ) : (
        <>
          <NumberCell
            value={set.reps}
            editable={editable}
            onChange={(reps) => update.mutate({ reps })}
          />
          <NumberCell
            value={set.weightKg}
            editable={editable}
            step="0.5"
            onChange={(weightKg) => update.mutate({ weightKg })}
          />
          <RpeCell value={set.rpe} editable={editable} onChange={(rpe) => update.mutate({ rpe })} />
        </>
      )}
      {showDelete && (
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-rose-500 disabled:opacity-50"
          aria-label="Excluir série"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function NumberCell({
  value,
  editable,
  step,
  max,
  suffix,
  onChange,
}: {
  value: number | null;
  editable: boolean;
  step?: string;
  max?: number;
  suffix?: string;
  onChange: (n: number | undefined) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');

  useEffect(() => {
    setLocal(value != null ? String(value) : '');
  }, [value]);

  if (!editable) {
    return (
      <div className="text-foreground tabular-nums">
        {value != null ? `${value}${suffix ?? ''}` : '—'}
      </div>
    );
  }

  function commit() {
    if (local.trim() === '') {
      if (value != null) onChange(undefined);
      return;
    }
    const n = Number(local.replace(',', '.'));
    if (isNaN(n)) {
      setLocal(value != null ? String(value) : '');
      return;
    }
    if (max != null && n > max) {
      setLocal(value != null ? String(value) : '');
      return;
    }
    if (n !== value) onChange(n);
  }

  return (
    <Input
      value={local}
      inputMode="decimal"
      step={step}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      placeholder="—"
      className="h-9 border-white/10 bg-white/5 px-2 text-center text-sm font-bold tabular-nums backdrop-blur-sm focus-visible:border-primary/40 focus-visible:bg-white/10"
    />
  );
}

function RpeCell({
  value,
  editable,
  onChange,
}: {
  value: number | null;
  editable: boolean;
  onChange: (n: number | undefined) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');

  useEffect(() => {
    setLocal(value != null ? String(value) : '');
  }, [value]);

  if (!editable) {
    return (
      <div>
        <RpeBadge value={value} />
      </div>
    );
  }

  function commit() {
    if (local.trim() === '') {
      if (value != null) onChange(undefined);
      return;
    }
    const n = Number(local.replace(',', '.'));
    if (isNaN(n) || n < 0 || n > 10) {
      setLocal(value != null ? String(value) : '');
      return;
    }
    if (n !== value) onChange(n);
  }

  const info = getRpeInfo(value);

  return (
    <div className="relative">
      <Input
        value={local}
        inputMode="decimal"
        step="0.5"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="—"
        className="h-9 border-white/10 bg-white/5 px-2 pl-7 text-center text-sm font-bold tabular-nums backdrop-blur-sm focus-visible:border-primary/40 focus-visible:bg-white/10"
      />
      {info && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-sm leading-none"
        >
          {info.emoji}
        </span>
      )}
    </div>
  );
}

function DurationCell({
  seconds,
  editable,
  onChange,
}: {
  seconds: number | null;
  editable: boolean;
  onChange: (n: number | undefined) => void;
}) {
  function fmt(s: number | null): string {
    if (s == null) return '';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  const [local, setLocal] = useState(fmt(seconds));

  useEffect(() => {
    setLocal(fmt(seconds));
  }, [seconds]);

  if (!editable) {
    return <div className="text-foreground tabular-nums">{fmt(seconds) || '—'}</div>;
  }

  function commit() {
    if (local.trim() === '') {
      if (seconds != null) onChange(undefined);
      return;
    }
    const parts = local.split(':');
    let total: number | undefined;
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (!isNaN(m) && !isNaN(s)) total = m * 60 + s;
    } else {
      const n = parseInt(local, 10);
      if (!isNaN(n)) total = n;
    }
    if (total == null) {
      setLocal(fmt(seconds));
      return;
    }
    if (total !== seconds) onChange(total);
  }

  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      placeholder="m:ss"
      className="h-9 border-white/10 bg-white/5 px-2 text-center text-sm font-bold tabular-nums backdrop-blur-sm focus-visible:border-primary/40 focus-visible:bg-white/10"
    />
  );
}
