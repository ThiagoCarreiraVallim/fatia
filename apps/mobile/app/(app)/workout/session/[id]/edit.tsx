import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import {
  buildExerciseGroups,
  markEndedExercises,
  moveExerciseInOrder,
  orderExerciseGroups,
  workoutApi,
  type WorkoutSession,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Text } from '@/components/ui/text';
import {
  Button,
  ConfirmDrawer,
  DrawerLayer,
  ErrorState,
  LoadingState,
  useConfirm,
  useToast,
} from '@/components/ui';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import {
  SessionExerciseCard,
  useSessionExerciseActions,
} from '@/components/workout/session/session-exercise-card';
import { useCancelSession } from '@/components/workout/session/use-cancel-session';
import { useFinishSession } from '@/components/workout/session/use-finish-session';
import {
  useEndedExercises,
  useFocusRequest,
  usePendingExercises,
} from '@/components/workout/session/use-pending-exercises';
import { colors } from '@/theme/colors';

/**
 * "Treino atual" (prancha `Al-T17-Editar-sessao`, #377): todos os exercícios
 * da sessão com as séries, para corrigir uma série, somar outra ("+ Série",
 * copiando a última), mudar a ordem (só desta sessão), tirar um exercício só
 * de hoje ou pôr outro. "Voltar ao
 * treino" leva à sessão guiada, já no exercício escolhido.
 */
export default function SessionOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useQuery({
    queryKey: ['workout', 'session', id],
    queryFn: () => workoutApi.getSession(id),
  });

  if (session.isLoading) {
    return (
      <Screen title="Treino atual">
        <LoadingState label="Carregando treino…" />
      </Screen>
    );
  }
  if (session.isError || !session.data) {
    return (
      <Screen title="Treino atual">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </Screen>
    );
  }
  return <Overview session={session.data} refreshing={session.isRefetching} />;
}

function Overview({ session, refreshing }: { session: WorkoutSession; refreshing: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const finish = useFinishSession(session.id);
  const cancel = useCancelSession(session.id);
  const { pending, add } = usePendingExercises(session.id);
  // Encerrado na sessão guiada (#473): aqui também conta como feito.
  const { ended } = useEndedExercises(session.id);
  const { request: requestFocus } = useFocusRequest(session.id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState<{ exerciseId: number; index: number } | null>(null);

  const groups = useMemo(
    () =>
      markEndedExercises(
        orderExerciseGroups(
          buildExerciseGroups(session.plannedExercises, session.sets, pending),
          session.exerciseOrder,
        ),
        ended,
      ),
    [session.plannedExercises, session.sets, session.exerciseOrder, pending, ended],
  );

  function backToSession(exerciseId?: number) {
    if (exerciseId != null) requestFocus(exerciseId);
    if (router.canGoBack()) router.back();
    else router.replace(`/workout/session/${session.id}`);
  }

  const actions = useSessionExerciseActions(session, {
    onStartEmpty: (exerciseId) => backToSession(exerciseId),
  });

  function move(exerciseId: number, direction: 'up' | 'down') {
    actions.layout.reorder.mutate(moveExerciseInOrder(groups, exerciseId, direction));
  }

  function requestFinish() {
    confirm({
      title: 'Finalizar treino?',
      confirmLabel: 'Finalizar',
      cancelLabel: 'Continuar treinando',
      onConfirm: () => finish.mutate(undefined, { onSuccess: () => backToSession() }),
    });
  }

  return (
    <>
      <Screen
        title="Treino atual"
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finalizar treino"
            disabled={finish.isPending}
            onPress={requestFinish}
            className="h-11 justify-center rounded-full bg-primary px-4 active:opacity-80"
          >
            <Text className="font-sans-bold text-sm text-primary-foreground">Finalizar</Text>
          </Pressable>
        }
        refreshing={refreshing}
        onRefresh={() =>
          void qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] })
        }
      >
        <View className="gap-3 px-5 pb-6 pt-4">
          {groups.map((group, position) => (
            <SessionExerciseCard
              key={group.exerciseId}
              session={session}
              group={group}
              position={position}
              count={groups.length}
              editing={editing?.exerciseId === group.exerciseId ? editing.index : null}
              onEdit={(index) =>
                setEditing(index == null ? null : { exerciseId: group.exerciseId, index })
              }
              onAction={() => backToSession(group.exerciseId)}
              onMove={(direction) => move(group.exerciseId, direction)}
              moveDisabled={actions.layout.reorder.isPending}
              onAddSet={() => actions.addSetTo(group)}
              addDisabled={actions.addPending}
              onRemove={() => actions.requestRemove(group)}
              removeDisabled={actions.removePending}
            />
          ))}

          {groups.length === 0 ? (
            <Text className="text-sm text-muted-foreground">Nenhum exercício ainda.</Text>
          ) : null}

          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adicionar exercício"
              onPress={() => setSearchOpen(true)}
              className="h-14 flex-row items-center justify-center gap-1.5 rounded-full bg-muted px-5 active:opacity-80"
            >
              <Plus size={16} color={colors.foreground} />
              <Text className="font-sans-bold text-[15px] text-foreground">Exercício</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => backToSession()}
              className="h-14 flex-1 items-center justify-center rounded-full bg-foreground active:opacity-80"
            >
              <Text className="font-sans-bold text-[15px] text-background">Voltar ao treino</Text>
            </Pressable>
          </View>
          <Button
            variant="ghost"
            className="self-center"
            textClassName="text-muted-foreground"
            onPress={() => cancel.setCancelOpen(true)}
          >
            Cancelar treino
          </Button>
        </View>
      </Screen>

      <DrawerLayer>
        <ExerciseSearchDrawer
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onPick={(exercise) => {
            add(exercise);
            toast.show({ message: `${exercise.name} entrou no treino` });
          }}
        />
        <ConfirmDrawer
          open={cancel.cancelOpen}
          onOpenChange={cancel.setCancelOpen}
          title="Cancelar treino?"
          description="Isso apaga a sessão e todos os exercícios registrados. Não dá para desfazer."
          confirmLabel="Cancelar treino"
          cancelLabel="Continuar treinando"
          destructive
          loading={cancel.isPending}
          error={cancel.error}
          onConfirm={cancel.cancel}
        />
      </DrawerLayer>
    </>
  );
}
