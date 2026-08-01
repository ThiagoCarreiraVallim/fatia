import { Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Flame } from 'lucide-react-native';
import type { Goal } from '@fatia/api-client';
import { formatValue } from './format';

const SIZE = 140;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Réplica do `MainGoalCard` do PWA.
 *
 * O anel é `react-native-svg` em vez de `<svg>`: as cores precisam ser literais
 * porque `stroke` não passa por NativeWind — SVG no React Native não lê classe.
 */
export function MainGoalCard({ goal }: { goal: Goal }) {
  const percent = goal.progressPercent ?? 0;
  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card p-5">
      <View className="flex-row">
        <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1">
          <Flame size={12} color="#2ce500" />
          <Text className="text-[11px] font-bold text-foreground">META PRINCIPAL</Text>
        </View>
      </View>

      <Text accessibilityRole="header" className="mt-3 text-2xl font-extrabold text-foreground">
        {goal.title}
      </Text>
      {goal.description ? (
        <Text className="text-sm text-muted-foreground">{goal.description}</Text>
      ) : null}

      <View className="mt-4 flex-row gap-3">
        <ValueTile label="ATUAL" value={goal.currentValue} unit={goal.unit} highlight />
        <ValueTile label="ALVO" value={goal.targetValue} unit={goal.unit} />
      </View>

      <View
        className="mt-5 items-center justify-center"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${percent}% concluído`}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE}>
            {/* O anel começa às 12 h, como no PWA (`-rotate-90` no `<svg>`). */}
            <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="transparent"
                stroke="#201f1f"
                strokeWidth={STROKE}
              />
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="transparent"
                stroke="#2ce500"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={offset}
              />
            </G>
          </Svg>
          <View className="absolute inset-0 items-center justify-center">
            <Text
              className="text-3xl font-extrabold text-foreground"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {percent}
              <Text className="text-base font-bold">%</Text>
            </Text>
            <Text className="text-[10px] font-bold text-muted-foreground">CONCLUÍDO</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function ValueTile({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: number | null;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <View className="flex-1 rounded-xl bg-muted px-4 py-3">
      <Text className="text-[10px] font-bold text-muted-foreground">{label}</Text>
      <Text
        className={`mt-0.5 text-xl font-extrabold ${highlight ? 'text-primary' : 'text-foreground'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatValue(value, unit)}
        {unit !== '%' ? <Text className="text-xs text-muted-foreground"> {unit}</Text> : null}
      </Text>
    </View>
  );
}
