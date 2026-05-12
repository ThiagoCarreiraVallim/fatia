'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { workoutApi, type SessionSet } from '@/lib/api/workout';
import { ExerciseCard } from '@/components/workout/exercise-card';

function groupByExercise(sets: SessionSet[]) {
  const map = new Map<
    number,
    { exerciseId: number; exerciseName: string; isCardio: boolean; sets: SessionSet[] }
  >();
  for (const s of sets) {
    if (!map.has(s.exerciseId)) {
      map.set(s.exerciseId, {
        exerciseId: s.exerciseId,
        exerciseName: s.exercise.name,
        isCardio: s.exercise.muscleGroup === 'CARDIO',
        sets: [],
      });
    }
    map.get(s.exerciseId)!.sets.push(s);
  }
  return Array.from(map.values());
}

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
      <div className="space-y-3 p-4">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Sessão não encontrada.</p>
      </div>
    );
  }

  const groups = groupByExercise(session.sets ?? []);
  const totalSets = session.sets?.length ?? 0;
  const totalVolume =
    session.sets?.reduce((acc, s) => {
      if (s.weightKg != null && s.reps != null) return acc + s.weightKg * s.reps;
      return acc;
    }, 0) ?? 0;

  const dateLabel = new Date(session.startedAt).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link
          href="/workout/history"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold capitalize">{dateLabel}</h1>
          {session.completedAt && (
            <p className="text-xs text-muted-foreground">
              Duração: {formatDuration(session.startedAt, session.completedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-2xl font-bold tabular-nums">{totalSets}</p>
          <p className="text-xs text-muted-foreground">séries</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-2xl font-bold tabular-nums">
            {totalVolume > 0 ? Math.round(totalVolume) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">vol. kg</p>
        </div>
      </div>

      {session.notes && (
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Observações</p>
          <p className="mt-1 text-sm">{session.notes}</p>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <ExerciseCard
            key={g.exerciseId}
            exerciseId={g.exerciseId}
            exerciseName={g.exerciseName}
            isCardio={g.isCardio}
            sets={g.sets}
            sessionId={session.id}
          />
        ))}
      </div>
    </div>
  );
}
