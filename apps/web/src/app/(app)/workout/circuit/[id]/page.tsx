'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ApiError,
  workoutApi,
  type CircuitSessionData,
  type WorkoutSession,
} from '@fatia/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/elements/error-state';
import { CircuitRun } from '@/components/workout/circuit/circuit-run';

const isCircuit = (s: WorkoutSession): s is WorkoutSession & { circuit: CircuitSessionData } =>
  s.circuit != null && s.circuit.version === 1;

/**
 * O relógio do circuito de uma sessão (#380). Sessão já encerrada vai para o
 * "Treino feito"; sessão que não é circuito, para o treino em andamento.
 */
export default function CircuitRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['workout', 'session', id],
    queryFn: () => workoutApi.getSession(id),
    // Os toques vivem na tela; recarregar no foco apagaria um toque ainda em voo.
    refetchOnWindowFocus: false,
  });
  const session = query.data;
  const redirect = !session
    ? null
    : session.completedAt
      ? `/workout/session/${session.id}`
      : !isCircuit(session)
        ? '/workout'
        : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (query.isLoading) {
    return (
      <div className="space-y-4 px-4 pt-4">
        <Skeleton className="h-11 rounded-full bg-muted" />
        <Skeleton className="h-40 rounded-[24px] bg-muted" />
        <Skeleton className="h-60 rounded-[20px] bg-muted" />
      </div>
    );
  }
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (query.isError && !notFound) {
    return (
      <div className="px-4 pt-4">
        <ErrorState
          className="max-w-none"
          title="Não foi possível abrir o circuito"
          detail={query.error instanceof Error ? query.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="px-4 pt-4">
        <EmptyState
          title="Circuito não encontrado"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/workout/plans?tab=circuitos">Ver circuitos</Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (redirect || !isCircuit(session)) return null;
  return <CircuitRun key={session.id} session={session} />;
}
