import { Text, View } from 'react-native';
import { CheckCircle2, History } from 'lucide-react-native';
import type { Goal } from '@fatia/api-client';
import { formatValue } from './format';

/** Réplica do `RecentGoalRow` do PWA. */
export function RecentGoalRow({ goal }: { goal: Goal }) {
  const done = goal.status === 'completed';

  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-muted px-3 py-3">
      <View
        className={`h-9 w-9 items-center justify-center rounded-full ${
          done ? 'bg-accent' : 'bg-secondary'
        }`}
      >
        {done ? (
          <CheckCircle2 size={18} color="#2ce500" />
        ) : (
          <History size={16} color="#baccaf" />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold text-foreground">
          {goal.title}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          Alvo: {formatValue(goal.targetValue, goal.unit)} {goal.unit}
        </Text>
      </View>
      <Text
        className={`text-[10px] font-extrabold ${done ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {done ? 'CONCLUÍDO' : 'EXPIRADO'}
      </Text>
    </View>
  );
}
