import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from './button';
import { cn } from './utils';

/**
 * Estados de carregamento, erro e vazio.
 *
 * Existem como componentes, e não como JSX solto em cada tela, porque a
 * auditoria de paridade (#130) checa justamente esses três — e é onde paridade
 * costuma quebrar sem ninguém ver. Centralizar significa que a comparação com o
 * PWA é feita uma vez, não vinte e três.
 */

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <View className="items-center justify-center gap-3 py-12" accessibilityRole="progressbar">
      <ActivityIndicator color="#2ce500" />
      <Text className="text-sm text-muted-foreground">{label}</Text>
    </View>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message =
    error instanceof Error && error.message ? error.message : 'Não foi possível carregar';
  return (
    <View className={cn('items-center gap-3 py-10 px-6', className)}>
      <Text accessibilityRole="alert" className="text-center text-sm text-muted-foreground">
        {message}
      </Text>
      {onRetry ? (
        <Button variant="outline" size="sm" onPress={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('items-center gap-2 py-10 px-6', className)}>
      <Text className="text-center text-base font-medium text-foreground">{title}</Text>
      {description ? (
        <Text className="text-center text-sm text-muted-foreground">{description}</Text>
      ) : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}
