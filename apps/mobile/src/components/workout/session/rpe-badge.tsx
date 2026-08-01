import { Text, View } from 'react-native';
import { getRpeInfo } from '@fatia/api-client';
import { cn } from '@/components/ui';
import { formatNumber } from './format';

/**
 * Réplica de `apps/web/src/components/workout/rpe-badge.tsx`.
 *
 * O `title` do web (tooltip do mouse) vira `accessibilityLabel`: num celular não
 * existe hover, e sem o rótulo o leitor de tela anunciaria só o emoji.
 */
export function RpeBadge({
  value,
  size = 'sm',
  showLabel = false,
  className,
}: {
  value: number | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}) {
  const info = getRpeInfo(value);

  if (!info || value == null) {
    return <Text className={cn('text-sm text-muted-foreground', className)}>—</Text>;
  }

  return (
    <View
      accessibilityLabel={`RPE ${formatNumber(value)}, ${info.label}. ${info.hint}`}
      className={cn('flex-row items-center gap-1', className)}
    >
      <Text className={size === 'md' ? 'text-lg leading-none' : 'text-base leading-none'}>
        {info.emoji}
      </Text>
      <Text className={cn('font-bold text-foreground', size === 'md' ? 'text-sm' : 'text-xs')}>
        {formatNumber(value)}
      </Text>
      {showLabel ? <Text className="text-xs text-muted-foreground">{info.label}</Text> : null}
    </View>
  );
}
