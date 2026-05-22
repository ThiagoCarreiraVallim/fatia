'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import { workoutApi, type WorkoutSession } from '@/lib/api/workout';

function formatDuration(start: string, end?: string): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function SessionRow({ session }: { session: WorkoutSession }) {
  const sets = session.sets ?? [];
  const uniqueExercises = new Set(sets.map((s) => s.exerciseId)).size;
  const totalVolume = sets.reduce((acc, s) => {
    if (s.weightKg != null && s.reps != null) return acc + s.weightKg * s.reps;
    return acc;
  }, 0);

  const dateLabel = new Date(session.startedAt).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <Link
      href={`/workout/session/${session.id}`}
      className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card p-4"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
        <Dumbbell size={20} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-base font-bold capitalize text-foreground">{dateLabel}</p>
        <p className="text-xs text-muted-foreground">
          {uniqueExercises} exercício{uniqueExercises !== 1 ? 's' : ''} · {sets.length} série
          {sets.length !== 1 ? 's' : ''}
          {totalVolume > 0 ? ` · ${Math.round(totalVolume)}kg` : ''}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatDuration(session.startedAt, session.completedAt ?? undefined)}
        </p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default function WorkoutHistoryPage() {
  const sessions = useQuery({
    queryKey: ['workout', 'sessions'],
    queryFn: () => workoutApi.listSessions({ limit: 50 }),
  });

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header className="flex items-center gap-3">
        <Link
          href="/workout"
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-3xl font-extrabold text-foreground">Histórico</h1>
      </header>

      {sessions.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {sessions.data && sessions.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum treino registrado ainda.</p>
      )}

      <div className="space-y-2">
        {sessions.data?.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </div>
    </div>
  );
}
