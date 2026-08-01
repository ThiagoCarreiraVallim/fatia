import { Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import type { TodaySummary } from '@fatia/api-client';
import { Button, Card } from '@/components/ui';
import { formatInteger } from '@/components/charts';
import { NUMEROS_TABULARES, percentualDaMeta } from './helpers';

/**
 * Réplica de `apps/web/src/components/dashboard/steps-card.tsx`.
 *
 * O drawer de passos é montado pela tela, não aqui — ver o cabeçalho de
 * `src/components/ui/drawer.tsx`.
 */
export function StepsCard({
  data,
  onLogSteps,
}: {
  data: TodaySummary['steps'];
  onLogSteps: () => void;
}) {
  const percentual = percentualDaMeta(data.today, data.target);

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-baseline justify-between">
        <Text accessibilityRole="header" className="text-sm font-medium text-muted-foreground">
          Passos hoje
        </Text>
        {data.goalReached ? (
          <Text className="text-xs font-bold text-primary">Meta batida</Text>
        ) : null}
      </View>

      <View className="flex-row items-baseline gap-2">
        <Text style={NUMEROS_TABULARES} className="text-3xl font-semibold text-foreground">
          {formatInteger(data.today)}
        </Text>
        {data.target !== null ? (
          <Text style={NUMEROS_TABULARES} className="text-sm text-muted-foreground">
            / {formatInteger(data.target)}
          </Text>
        ) : null}
      </View>

      {percentual !== null ? (
        <View
          className="h-2 overflow-hidden rounded-full bg-muted"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${percentual}% da meta de passos`}
          accessibilityValue={{ min: 0, max: 100, now: percentual }}
        >
          <View className="h-full rounded-full bg-primary" style={{ width: `${percentual}%` }} />
        </View>
      ) : null}

      <Button variant="outline" size="sm" onPress={onLogSteps} accessibilityLabel="Logar passos">
        <Plus size={14} color="#e5e2e1" />
        <Text className="text-sm font-medium text-foreground">Logar passos</Text>
      </Button>
    </Card>
  );
}
