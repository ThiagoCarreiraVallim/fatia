'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
      className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 hover:bg-accent"
    >
      <div>
        <p className="text-sm font-medium capitalize">{dateLabel}</p>
        <p className="text-xs text-muted-foreground">
          {uniqueExercises} exercício{uniqueExercises !== 1 ? 's' : ''} · {sets.length} série
          {sets.length !== 1 ? 's' : ''}
          {totalVolume > 0 ? ` · ${Math.round(totalVolume)}kg` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-xs">
          {formatDuration(session.startedAt, session.completedAt ?? undefined)}
        </span>
        <ChevronRight size={16} />
      </div>
    </Link>
  );
}

export default function WorkoutHistoryPage() {
  const sessions = useQuery({
    queryKey: ['workout', 'sessions'],
    queryFn: () => workoutApi.listSessions({ limit: 50 }),
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link
          href="/workout"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold">Histórico</h1>
      </div>

      {sessions.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
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
