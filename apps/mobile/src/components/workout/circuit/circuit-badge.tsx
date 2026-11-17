import { View } from 'react-native';
import { circuitBadge, type CircuitFormat } from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui';
import { colors } from '@/theme/colors';

/**
 * O selo do formato (`bdg pro | trial | com` do canvas): no card da aba
 * Circuitos (Al-T6) e no topo do relógio (Al-T4…). Réplica do PWA.
 */
export function CircuitBadge({ format, label }: { format: CircuitFormat; label?: string }) {
  const badge = circuitBadge(format);
  const style =
    badge.tone === 'trial'
      ? { backgroundColor: `${colors.info}1a` }
      : badge.tone === 'com'
        ? { backgroundColor: colors.brand }
        : { backgroundColor: colors.primary };
  return (
    <View style={style} className="h-[22px] max-w-full justify-center rounded-pill px-[9px]">
      <Text
        numberOfLines={1}
        className={cn(
          'font-sans-extrabold text-[11px] uppercase tracking-wide',
          badge.tone === 'trial'
            ? 'text-info'
            : badge.tone === 'com'
              ? 'text-brand-foreground'
              : 'text-primary-foreground',
        )}
      >
        {label ?? badge.label}
      </Text>
    </View>
  );
}
