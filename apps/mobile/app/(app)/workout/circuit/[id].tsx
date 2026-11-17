import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { workoutApi, type CircuitSessionData, type WorkoutSession } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { CircuitRun } from '@/components/workout/circuit/circuit-run';

const isCircuit = (s: WorkoutSession): s is WorkoutSession & { circuit: CircuitSessionData } =>
  s.circuit != null && s.circuit.version === 1;

/**
 * O relógio do circuito de uma sessão (#380). Réplica de
 * `apps/web/src/app/(app)/workout/circuit/[id]/page.tsx`: encerrada vai para o
 * "Treino feito"; sessão que não é circuito, para a sessão de séries.
 */
export default function CircuitRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useQuery({
    queryKey: ['workout', 'session', id],
    queryFn: () => workoutApi.getSession(id),
    // Os toques vivem na tela; recarregar apagaria um toque ainda em voo.
    refetchOnWindowFocus: false,
  });

  if (session.isLoading) {
    return (
      <Screen>
        <LoadingState label="Abrindo o circuito…" />
      </Screen>
    );
  }
  if (session.isError) {
    return (
      <Screen>
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </Screen>
    );
  }
  const data = session.data;
  if (!data) {
    return (
      <Screen>
        <EmptyState
          title="Circuito não encontrado."
          action={
            <Button
              variant="outline"
              size="sm"
              onPress={() => router.replace('/workout/plans?tab=circuitos' as Href)}
            >
              Ver circuitos
            </Button>
          }
        />
      </Screen>
    );
  }
  if (data.completedAt || !isCircuit(data)) {
    return <Redirect href={`/workout/session/${data.id}` as Href} />;
  }
  return <CircuitRun key={data.id} session={data} />;
}
