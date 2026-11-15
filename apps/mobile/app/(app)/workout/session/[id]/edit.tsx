import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react-native';
import {
  buildExerciseGroups,
  feelingOf,
  formatBestSet,
  moveExerciseInOrder,
  rpeToFeeling,
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
import { SetEditor } from '@/components/workout/session/set-editor';
import { useCancelSession } from '@/components/workout/session/use-cancel-session';
import { useFinishSession } from '@/components/workout/session/use-finish-session';
import {
  useFocusRequest,
  usePendingExercises,
} from '@/components/workout/session/use-pending-exercises';
import { useSessionLayout } from '@/components/workout/session/use-session-layout';
import { colors } from '@/theme/colors';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';

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
    mutationFn: ({ group, key }: { group: ExerciseGroup; key: string }) => {
      const body = copyLastSet(group.exerciseId, group.sets.at(-1), key);
      if (!body) throw new Error('Sem série para copiar');
      return workoutApi.logSet(session.id, body);
    },
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

  /** "+ Série" copia a última; sem nenhuma, a série é preenchida na sessão. */
  function addSetTo(group: ExerciseGroup) {
    if (group.sets.length === 0) {
      backToSession(group.exerciseId);
      return;
    }
    addSet.mutate({ group, key: newSetClientKey() });
  }

  function move(exerciseId: number, direction: 'up' | 'down') {
    layout.reorder.mutate(moveExerciseInOrder(groups, exerciseId, direction));
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
          {groups.map((group, position) => {
            const target = targetSetsOf(group);
            const done = isExerciseComplete(group);
            const muscle =
              group.sets[0]?.exercise?.muscleGroup ??
              session.plannedExercises?.find((p) => p.exerciseId === group.exerciseId)
                ?.muscleGroup ??
              (group.isCardio ? 'cardio' : '');
            const groupLabel = muscle ? muscle.charAt(0).toUpperCase() + muscle.slice(1) : null;
            const status = group.isCardio
              ? `Cardio · ${group.sets.length ? 'feito' : 'no fim do treino'}`
              : [
                  groupLabel,
                  `${group.sets.length} de ${target} ${pluralize(target, 'série', 'séries')}`,
                ]
                  .filter(Boolean)
                  .join(' · ');
            // Prancha `Al-T17`: o que está pela metade é o "Continuar" em verde,
            // com o cartão contornado; o que não começou é "Iniciar", discreto.
            const inProgress = !done && group.sets.length > 0;
            const action = done ? '✓ Feito' : inProgress ? 'Continuar' : 'Iniciar';
            const editingHere = editing?.exerciseId === group.exerciseId ? editing.index : null;
            const editingSet = editingHere != null ? group.sets[editingHere] : undefined;
            return (
              <View
                key={group.exerciseId}
                className="gap-3 rounded-card bg-card px-4 pb-1 pt-4"
                style={
                  inProgress ? { borderWidth: 1.5, borderColor: `${colors.primary}80` } : undefined
                }
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="h-10 w-10 rounded-xl bg-muted"
                    style={{
                      borderBottomWidth: 3,
                      borderBottomColor: colors[groupColorName(muscle)],
                    }}
                  />
                  <View className="min-w-0 flex-1">
                    <Text
                      numberOfLines={2}
                      className="font-sans-semibold text-[15px] text-foreground"
                    >
                      {group.exerciseName}
                    </Text>
                    <Text className="text-[12px] text-muted-foreground">{status}</Text>
                  </View>
                  <View className="flex-row">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Subir ${group.exerciseName}`}
                      disabled={position === 0 || layout.reorder.isPending}
                      onPress={() => move(group.exerciseId, 'up')}
                      className={cn(
                        'h-11 w-11 items-center justify-center rounded-full active:bg-muted',
                        position === 0 && 'opacity-30',
                      )}
                    >
                      <ChevronUp size={18} color={colors.foreground} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Descer ${group.exerciseName}`}
                      disabled={position === groups.length - 1 || layout.reorder.isPending}
                      onPress={() => move(group.exerciseId, 'down')}
                      className={cn(
                        'h-11 w-11 items-center justify-center rounded-full active:bg-muted',
                        position === groups.length - 1 && 'opacity-30',
                      )}
                    >
                      <ChevronDown size={18} color={colors.foreground} />
                    </Pressable>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${done ? 'Ver' : action} ${group.exerciseName}`}
                    onPress={() => backToSession(group.exerciseId)}
                    className={cn(
                      'h-11 justify-center rounded-full px-4',
                      done ? 'bg-transparent' : inProgress ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <Text
                      className={cn(
                        'font-sans-bold text-[13px]',
                        done
                          ? 'text-muted-foreground'
                          : inProgress
                            ? 'text-primary-foreground'
                            : 'text-foreground',
                      )}
                    >
                      {action}
                    </Text>
                  </Pressable>
                </View>

                {group.sets.length > 0 ? (
                  <SetTable
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

                <View className="flex-row items-center justify-between border-t border-border">
                  <Pressable
                    accessibilityRole="button"
                    disabled={addSet.isPending}
                    accessibilityLabel={`Mais uma série de ${group.exerciseName}`}
                    onPress={() => addSetTo(group)}
                    className="min-h-[52px] flex-row items-center gap-1.5 active:opacity-70"
                  >
                    <Plus size={16} color={colors.primaryText} />
                    <Text className="font-sans-bold text-sm text-primary">Série</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={layout.remove.isPending}
                    accessibilityLabel={`Tirar ${group.exerciseName} do treino`}
                    onPress={() => requestRemove(group)}
                    className="min-h-[52px] justify-center active:opacity-70"
                  >
                    <Text className="font-sans-semibold text-[13px] text-muted-foreground">
                      Tirar do treino
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

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

/**
 * As séries do exercício em linhas (prancha `Al-T17`): número, carga × reps,
 * a carinha e o lápis, que abre o "Corrigir série" logo abaixo.
 */
function SetTable({
  group,
  editing,
  onEdit,
}: {
  group: ExerciseGroup;
  editing: number | null;
  onEdit: (index: number | null) => void;
}) {
  const unit = useUnitPrefs().loadUnit;
  return (
    <View>
      <View className="flex-row items-center gap-3 border-t border-border py-2">
        <Text className="w-5 text-[12px] text-faint">#</Text>
        <Text className="flex-1 text-[12px] text-faint">
          {group.isCardio ? 'distância · tempo' : 'carga × reps'}
        </Text>
        <Text className="w-[76px] text-[12px] text-faint">como</Text>
      </View>
      {group.sets.map((set, i) => {
        const feeling = feelingOf(rpeToFeeling(set.rpe));
        const on = editing === i;
        return (
          <View
            key={set.id}
            className="min-h-[52px] flex-row items-center gap-3 border-t border-border"
          >
            <Text className="w-5 text-[13px] text-faint">{i + 1}</Text>
            <Text
              className="flex-1 font-sans-bold text-[15px] text-foreground"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatBestSet(set, unit)}
            </Text>
            <Text className="w-8 text-center text-lg">{feeling?.emoji ?? ''}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Corrigir série ${i + 1}`}
              accessibilityState={{ expanded: on }}
              onPress={() => onEdit(on ? null : i)}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-xl',
                on ? 'bg-primary' : 'bg-muted',
              )}
            >
              <Pencil size={15} color={on ? colors.primaryForeground : colors.foreground} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
