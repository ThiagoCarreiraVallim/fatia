'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { draftFromCircuitPlan, workoutApi } from '@fatia/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/elements/error-state';
import { CircuitEditor } from '@/components/workout/circuit/circuit-editor';

/** Editar circuito: o mesmo formulário do Novo circuito (Al-T22), já preenchido. */
export default function EditCircuitPage() {
  const { id } = useParams<{ id: string }>();
  const plan = useQuery({
    queryKey: ['workout', 'plan', id],
    queryFn: () => workoutApi.getPlan(id),
  });

  if (plan.isLoading) {
    return (
      <div className="space-y-4 px-4 pt-2">
        <Skeleton className="h-[52px] rounded-2xl bg-muted" />
        <Skeleton className="h-44 rounded-card bg-muted" />
      </div>
    );
  }
  if (plan.isError || !plan.data) {
    return (
      <div className="px-4 pt-2">
        <ErrorState
          className="max-w-none"
          title="Não foi possível abrir o circuito"
          detail={plan.error instanceof Error ? plan.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void plan.refetch()}
        />
      </div>
    );
  }
  return (
    <CircuitEditor
      key={plan.data.id}
      planId={plan.data.id}
      initial={draftFromCircuitPlan(plan.data)}
    />
  );
}
