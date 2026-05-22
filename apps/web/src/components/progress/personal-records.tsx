'use client';

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Trophy, Dumbbell, Footprints, ChevronRight } from 'lucide-react';
import { workoutApi, type SessionSet } from '@/lib/api/workout';

const TOP_N = 3;

// PR retornado pelo endpoint: para força tem `weightKg/reps/sessionDate`,
// para cardio tem `distanceMeters/durationSeconds/sessionDate`. Detectamos pelo shape.
type StrengthPR = { weightKg: number | null; reps: number | null; sessionDate: string };
type CardioPR = {
  distanceMeters: number | null;
  durationSeconds: number | null;
  sessionDate: string | null;
};
type AnyPR = StrengthPR | CardioPR | null;

function isCardioPR(pr: NonNullable<AnyPR>): pr is CardioPR {
  return 'durationSeconds' in pr;
}

interface UsedExercise {
  id: number;
  name: string;
  muscleGroup: string;
  isCardio: boolean;
  lastSeen: string;
}

export function PersonalRecords() {
  const sessions = useQuery({
    queryKey: ['workout', 'sessions', 'recent'],
    queryFn: () => workoutApi.listSessions({ limit: 20 }),
  });

  const topExercises: UsedExercise[] = useMemo(() => {
    if (!sessions.data) return [];
    const counts = new Map<number, UsedExercise & { count: number }>();
    for (const session of sessions.data) {
      for (const set of session.sets ?? []) {
        const ex = (set as SessionSet).exercise;
        if (!ex) continue;
        const cur = counts.get(ex.id);
        if (cur) {
          cur.count++;
          if (session.startedAt > cur.lastSeen) cur.lastSeen = session.startedAt;
        } else {
          counts.set(ex.id, {
            id: ex.id,
            name: ex.name,
            muscleGroup: ex.muscleGroup,
            isCardio: ex.muscleGroup === 'cardio',
            lastSeen: session.startedAt,
            count: 1,
          });
        }
      }
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, TOP_N)
      .map(({ count: _c, ...rest }) => rest);
  }, [sessions.data]);

  const prs = useQueries({
    queries: topExercises.map((ex) => ({
      queryKey: ['workout', 'pr', ex.id],
      queryFn: () => workoutApi.getPersonalRecord(ex.id),
    })),
  });

  const loading = sessions.isLoading || prs.some((q) => q.isLoading);

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Trophy size={16} className="text-blue-400" />
        Recordes Pessoais
      </h3>

      {loading && (
        <>
          <div className="h-16 animate-pulse rounded-2xl bg-muted/40" />
          <div className="h-16 animate-pulse rounded-2xl bg-muted/40" />
        </>
      )}

      {!loading && topExercises.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-card/30 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Logue treinos para ver seus recordes pessoais.
          </p>
        </div>
      )}

      {!loading &&
        topExercises.map((ex, idx) => {
          const pr = prs[idx]?.data as AnyPR;
          return <PrRow key={ex.id} exercise={ex} pr={pr} />;
        })}

      {!loading && topExercises.length > 0 && (
        <Link
          href="/workout/history"
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/5 bg-card py-3 text-sm font-bold text-foreground"
        >
          Ver histórico de treino
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

function PrRow({ exercise, pr }: { exercise: UsedExercise; pr: AnyPR }) {
  const isCardio = exercise.isCardio;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card p-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {isCardio ? (
          <Footprints size={18} className="text-blue-400" />
        ) : (
          <Dumbbell size={18} className="text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{exercise.name}</p>
        <p className="text-xs text-muted-foreground">
          {isCardio ? 'Cardio' : 'Força'} • {exercise.muscleGroup}
        </p>
      </div>
      <div className="text-right">{pr ? <PrValue isCardio={isCardio} pr={pr} /> : <Empty />}</div>
    </div>
  );
}

function PrValue({ isCardio, pr }: { isCardio: boolean; pr: NonNullable<AnyPR> }) {
  if (isCardio && isCardioPR(pr)) {
    const duration = pr.durationSeconds ?? 0;
    const min = Math.floor(duration / 60);
    const sec = duration % 60;
    const distance =
      pr.distanceMeters !== null ? `${(pr.distanceMeters / 1000).toFixed(2)} km` : null;
    return (
      <>
        <p className="text-lg font-extrabold text-blue-400 tabular-nums">
          {min}:{sec.toString().padStart(2, '0')}
        </p>
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
          {distance ?? 'TEMPO'}
        </p>
      </>
    );
  }
  // Strength PR
  if (!isCardio && !isCardioPR(pr)) {
    return (
      <>
        <p className="text-lg font-extrabold text-primary tabular-nums">
          {pr.weightKg ?? '—'} <span className="text-sm">kg</span>
        </p>
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
          {pr.reps ? `${pr.reps} reps` : 'PR'}
        </p>
      </>
    );
  }
  return <Empty />;
}

function Empty() {
  return <p className="text-xs text-muted-foreground">—</p>;
}
