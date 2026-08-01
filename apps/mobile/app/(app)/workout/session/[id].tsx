import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { workoutApi } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { ActiveSession } from '@/components/workout/session/active-session';
import { CompletedSession } from '@/components/workout/session/completed-session';

/**
 * Sessão de treino.
 *
 * A mesma rota serve os dois estados, e quem decide é `completedAt`: em
 * andamento é o `ActiveSession` de `apps/web/src/app/(app)/workout/page.tsx`;
 * concluída é `apps/web/src/app/(app)/workout/session/[id]/page.tsx`.
 *
 * No PWA são lugares diferentes porque lá a sessão ativa não tem URL própria.
 * Aqui tem — o histórico e a tela de treinos apontam para cá —, e um treino
 * termina *durante* a visita: separar em duas rotas obrigaria a navegar no meio
 * do "Finalizar".
 */
export default function WorkoutSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const session = useQuery({
    queryKey: ['workout', 'session', id],
    queryFn: () => workoutApi.getSession(id),
    // O treino muda em outro aparelho (ou pelo MCP) enquanto a tela está aberta.
    refetchOnMount: 'always',
  });

  if (session.isLoading) {
    return (
      <Screen back title="Treino">
        <LoadingState label="Carregando treino…" />
      </Screen>
    );
  }

  if (session.isError) {
    return (
      <Screen back title="Treino">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </Screen>
    );
  }

  if (!session.data) {
    return (
      <Screen back title="Treino">
        <EmptyState
          title="Sessão não encontrada."
          action={
            <Button variant="outline" size="sm" onPress={() => router.replace('/workout')}>
              Voltar para treinos
            </Button>
          }
        />
      </Screen>
    );
  }

  const props = {
    session: session.data,
    refreshing: session.isRefetching,
    onRefresh: () => void session.refetch(),
  };

  return session.data.completedAt ? <CompletedSession {...props} /> : <ActiveSession {...props} />;
}
