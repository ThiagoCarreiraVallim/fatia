import { useEffect, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { stagger, type IconName } from '@fatia/design';
import { colors } from '@/theme/colors';
import { popSpring, timing, lightHaptic } from '@/theme/motion';
import { useCountUp } from '@/theme/use-count-up';
import { Icon } from './icon';
import { Text } from './text';
import { cn } from './utils';
import {
  barHeightPercent,
  dayA11yLabel,
  HEATMAP_LEVEL_OPACITY,
  ringGeometry,
  ringPercent,
  type Day,
} from './ds-math';

export type { Day } from './ds-math';

/**
 * Blocos de dado do app (prancha Componentes · Blocos de dado e Movimento), os
 * mesmos da web (`apps/web/src/components/ui/data-blocks.tsx`): anel com
 * contagem, bloco de um número, faixa de dias, mapa de calor e barras. As
 * contas ficam em `ds-math.ts`; o movimento usa `@fatia/design` e para com
 * "reduzir movimento" (`ReduceMotion.System` em `timing`).
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Anel que enche em 1,3 s, com o número no meio subindo junto. */
export function Ring({
  value,
  max,
  size = 132,
  stroke = 10,
  color,
  label,
  unit,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  /** Cor do traço; padrão o verde da marca. Nunca a cor da comunidade. */
  color?: string;
  /** Nome do anel para o leitor de tela ("kcal restantes"). */
  label: string;
  unit?: string;
  children?: ReactNode;
}) {
  const pct = ringPercent(value, max);
  const shown = useCountUp(Math.round(value));
  const { radius, circumference } = ringGeometry(size, stroke);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(pct, timing('data'));
  }, [pct, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value / 100),
  }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${Math.round(value).toLocaleString('pt-BR')}${unit ? ` ${unit}` : ''}`}
      style={{ width: size, height: size }}
      className="items-center justify-center"
    >
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke={colors.surface3}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          stroke={color ?? colors.primary}
          animatedProps={animatedProps}
        />
      </Svg>
      <View importantForAccessibility="no-hide-descendants" className="items-center">
        {children ?? (
          <>
            <Text className="font-display text-[28px] leading-[28px] text-foreground">
              {shown.toLocaleString('pt-BR')}
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">{label}</Text>
          </>
        )}
      </View>
    </View>
  );
}

/** Um número, grande, com o rótulo pequeno embaixo. */
export function StatBlock({
  value,
  unit,
  label,
  icon,
  tone = 'card',
  className,
  children,
}: {
  value: string;
  unit?: string;
  label: string;
  icon?: IconName;
  /** `primary` = o bloco verde (sequência); texto escuro por cima. */
  tone?: 'card' | 'primary';
  className?: string;
  children?: ReactNode;
}) {
  const primary = tone === 'primary';
  const fg = primary ? colors.primaryForeground : colors.foreground;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
      className={cn(
        'gap-3 overflow-hidden rounded-card p-5',
        primary ? 'bg-primary' : 'bg-card',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text
        className={cn(
          'font-display text-[40px] leading-[40px]',
          primary ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {value}
        {unit ? (
          <Text
            className={cn(
              'font-sans-semibold text-base',
              primary ? 'text-primary-foreground opacity-70' : 'text-muted-foreground',
            )}
          >
            {` ${unit}`}
          </Text>
        ) : null}
      </Text>
      <Text
        className={cn(
          'text-[13px]',
          primary ? 'text-primary-foreground opacity-70' : 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

/** Faixa de dias: o selecionado em verde, os já feitos com contorno. */
export function DayStrip({
  days,
  selected,
  onSelect,
  className,
}: {
  days: Day[];
  selected: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Dias"
      className={cn('flex-row justify-between gap-1.5', className)}
    >
      {days.map((d, i) => {
        const on = i === selected;
        return (
          <Pressable
            key={d.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={dayA11yLabel(d)}
            onPress={() => {
              if (on) return;
              lightHaptic();
              onSelect(i);
            }}
            style={
              !on && d.done ? { borderWidth: 1.5, borderColor: `${colors.primaryText}80` } : null
            }
            className={cn(
              'h-16 flex-1 items-center justify-center gap-0.5 rounded-field',
              on ? 'bg-primary' : 'bg-muted',
            )}
          >
            <Text
              className={cn(
                'font-sans-semibold text-xs',
                on ? 'text-primary-foreground' : 'text-faint',
              )}
            >
              {d.weekday}
            </Text>
            <Text
              className={cn(
                'font-display-semibold text-base',
                on ? 'text-primary-foreground' : 'text-foreground',
              )}
            >
              {d.day}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function HeatCell({ level, index }: { level: 0 | 1 | 2 | 3; index: number }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    const t = timing('base');
    opacity.value = withDelay(index * stagger.heat, withTiming(1, t));
  }, [index, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={style}
      className="aspect-square flex-1 overflow-hidden rounded-[8px] bg-card"
    >
      {level > 0 ? (
        <View className="flex-1 bg-primary" style={{ opacity: HEATMAP_LEVEL_OPACITY[level] }} />
      ) : null}
    </Animated.View>
  );
}

/** Mapa de calor da constância: 0 a 3 por dia, em 7 colunas. */
export function Heatmap({
  levels,
  label,
  className,
}: {
  levels: (0 | 1 | 2 | 3)[];
  /** Resumo para o leitor de tela ("12 de 14 dias registrados"). */
  label: string;
  className?: string;
}) {
  const rows: (0 | 1 | 2 | 3)[][] = [];
  for (let i = 0; i < levels.length; i += 7) rows.push(levels.slice(i, i + 7));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className={cn('gap-1.5', className)}
    >
      {rows.map((row, r) => (
        <View key={r} className="flex-row gap-1.5">
          {Array.from({ length: 7 }, (_, c) =>
            c < row.length ? (
              <HeatCell key={c} level={row[c]!} index={r * 7 + c} />
            ) : (
              <View key={c} className="aspect-square flex-1" />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function Bar({ percent, index, on }: { percent: number; index: number; on: boolean }) {
  const height = useSharedValue(0);
  useEffect(() => {
    height.value = withDelay(index * stagger.bars, withTiming(percent, timing('data')));
  }, [percent, index, height]);
  const style = useAnimatedStyle(() => ({ height: `${height.value}%` }));
  return (
    <Animated.View
      style={style}
      className={cn('flex-1 rounded-[10px]', on ? 'bg-primary' : 'bg-surface-3')}
    />
  );
}

/** Barras verticais que crescem de baixo para cima, 60 ms entre elas. */
export function Bars({
  values,
  highlight = [],
  labels,
  className,
}: {
  values: number[];
  highlight?: number[];
  labels: string[];
  className?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      className={cn('h-[120px] flex-row items-end gap-2', className)}
    >
      {values.map((v, i) => (
        <Bar
          key={labels[i]}
          percent={barHeightPercent(v, max)}
          index={i}
          on={highlight.includes(i)}
        />
      ))}
    </View>
  );
}

/** Check (24 px, alvo de 44). Ao marcar, entra com mola e vibração leve. */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      hitSlop={10}
      onPress={() => {
        if (!checked) {
          lightHaptic();
          scale.set(withSequence(withTiming(0.6, { duration: 0 }), popSpring(1)));
        }
        onCheckedChange(!checked);
      }}
      className={className}
    >
      <Animated.View
        style={[style, checked ? null : { borderWidth: 2, borderColor: colors.borderStrong }]}
        className={cn('h-6 w-6 items-center justify-center rounded-[8px]', checked && 'bg-primary')}
      >
        {checked ? <Icon name="check" size={16} color={colors.primaryForeground} /> : null}
      </Animated.View>
    </Pressable>
  );
}
