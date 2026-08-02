import { Text, View } from 'react-native';
import { Flame, Lock, Trophy } from 'lucide-react-native';
import {
  legendaDeTolerancia,
  rotuloDeSequencia,
  type Achievement,
  type TodaySummary,
} from '@fatia/api-client';
import { Card } from '@/components/ui';
import { NUMEROS_TABULARES } from './helpers';

/**
 * Réplica de `apps/web/src/components/dashboard/streak-card.tsx`.
 *
 * Os textos vêm do `@fatia/api-client` (`rotuloDeSequencia`/`legendaDeTolerancia`) e não de uma
 * cópia local: a frase da tolerância explica um número que muda na cara do usuário, e os dois
 * apps dizendo coisas diferentes sobre o mesmo número seria pior que não explicar.
 */
const LARANJA = '#f97316';
const AMBAR = '#f59e0b';

export function StreakCard({
  streak,
  achievements,
}: {
  streak: TodaySummary['streak'];
  achievements: Achievement[];
}) {
  const legenda = legendaDeTolerancia(streak.activeDays, 'dias');
  const desbloqueadas = achievements.filter((a) => a.unlockedAt !== null);

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-baseline justify-between">
        <Text accessibilityRole="header" className="text-sm font-medium text-muted-foreground">
          Sequência
        </Text>
        <Text className="text-xs text-muted-foreground">
          {desbloqueadas.length}/{achievements.length} conquistas
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        <Flame size={28} color={LARANJA} />
        <Text style={NUMEROS_TABULARES} className="text-3xl font-semibold text-foreground">
          {rotuloDeSequencia(streak.activeDays, 'dias')}
        </Text>
      </View>

      {legenda ? <Text className="text-xs text-muted-foreground">{legenda}</Text> : null}

      <View className="flex-row gap-2">
        <Detalhe termo="Nutrição" valor={rotuloDeSequencia(streak.nutritionDays, 'dias')} />
        {/* Treino é semanal; os outros dois são diários. */}
        <Detalhe termo="Treino" valor={rotuloDeSequencia(streak.workoutWeeks, 'semanas')} />
        <Detalhe
          termo="Passos"
          valor={streak.stepsTargetSet ? rotuloDeSequencia(streak.stepsDays, 'dias') : 'sem meta'}
        />
      </View>

      <View className="flex-row flex-wrap gap-2">
        {achievements.map((a) => {
          const aberta = a.unlockedAt !== null;
          return (
            <View
              key={a.key}
              accessibilityLabel={`${a.title}: ${aberta ? 'desbloqueada' : 'bloqueada'}`}
              className={`flex-row items-center gap-1 rounded-full border px-2 py-1 ${
                aberta ? 'border-border' : 'border-transparent bg-muted'
              }`}
            >
              {aberta ? <Trophy size={12} color={AMBAR} /> : <Lock size={12} color="#8a8a8a" />}
              <Text className={`text-xs ${aberta ? 'text-foreground' : 'text-muted-foreground'}`}>
                {a.title}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Detalhe({ termo, valor }: { termo: string; valor: string }) {
  return (
    <View className="flex-1 rounded-md bg-muted p-2">
      <Text className="text-[11px] uppercase text-muted-foreground">{termo}</Text>
      <Text style={NUMEROS_TABULARES} className="text-sm font-medium text-foreground">
        {valor}
      </Text>
    </View>
  );
}
