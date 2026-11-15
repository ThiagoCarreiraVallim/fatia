import { View } from 'react-native';
import {
  muscleGroupName,
  muscleGroupTone,
  muscleShareLabel,
  planMuscleShare,
  type MuscleGroupTone,
} from '@fatia/api-client';
import { cn } from '@/components/ui';
import { Text } from '@/components/ui/text';

/** Réplica de `apps/web/src/components/workout/plan-muscle-bar.tsx` (#378). */

const TONE_BG: Record<MuscleGroupTone, string> = {
  protein: 'bg-protein',
  water: 'bg-water',
  ok: 'bg-ok',
  steps: 'bg-steps',
  carbs: 'bg-carbs',
  fat: 'bg-fat',
  danger: 'bg-danger',
  muted: 'bg-muted-foreground',
};

export function PlanMuscleBar({
  exercises,
  legend = false,
  className,
}: {
  exercises: Parameters<typeof planMuscleShare>[0];
  legend?: boolean;
  className?: string;
}) {
  const share = planMuscleShare(exercises);
  if (share.length === 0) return null;
  return (
    <View className={cn('gap-1.5', className)}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={muscleShareLabel(share)}
        className="h-1.5 w-full flex-row gap-0.5 overflow-hidden rounded-[3px]"
      >
        {share.map((s) => (
          <View
            key={s.group}
            className={TONE_BG[muscleGroupTone(s.group)]}
            style={{ width: `${s.percent}%` }}
          />
        ))}
      </View>
      {legend ? (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          className="flex-row flex-wrap gap-x-3 gap-y-1"
        >
          {share.map((s) => (
            <View key={s.group} className="flex-row items-center gap-1.5">
              <View
                className={cn('h-[7px] w-[7px] rounded-[2px]', TONE_BG[muscleGroupTone(s.group)])}
              />
              <Text className="text-xs text-faint">
                {muscleGroupName(s.group)} {s.percent}%
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
