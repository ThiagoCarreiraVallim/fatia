import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp, Link2, Play, Trash2 } from 'lucide-react-native';
import {
  formatRest,
  isCardioExercise,
  muscleGroupName,
  planExerciseSummary,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import { cn } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { useOpenExerciseDetail } from './exercise-detail-context';
import { groupColorName } from './workout-home';

/**
 * A imagem do exercício nas listas de plano (Al-T7, Al-T8, Al-T19): o quadrado
 * com o play e a borda de baixo na cor do grupo. Igual ao `ExerciseThumb` do PWA.
 */
export function ExerciseThumb({ group, size = 56 }: { group: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderBottomWidth: 3,
        borderBottomColor: colors[groupColorName(group)],
      }}
      className="items-center justify-center rounded-[14px] bg-muted"
    >
      <Play size={16} color={colors.mutedForeground} />
    </View>
  );
}

/** "■ Peito  barra": o quadradinho e o nome do grupo, e o equipamento em cinza. */
export function ExerciseGroupLine({
  group,
  detail,
  className,
}: {
  group: string;
  detail?: string | null;
  className?: string;
}) {
  return (
    <View className={cn('flex-row flex-wrap items-center gap-x-2', className)}>
      <View className="flex-row items-center gap-[5px]">
        <View
          style={{ backgroundColor: colors[groupColorName(group)] }}
          className="h-[7px] w-[7px] rounded-[2px]"
        />
        <Text className="font-sans-semibold text-xs text-muted-foreground">
          {muscleGroupName(group)}
        </Text>
      </View>
      {detail ? <Text className="text-xs text-faint">{detail}</Text> : null}
    </View>
  );
}

/**
 * Réplica de `apps/web/src/components/workout/plan-exercise-row.tsx` (Al-T7):
 * uma linha dentro do card único da lista. A imagem abre o Como fazer. Vendo,
 * o nome também abre o Como fazer; editando, abre o Configurar, e aparecem as
 * setas e a lixeira.
 */
export function PlanExerciseRow({
  item,
  editing,
  isFirst,
  isLast,
  isMoving,
  onConfigure,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: WorkoutPlanExercise;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  isMoving: boolean;
  onConfigure: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const openDetail = useOpenExerciseDetail();
  const name = item.exercise.name;
  const cardio = isCardioExercise(item.exercise);
  const summary = planExerciseSummary(item);
  const rest = !cardio && item.restSeconds != null ? formatRest(item.restSeconds) : null;
  const upDisabled = isFirst || isMoving;
  const downDisabled = isLast || isMoving;
  const arrow = 'h-7 w-7 items-center justify-center rounded-lg bg-muted';

  return (
    <View
      className={cn(
        'min-h-[76px] flex-row items-center gap-3 py-2.5',
        !isFirst && 'border-t border-border',
      )}
    >
      {editing ? (
        <View className="gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mover ${name} para cima`}
            accessibilityState={{ disabled: upDisabled }}
            disabled={upDisabled}
            onPress={onMoveUp}
            hitSlop={6}
            className={cn(arrow, upDisabled && 'opacity-30')}
          >
            <ChevronUp size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mover ${name} para baixo`}
            accessibilityState={{ disabled: downDisabled }}
            disabled={downDisabled}
            onPress={onMoveDown}
            hitSlop={6}
            className={cn(arrow, downDisabled && 'opacity-30')}
          >
            <ChevronDown size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver detalhes de ${name}`}
        onPress={() => openDetail(item.exercise.id)}
        className="active:opacity-80"
      >
        <ExerciseThumb group={item.exercise.muscleGroup} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${editing ? 'Configurar' : 'Como fazer'} ${name}, ${summary}${rest ? `, descanso ${rest}` : ''}${item.biSetWithNext ? ', bi-set com o próximo' : ''}`}
        onPress={editing ? onConfigure : () => openDetail(item.exercise.id)}
        className="min-h-14 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-sans-semibold text-[15px] leading-5 text-foreground">{name}</Text>
          <ExerciseGroupLine group={item.exercise.muscleGroup} detail={item.exercise.equipment} />
          {item.biSetWithNext ? (
            <View className="flex-row items-center gap-1">
              <Link2 size={14} color={colors.steps} />
              <Text className="font-sans-bold text-[11px] text-steps">bi-set com o próximo</Text>
            </View>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="font-sans-bold text-[15px] text-foreground">{summary}</Text>
          {rest ? <Text className="text-xs text-faint">{rest}</Text> : null}
        </View>
      </Pressable>
      {editing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remover ${name} do plano`}
          onPress={onRemove}
          hitSlop={6}
          className="h-8 w-8 items-center justify-center rounded-full"
        >
          <Trash2 size={16} color={colors.faintForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}
