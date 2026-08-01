import { Text, View } from 'react-native';
import { Check, Trash2 } from 'lucide-react-native';
import type { Goal } from '@fatia/api-client';
import { Button } from '@/components/ui';
import { daysLeft, formatValue } from './format';
import { KIND_ICON } from './kind-icon';

/** Réplica do `SecondaryGoalCard` do PWA. */
export function SecondaryGoalCard({
  goal,
  busy = false,
  onComplete,
  onDelete,
}: {
  goal: Goal;
  busy?: boolean;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const percent = goal.progressPercent ?? 0;
  const Icon = KIND_ICON[goal.kind];
  const remaining = daysLeft(goal.deadline);
  const badge = remaining !== null ? `${remaining}D` : goal.kind.toUpperCase();

  return (
    <View className="rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent">
          <Icon size={18} color="#2ce500" />
        </View>
        <View className="rounded-full bg-muted px-3 py-1">
          <Text className="text-[10px] font-bold text-foreground">{badge}</Text>
        </View>
      </View>

      <Text accessibilityRole="header" className="mt-3 text-base font-bold text-foreground">
        {goal.title}
      </Text>
      {goal.description ? (
        <Text numberOfLines={2} className="text-xs text-muted-foreground">
          {goal.description}
        </Text>
      ) : null}

      <View className="mt-3 flex-row items-baseline justify-between">
        <Text
          className="text-lg font-extrabold text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatValue(goal.currentValue, goal.unit)}{' '}
          <Text className="text-xs font-medium text-muted-foreground">{goal.unit}</Text>
        </Text>
        <Text
          className="text-[11px] font-bold text-primary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          Alvo: {formatValue(goal.targetValue, goal.unit)}
        </Text>
      </View>

      <View
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${percent}% concluído`}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </View>

      <View className="mt-3 flex-row gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 bg-accent"
          disabled={busy}
          onPress={onComplete}
          accessibilityLabel={`Concluir meta ${goal.title}`}
        >
          <Check size={14} color="#2ce500" />
          <Text className="text-xs font-bold text-primary">Concluir</Text>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="bg-muted"
          disabled={busy}
          onPress={onDelete}
          accessibilityLabel={`Remover meta ${goal.title}`}
        >
          <Trash2 size={16} color="#baccaf" />
        </Button>
      </View>
    </View>
  );
}
