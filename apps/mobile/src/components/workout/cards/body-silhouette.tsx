import { View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import {
  bodyTones,
  daysAgoLabel,
  muscleGroupLabel,
  MUSCLE_TONE_LEGEND,
  type MuscleTone,
  type RestedMuscle,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/components/workout/cards/body-silhouette.tsx`: a
 * silhueta do card "Seus músculos hoje" (prancha `Al-T-Cards-treino`), corpo
 * escuro e cada grupo na cor do descanso, só com tokens.
 */
function toneFill(tone: MuscleTone): { color: string; opacity: number } {
  if (tone === 'rested') return { color: colors.primary, opacity: 1 };
  if (tone === 'recovering') return { color: colors.steps, opacity: 1 };
  return { color: colors.foreground, opacity: 0.18 };
}

export function BodySilhouette({ rested }: { rested: readonly RestedMuscle[] }) {
  const tone = bodyTones(rested);
  const f = (g: keyof typeof tone) => {
    const { color, opacity } = toneFill(tone[g]);
    return { fill: color, fillOpacity: opacity };
  };
  const back = toneFill(tone.costas);
  const label = rested.length
    ? rested.map((r) => `${muscleGroupLabel(r.group)} · ${daysAgoLabel(r.daysSince)}`).join(', ')
    : 'Nenhum grupo descansado';
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={64} height={118} viewBox="0 0 120 220">
        <G fill={colors.surface3}>
          <Circle cx="60" cy="20" r="14" />
          <Rect x="40" y="38" width="40" height="70" rx="16" />
          <Rect x="20" y="42" width="16" height="64" rx="8" />
          <Rect x="84" y="42" width="16" height="64" rx="8" />
          <Rect x="42" y="108" width="16" height="96" rx="8" />
          <Rect x="62" y="108" width="16" height="96" rx="8" />
        </G>
        {/* Costas não aparecem de frente: o contorno do tronco leva a cor delas. */}
        <Rect
          x="41.5"
          y="39.5"
          width="37"
          height="67"
          rx="15"
          fill="none"
          stroke={back.color}
          strokeOpacity={back.opacity}
          strokeWidth="3"
        />
        <Rect x="42" y="44" width="36" height="22" rx="8" {...f('peito')} />
        <Rect x="46" y="70" width="28" height="32" rx="8" {...f('core')} />
        <Circle cx="32" cy="46" r="9" {...f('ombro')} />
        <Circle cx="88" cy="46" r="9" {...f('ombro')} />
        <Rect x="20" y="60" width="16" height="30" rx="8" {...f('braço')} />
        <Rect x="84" y="60" width="16" height="30" rx="8" {...f('braço')} />
        <Rect x="42" y="112" width="16" height="56" rx="8" {...f('pernas')} />
        <Rect x="62" y="112" width="16" height="56" rx="8" {...f('pernas')} />
      </Svg>
    </View>
  );
}

export function BodyToneLegend() {
  return (
    <View accessibilityLabel="Legenda" className="gap-1">
      {MUSCLE_TONE_LEGEND.map((item) => {
        const { color, opacity } = toneFill(item.tone);
        return (
          <View key={item.tone} className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: color, opacity }} />
            <Text className="text-[13px] text-muted-foreground">{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
