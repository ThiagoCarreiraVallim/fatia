import { useId, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { barHeights, linePath, type GoalBadgeTone } from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';

/**
 * Peças das telas de Progresso (#382) no app — réplica de
 * `apps/web/src/components/progress/progress-ui.tsx`.
 */

/** Linha com o degradê embaixo (Peso, Força). `values` em ordem de tempo. */
export function Sparkline({
  values,
  height = 44,
  color,
  fill = true,
}: {
  values: number[];
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const width = 300;
  const stroke = color ?? colors.primary;
  if (values.length < 2) return <View style={{ height }} />;
  const d = linePath(values, width, height);
  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {fill ? (
        <>
          <Defs>
            <LinearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
        </>
      ) : null}
      <Path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

/** Barras verticais (Passos, Cardio). A última, a de hoje, acesa. */
export function MiniBars({
  values,
  height = 44,
  color,
  gap = 3,
}: {
  values: number[];
  height?: number;
  color?: string;
  gap?: number;
}) {
  const heights = barHeights(values);
  const fillColor = color ?? colors.steps;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap }}
    >
      {heights.map((h, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: `${h}%`,
            borderRadius: 3,
            backgroundColor: fillColor,
            opacity: i === heights.length - 1 ? 1 : 0.6,
          }}
        />
      ))}
    </View>
  );
}

/** As cores da constância: 0 a 4 áreas cumpridas no dia. */
export function heatColor(level: number): { backgroundColor: string; opacity?: number } {
  if (level <= 0) return { backgroundColor: colors.surface3 };
  return { backgroundColor: colors.primary, opacity: [0.3, 0.55, 0.8, 1][Math.min(level, 4) - 1] };
}

/** Selo por tom (os da prancha: `ok`, `warn`, `pro`, `mute`). */
export function ToneBadge({ tone, label }: { tone: GoalBadgeTone | 'bad'; label: string }) {
  // O `.bdg` do canvas: 22 de altura, caixa alta, 800; o `ok` é o verde suave da marca.
  return (
    <View
      className={cn(
        'h-[22px] shrink-0 justify-center rounded-pill px-[9px]',
        tone === 'ok' && 'bg-primary/10',
        tone === 'warn' && 'bg-warning/10',
        tone === 'bad' && 'bg-danger/10',
        tone === 'pro' && 'bg-primary',
        tone === 'mute' && 'bg-surface-3',
      )}
    >
      <Text
        className={cn(
          'font-sans-extrabold text-[11px] uppercase tracking-[0.4px]',
          tone === 'ok' && 'text-primary-text',
          tone === 'warn' && 'text-warning',
          tone === 'bad' && 'text-danger',
          tone === 'pro' && 'text-primary-foreground',
          tone === 'mute' && 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </View>
  );
}

/** Barra de progresso fina (metas, áreas da constância). */
export function ProgressBar({
  percent,
  color,
  label,
}: {
  percent: number;
  color?: string;
  label?: string;
}) {
  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'progressbar' : undefined}
      accessibilityLabel={label}
      accessibilityValue={label ? { min: 0, max: 100, now: percent } : undefined}
      className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-3"
    >
      <View
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: 999,
          backgroundColor: color ?? colors.primary,
        }}
      />
    </View>
  );
}

/** Chip com ícone (tipos de gráfico, tipos de meta). */
export function IconChip({
  icon,
  label,
  selected,
  onPress,
  className,
  tone = 'default',
}: {
  icon?: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
  className?: string;
  /** `lime`: o selecionado é o verde da marca (o `.chip.lime` do canvas: G6, G10). */
  tone?: 'default' | 'lime';
}) {
  const lime = selected && tone === 'lime';
  const onColor = lime ? colors.primaryForeground : colors.background;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'min-h-9 flex-row items-center justify-center gap-1 rounded-chip px-3',
        lime ? 'bg-primary' : selected ? 'bg-foreground' : 'bg-muted',
        className,
      )}
    >
      {icon ? (
        <Icon name={icon} size={16} color={selected ? onColor : colors.mutedForeground} />
      ) : null}
      <Text
        className={cn(
          'font-sans-semibold text-[13px]',
          lime ? 'text-primary-foreground' : selected ? 'text-background' : 'text-muted-foreground',
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Cartão base das telas. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn('gap-3 rounded-card bg-card p-4', className)}>{children}</View>;
}
