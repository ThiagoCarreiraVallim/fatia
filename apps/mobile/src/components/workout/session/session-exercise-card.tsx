import { Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react-native';
import {
  feelingOf,
  formatBestSet,
  newSetClientKey,
  rpeToFeeling,
  workoutApi,
  type ExerciseGroup,
  type WorkoutSession,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { cn, useConfirm, useToast } from '@/components/ui';
import { groupColorName } from '@/components/workout/workout-home';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { colors } from '@/theme/colors';
import { isExerciseComplete, pluralize, targetSetsOf } from './format';
import { copyLastSet } from './guided-session';
import { SetEditor } from './set-editor';
import { useSessionLayout } from './use-session-layout';
import { usePendingExercises } from './use-pending-exercises';

/**
 * "+ Série" e "Tirar do treino" de um exercício da sessão: o que o Treino
 * atual (`Al-T17`) e o resumo do "tudo feito" da sessão fazem igual.
 * `onStartEmpty`: "+ Série" sem série para copiar leva o exercício à sessão,
 * onde a primeira é preenchida.
 */
export function useSessionExerciseActions(
  session: WorkoutSession,
  { onStartEmpty }: { onStartEmpty: (exerciseId: number) => void },
) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const layout = useSessionLayout(session);
  const { drop } = usePendingExercises(session.id);

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

  /** "+ Série" copia a última; sem nenhuma, a série é preenchida na sessão. */
  function addSetTo(group: ExerciseGroup) {
    if (group.sets.length === 0) {
      onStartEmpty(group.exerciseId);
      return;
    }
    addSet.mutate({ group, key: newSetClientKey() });
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

  return {
    addSetTo,
    addPending: addSet.isPending,
    requestRemove,
    removePending: layout.remove.isPending,
    layout,
  };
}

/**
 * Um exercício da sessão com as séries (prancha `Al-T17`): o nome, quantas de
 * quantas, a ação (Feito / Continuar / Iniciar), a tabela das séries com o
 * lápis que abre o "Corrigir série", e "+ Série" e "Tirar do treino" no pé.
 * Sem `onMove`, sem as setas de ordem (o resumo do "tudo feito").
 */
export function SessionExerciseCard({
  session,
  group,
  position,
  count,
  editing,
  onEdit,
  onAction,
  onMove,
  moveDisabled = false,
  onAddSet,
  addDisabled = false,
  onRemove,
  removeDisabled = false,
}: {
  session: WorkoutSession;
  group: ExerciseGroup;
  position: number;
  count: number;
  /** A série aberta no "Corrigir série" deste exercício. */
  editing: number | null;
  onEdit: (index: number | null) => void;
  onAction: () => void;
  onMove?: (direction: 'up' | 'down') => void;
  moveDisabled?: boolean;
  onAddSet: () => void;
  addDisabled?: boolean;
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  const target = targetSetsOf(group);
  const done = isExerciseComplete(group);
  const muscle =
    group.sets[0]?.exercise?.muscleGroup ??
    session.plannedExercises?.find((p) => p.exerciseId === group.exerciseId)?.muscleGroup ??
    (group.isCardio ? 'cardio' : '');
  const groupLabel = muscle ? muscle.charAt(0).toUpperCase() + muscle.slice(1) : null;
  const status = group.isCardio
    ? `Cardio · ${group.sets.length ? 'feito' : 'no fim do treino'}`
    : [groupLabel, `${group.sets.length} de ${target} ${pluralize(target, 'série', 'séries')}`]
        .filter(Boolean)
        .join(' · ');
  // O que está pela metade é o "Continuar" em verde, com o cartão contornado;
  // o que não começou é "Iniciar", discreto.
  const inProgress = !done && group.sets.length > 0;
  const action = done ? '✓ Feito' : inProgress ? 'Continuar' : 'Iniciar';
  const editingSet = editing != null ? group.sets[editing] : undefined;

  return (
    <View
      className="gap-3 rounded-card bg-card px-4 pb-1 pt-4"
      style={inProgress ? { borderWidth: 1.5, borderColor: `${colors.primary}80` } : undefined}
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
          <Text numberOfLines={2} className="font-sans-semibold text-[15px] text-foreground">
            {group.exerciseName}
          </Text>
          <Text className="text-[12px] text-muted-foreground">{status}</Text>
        </View>
        {onMove ? (
          <View className="flex-row">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Subir ${group.exerciseName}`}
              disabled={position === 0 || moveDisabled}
              onPress={() => onMove('up')}
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
              disabled={position === count - 1 || moveDisabled}
              onPress={() => onMove('down')}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-full active:bg-muted',
                position === count - 1 && 'opacity-30',
              )}
            >
              <ChevronDown size={18} color={colors.foreground} />
            </Pressable>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${done ? 'Ver' : action} ${group.exerciseName}`}
          onPress={onAction}
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
        <SetTable group={group} editing={editingSet ? editing : null} onEdit={onEdit} />
      ) : null}

      {editingSet && editing != null ? (
        <SetEditor
          key={editingSet.id}
          set={editingSet}
          index={editing}
          isCardio={group.isCardio}
          sessionId={session.id}
          onClose={() => onEdit(null)}
        />
      ) : null}

      <View className="flex-row items-center justify-between border-t border-border">
        <Pressable
          accessibilityRole="button"
          disabled={addDisabled}
          accessibilityLabel={`Mais uma série de ${group.exerciseName}`}
          onPress={onAddSet}
          className="min-h-[52px] flex-row items-center gap-1.5 active:opacity-70"
        >
          <Plus size={16} color={colors.primaryText} />
          <Text className="font-sans-bold text-sm text-primary">Série</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={removeDisabled}
          accessibilityLabel={`Tirar ${group.exerciseName} do treino`}
          onPress={onRemove}
          className="min-h-[52px] justify-center active:opacity-70"
        >
          <Text className="font-sans-semibold text-[13px] text-muted-foreground">
            Tirar do treino
          </Text>
        </Pressable>
      </View>
    </View>
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
