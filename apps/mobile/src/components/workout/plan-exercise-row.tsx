import { Pressable, View } from 'react-native';
import { ArrowDown, ArrowUp, Dumbbell, Link2, Trash2 } from 'lucide-react-native';
import {
  formatRest,
  isCardioExercise,
  muscleGroupName,
  planExerciseSummary,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { useOpenExerciseDetail } from './exercise-detail-host';

/**
 * Réplica de `apps/web/src/components/workout/plan-exercise-row.tsx` (Al-T7).
 * A imagem abre o Como fazer; o resto da linha abre o Configurar. As setas e a
 * lixeira só aparecem no modo de edição.
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
  const sub = [muscleGroupName(item.exercise.muscleGroup), item.exercise.equipment]
    .filter(Boolean)
    .join(' · ');
  const upDisabled = isFirst || isMoving;
  const downDisabled = isLast || isMoving;

  return (
    <View className="rounded-2xl border border-border bg-card p-3">
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver detalhes de ${name}`}
          onPress={() => openDetail(item.exercise.id)}
          className="h-14 w-14 items-center justify-center rounded-xl bg-muted"
        >
          <Dumbbell size={20} color={colors.primaryText} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Configurar ${name}, ${summary}${rest ? `, descanso ${rest}` : ''}${item.biSetWithNext ? ', bi-set com o próximo' : ''}`}
          onPress={onConfigure}
          className="min-h-14 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
        >
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-bold text-foreground">
              {name}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {sub}
            </Text>
            {item.biSetWithNext ? (
              <View className="mt-0.5 flex-row items-center gap-1">
                <Link2 size={12} color={colors.primaryText} />
                <Text className="text-[11px] font-semibold text-primary">bi-set com o próximo</Text>
              </View>
            ) : null}
          </View>
          <View className="items-end">
            <Text className="text-sm font-extrabold text-foreground">{summary}</Text>
            {rest ? <Text className="text-[11px] text-muted-foreground">{rest}</Text> : null}
          </View>
        </Pressable>
      </View>

      {editing ? (
        <View className="mt-2 flex-row items-center justify-end gap-1 border-t border-border pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mover ${name} para cima`}
            accessibilityState={{ disabled: upDisabled }}
            disabled={upDisabled}
            onPress={onMoveUp}
            className={`h-11 w-11 items-center justify-center rounded-full ${upDisabled ? 'opacity-30' : ''}`}
          >
            <ArrowUp size={18} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mover ${name} para baixo`}
            accessibilityState={{ disabled: downDisabled }}
            disabled={downDisabled}
            onPress={onMoveDown}
            className={`h-11 w-11 items-center justify-center rounded-full ${downDisabled ? 'opacity-30' : ''}`}
          >
            <ArrowDown size={18} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remover ${name} do plano`}
            onPress={onRemove}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <Trash2 size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
