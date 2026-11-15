import { View } from 'react-native';
import { STATUS_BADGE_LABELS } from '@fatia/api-client';
import { cn } from './utils';
import { Text } from './text';

/**
 * Selos de plano e de estado (prancha Componentes · Selos), espelho do
 * `badge.tsx` da web: cor sempre com texto, nunca a cor sozinha. Os textos
 * padrão vêm do api-client (`STATUS_BADGE_LABELS`).
 */
export type BadgeVariant =
  'free' | 'trial' | 'pro' | 'pro-community' | 'lite' | 'done' | 'pending' | 'risk';

const BOX: Record<BadgeVariant, string> = {
  free: 'bg-muted',
  trial: 'bg-info/10',
  pro: 'bg-primary',
  'pro-community': 'bg-brand',
  lite: 'bg-warning/10',
  done: 'border border-success/45',
  pending: 'bg-surface-3',
  risk: 'bg-danger/10',
};

const TEXT: Record<BadgeVariant, string> = {
  free: 'text-foreground',
  trial: 'text-info',
  pro: 'text-primary-foreground',
  'pro-community': 'text-brand-foreground',
  lite: 'text-warning',
  done: 'text-success',
  pending: 'text-muted-foreground',
  risk: 'text-danger',
};

export function Badge({
  variant,
  children,
  className,
}: {
  variant: BadgeVariant;
  children: string;
  className?: string;
}) {
  return (
    <View className={cn('self-start rounded-full px-2.5 py-0.5', BOX[variant], className)}>
      <Text className={cn('font-sans-bold text-xs', TEXT[variant])}>{children}</Text>
    </View>
  );
}

export { STATUS_BADGE_LABELS };
