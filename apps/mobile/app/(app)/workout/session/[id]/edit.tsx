import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Plus, Trash2 } from 'lucide-react-native';
import {
  buildExerciseGroups,
  newSetClientKey,
  orderExerciseGroups,
  workoutApi,
  type ExerciseGroup,
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
  cn,
  useConfirm,
  useToast,
} from '@/components/ui';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { groupColorName } from '@/components/workout/workout-home';
import { isExerciseComplete, pluralize, targetSetsOf } from '@/components/workout/session/format';
import { copyLastSet } from '@/components/workout/session/guided-session';
import { SetChips } from '@/components/workout/session/set-chips';
import { SetEditor } from '@/components/workout/session/set-editor';
import { useCancelSession } from '@/components/workout/session/use-cancel-session';
import { useFinishSession } from '@/components/workout/session/use-finish-session';
import {
  useFocusRequest,
  usePendingExercises,
} from '@/components/workout/session/use-pending-exercises';
import { useSessionLayout } from '@/components/workout/session/use-session-layout';
import { colors } from '@/theme/colors';

/**
 * "Treino atual" (prancha `Al-T17-Editar-sessao`, #377): todos os exercícios
 * da sessão com as séries, para corrigir uma série, somar outra ("+ Série",
 * copiando a última), tirar um exercício só de hoje ou pôr outro. "Voltar ao
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
  const layout = useSessionLayout(session);
  const finish = useFinishSession(session.id);
  const cancel = useCancelSession(session.id);
  const { pending, add, drop } = usePendingExercises(session.id);
  const { request: requestFocus } = useFocusRequest(session.id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState<{ exerciseId: number; index: number } | null>(null);

  const groups = useMemo(
    () =>
      orderExerciseGroups(
        buildExerciseGroups(session.plannedExercises, session.sets, pending),
        session.exerciseOrder,
      ),
    [session.plannedExercises, session.sets, session.exerciseOrder, pending],
  );

  const addSet = useMutation({
    mutationFn: ({ group, key }: { group: ExerciseGroup; key: string }) =>
      workoutApi.logSet(session.id, copyLastSet(group.exerciseId, group.sets.at(-1), key)),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ message: 'Série adicionada' });
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] });
    },
  });

  function backToSession(exerciseId?: number) {
    if (exerciseId != null) requestFocus(exerciseId);
    if (router.canGoBack()) router.back();
    else router.replace(`/workout/session/${session.id}`);
  }

  function requestRemove(group: ExerciseGroup) {
    // Escolhido na busca e ainda sem série: só existia na tela.
    if (!group.isPlanned && group.sets.length === 0) {
      drop(group.exerciseId);
      return;
    }
    confirm({
      title: `Tirar ${group.exerciseName} do treino?`,
      description:
        'As séries de hoje dele são apagadas. O plano não muda: ele volta no próximo treino.',
      confirmLabel: 'Tirar do treino',
      cancelLabel: 'Continuar treinando',
      destructive: true,
      onConfirm: () => {
        drop(group.exerciseId);
        layout.remove.mutate(group);
      },
    });
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
            className="h-11 justify-center rounded-full bg-muted px-4 active:opacity-80"
          >
            <Text className="font-sans-bold text-sm text-foreground">Finalizar</Text>
          </Pressable>
        }
        refreshing={refreshing}
        onRefresh={() =>
          void qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] })
        }
      >
        <View className="gap-3 px-5 pb-6 pt-4">
          {groups.map((group) => {
            const target = targetSetsOf(group);
            const done = isExerciseComplete(group);
            const status = group.isCardio
              ? `Cardio · ${group.sets.length ? 'feito' : 'no fim do treino'}`
              : `${group.sets.length} de ${target} ${pluralize(target, 'série', 'séries')}`;
            const action = done ? '✓ Feito' : group.sets.length ? 'Retomar' : 'Iniciar';
            const editingHere = editing?.exerciseId === group.exerciseId ? editing.index : null;
            const editingSet = editingHere != null ? group.sets[editingHere] : undefined;
            const muscleGroup =
              group.sets[0]?.exercise?.muscleGroup ?? (group.isCardio ? 'cardio' : '');
            return (
              <View key={group.exerciseId} className="gap-3 rounded-3xl bg-card p-4">
                <View className="flex-row items-center gap-3">
                  <View
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: colors[groupColorName(muscleGroup)] }}
                  />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-sans-bold text-base text-foreground">
                      {group.exerciseName}
                    </Text>
                    <Text className="text-[12px] text-muted-foreground">{status}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${done ? 'Ver' : action} ${group.exerciseName}`}
                    onPress={() => backToSession(group.exerciseId)}
                    className={cn(
                      'h-11 justify-center rounded-full px-4',
                      done ? 'bg-transparent' : group.sets.length ? 'bg-muted' : 'bg-primary',
                    )}
                  >
                    <Text
                      className={cn(
                        'font-sans-bold text-[13px]',
                        done
                          ? 'text-muted-foreground'
                          : group.sets.length
                            ? 'text-foreground'
                            : 'text-primary-foreground',
                      )}
                    >
                      {action}
                    </Text>
                  </Pressable>
                </View>

                {group.sets.length > 0 ? (
                  <SetChips
                    group={group}
                    editing={editingSet ? editingHere : null}
                    onEdit={(index) =>
                      setEditing(index == null ? null : { exerciseId: group.exerciseId, index })
                    }
                  />
                ) : null}

                {editingSet && editingHere != null ? (
                  <SetEditor
                    key={editingSet.id}
                    set={editingSet}
                    index={editingHere}
                    isCardio={group.isCardio}
                    sessionId={session.id}
                    onClose={() => setEditing(null)}
                  />
                ) : null}

                <View className="flex-row gap-2">
                  <Button
                    variant="outline"
                    className="h-11 flex-1 rounded-full"
                    disabled={addSet.isPending}
                    accessibilityLabel={`Mais uma série de ${group.exerciseName}`}
                    onPress={() => addSet.mutate({ group, key: newSetClientKey() })}
                  >
                    <Plus size={15} color={colors.foreground} />
                    <Text className="font-sans-bold text-[13px] text-foreground">Série</Text>
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 flex-1 rounded-full"
                    disabled={layout.remove.isPending}
                    accessibilityLabel={`Tirar ${group.exerciseName} do treino`}
                    onPress={() => requestRemove(group)}
                  >
                    <Trash2 size={15} color={colors.danger} />
                    <Text className="font-sans-bold text-[13px] text-danger">Tirar do treino</Text>
                  </Button>
                </View>
              </View>
            );
          })}

          {groups.length === 0 ? (
            <Text className="text-sm text-muted-foreground">Nenhum exercício ainda.</Text>
          ) : null}

          <Button
            variant="outline"
            className="h-12 rounded-full"
            onPress={() => setSearchOpen(true)}
          >
            <Plus size={16} color={colors.foreground} />
            <Text className="font-sans-bold text-sm text-foreground">Exercício</Text>
          </Button>
          <Button className="h-14 rounded-full" onPress={() => backToSession()}>
            Voltar ao treino
          </Button>
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
