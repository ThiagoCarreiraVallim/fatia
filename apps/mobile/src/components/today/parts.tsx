import { useEffect, type ReactNode } from 'react';
import { View, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { GoalTone } from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';
import { animateTo } from '@/theme/motion';

/**
 * Peças pequenas do Hoje (pranchas Al-H1/H3/H4/H5), espelho de
 * `apps/web/src/components/today/parts.tsx`: `card`, `card tight`, `bar thin` e
 * `chipic` do canvas.
 *
 * O fundo translúcido dos tons é o hex do token com alfa: o modificador de
 * opacidade do NativeWind não funciona nesta paleta (`hsl(var(--x))` sem alfa).
 * As cores são lidas no render, porque mudam com o tema.
 */

export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export const todayCard = 'gap-3 overflow-hidden rounded-card bg-card p-5';
export const todayTile = 'flex-1 gap-2 overflow-hidden rounded-card bg-card px-[18px] py-4';

export type Tone = GoalTone | 'brand';

/** A cor de cada tom, no tema que está valendo. */
export function toneColor(tone: Tone): string {
  switch (tone) {
    case 'lime':
      return colors.primary;
    case 'blue':
      return colors.protein;
    case 'water':
      return colors.water;
    case 'amber':
      return colors.steps;
    case 'brand':
      return colors.brand;
  }
}

/** A cor do traço e do ícone de um tom (no claro, o verde que passa como texto). */
export function toneInk(tone: Tone): string {
  return tone === 'lime' ? colors.primaryText : toneColor(tone);
}

/** Fundo do tom a 14%. */
export function toneSoft(tone: Tone): string {
  return `${toneColor(tone)}24`;
}

/** Barra fina que cresce da esquerda até o percentual. */
export function Bar({
  percent,
  color,
  label,
  className,
}: {
  percent: number;
  color: string;
  /** Nome para o leitor de tela; sem ele a barra é decorativa. */
  label?: string;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = animateTo(p, 'data');
  }, [p, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <View
      {...(label
        ? {
            accessible: true,
            accessibilityRole: 'progressbar' as const,
            accessibilityLabel: label,
            accessibilityValue: { min: 0, max: 100, now: p },
          }
        : { importantForAccessibility: 'no-hide-descendants' as const })}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <Animated.View
        style={[{ height: '100%', borderRadius: 999, backgroundColor: color }, style]}
      />
    </View>
  );
}

/** Ícone num quadrado de canto 14 (11 no compacto), com o fundo do tom a 14%. */
export function ChipIcon({
  icon,
  tone,
  size = 40,
}: {
  icon: IconName;
  tone: Tone;
  size?: 34 | 40;
}) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      className="shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size === 34 ? 11 : 14,
        backgroundColor: toneSoft(tone),
      }}
    >
      <Icon name={icon} size={size === 34 ? 16 : 20} color={toneInk(tone)} />
    </View>
  );
}

/** Rótulo pequeno em maiúsculas dentro de cartão ("PRÓXIMO TREINO"). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text className={cn('text-xs font-bold uppercase opacity-70', className)}>{children}</Text>
  );
}
