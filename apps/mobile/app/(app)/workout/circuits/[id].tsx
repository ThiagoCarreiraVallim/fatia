import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { draftFromCircuitPlan, workoutApi } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { ErrorState, LoadingState } from '@/components/ui';
import { CircuitEditor } from '@/components/workout/circuit/circuit-editor';

/** Editar circuito: o formulário do Novo circuito (Al-T22) já preenchido. */
export default function EditCircuitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const plan = useQuery({
    queryKey: ['workout', 'plan', id],
    queryFn: () => workoutApi.getPlan(id),
  });
  if (plan.isLoading) {
    return (
      <Screen>
        <LoadingState label="Abrindo o circuito…" />
      </Screen>
    );
  }
  if (plan.isError || !plan.data) {
    return (
      <Screen>
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      </Screen>
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
