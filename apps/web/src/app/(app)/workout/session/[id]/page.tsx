'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Clock, Dumbbell } from 'lucide-react';
import { workoutApi } from '@/lib/api/workout';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { buildExerciseGroups } from '@/lib/workout-session-view';

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['workout', 'session', id],
    queryFn: () => workoutApi.getSession(id),
  });

  const session = query.data;

  if (query.isLoading) {
    return (
      <div className="space-y-3 px-5 pt-4">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-44 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!session) {
    return <p className="px-5 pt-4 text-sm text-muted-foreground">Sessão não encontrada.</p>;
  }

  const groups = buildExerciseGroups(session.plannedExercises, session.sets);
  const totalSets = session.sets?.length ?? 0;
  const totalVolume =
    session.sets?.reduce((acc, s) => {
      if (s.weightKg != null && s.reps != null) return acc + s.weightKg * s.reps;
      return acc;
    }, 0) ?? 0;

  const dateLabel = new Date(session.startedAt).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  const durationLabel = session.completedAt
    ? formatDuration(session.startedAt, session.completedAt)
    : 'Em andamento';

  return (
    <div className="pb-4">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-background/90 px-4 backdrop-blur">
        <Link
          href="/workout/history"
          aria-label="Voltar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-base font-bold capitalize text-foreground">{dateLabel}</h1>
        <div className="w-9" />
      </header>

      <div className="space-y-4 px-5 pt-2">
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card">
          <div className="relative h-44 w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-stone-800 to-stone-900" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute left-4 right-4 top-4 flex gap-2">
              <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                CONCLUÍDO
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h2 className="text-2xl font-extrabold capitalize text-white">{dateLabel}</h2>
              <p className="mt-1 text-xs text-white/70">
                {groups.length} exercício{groups.length !== 1 ? 's' : ''} • {totalSets} série
                {totalSets !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 border-t border-white/5 px-5 py-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-primary" />
              <div>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground">Duração</p>
                <p className="text-sm font-extrabold text-foreground tabular-nums">
                  {durationLabel}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dumbbell size={14} className="text-primary" />
              <div>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground">Volume</p>
                <p className="text-sm font-extrabold text-foreground tabular-nums">
                  {totalVolume > 0 ? `${Math.round(totalVolume)} kg` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {session.notes && (
          <div className="rounded-2xl border border-white/5 bg-card px-4 py-3">
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground">OBSERVAÇÕES</p>
            <p className="mt-1 text-sm">{session.notes}</p>
          </div>
        )}

        <h3 className="text-base font-extrabold text-foreground">
          Exercícios{' '}
          <span className="text-sm font-bold text-muted-foreground">({groups.length})</span>
        </h3>

        <div className="space-y-3">
          {groups.map((g) => {
            const muscle = g.sets[0]?.exercise?.muscleGroup ?? 'outros';
            return (
              <ExerciseDetailCard
                key={g.exerciseId}
                mode="readonly"
                isCardio={g.isCardio}
                sessionId={session.id}
                canDeleteSet={false}
                item={{
                  id: String(g.exerciseId),
                  exercise: {
                    id: g.exerciseId,
                    name: g.exerciseName,
                    muscleGroup: muscle,
                    source: 'SEED',
                    createdByUserId: null,
                  },
                  targetSets: g.targetSets ?? g.sets.length,
                  targetReps: g.targetReps ?? '—',
                }}
                loggedSets={g.sets}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
