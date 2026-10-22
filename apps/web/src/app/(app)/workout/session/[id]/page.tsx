'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Clock, Dumbbell } from 'lucide-react';
import { buildExerciseGroups, orderExerciseGroups, workoutApi } from '@fatia/api-client';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/elements/error-state';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { groupCardItem } from '@/components/workout/group-card-item';
import { elapsedLabel, formatInteger, pluralize, totalVolumeKg } from '@/components/workout/format';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['workout', 'session', id],
    queryFn: () => workoutApi.getSession(id),
  });

  const session = query.data;
  // O dia do treino é o título: "quarta-feira, 14 de out.".
  useTopBarTitle(
    session
      ? new Date(session.startedAt).toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        })
      : null,
  );

  if (query.isLoading) {
    return (
      <div className="space-y-3 px-5 pt-4">
        <Skeleton className="h-6 w-32 rounded bg-muted" />
        <Skeleton className="h-44 rounded-2xl bg-muted" />
        <Skeleton className="h-32 rounded-2xl bg-muted" />
      </div>
    );
  }

  // Falha de rede não é "sessão não encontrada": dizer isso faria a pessoa
  // achar que o treino sumiu. O app separa os dois casos, e aqui também.
  if (query.isError) {
    return (
      <div className="px-5 pt-4">
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar o treino"
          detail={query.error instanceof Error ? query.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="px-5 pt-4">
        <EmptyState
          title="Sessão não encontrada"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/workout">Voltar para treinos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const groups = orderExerciseGroups(
    buildExerciseGroups(session.plannedExercises, session.sets),
    session.exerciseOrder,
  );
  const totalSets = session.sets?.length ?? 0;
  const totalVolume = totalVolumeKg(session.sets);

  const dateLabel = new Date(session.startedAt).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  const durationLabel = session.completedAt
    ? elapsedLabel(session.startedAt, session.completedAt)
    : 'Em andamento';

  return (
    <div className="pb-4">
      <div className="space-y-4 px-5 pt-2">
        <div className="relative overflow-hidden rounded-2xl border border-subtle bg-card">
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
                {groups.length} {pluralize(groups.length, 'exercício', 'exercícios')} • {totalSets}{' '}
                {pluralize(totalSets, 'série', 'séries')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 border-t border-subtle px-5 py-3">
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
                  {totalVolume > 0 ? `${formatInteger(totalVolume)} kg` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {session.notes && (
          <div className="rounded-2xl border border-subtle bg-card px-4 py-3">
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground">OBSERVAÇÕES</p>
            <p className="mt-1 text-sm">{session.notes}</p>
          </div>
        )}

        <h3 className="text-base font-extrabold text-foreground">
          Exercícios{' '}
          <span className="text-sm font-bold text-muted-foreground">({groups.length})</span>
        </h3>

        <div className="space-y-3">
          {groups.map((g) => (
            <ExerciseDetailCard
              key={g.exerciseId}
              mode="readonly"
              isCardio={g.isCardio}
              sessionId={session.id}
              canDeleteSet={false}
              item={groupCardItem(g)}
              loggedSets={g.sets}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
