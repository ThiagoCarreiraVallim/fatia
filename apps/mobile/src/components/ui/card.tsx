import type { ReactNode } from 'react';
import { Text, View, type ViewProps } from 'react-native';
import { cn } from './utils';

/**
 * Mesmos nomes de `apps/web/src/components/ui/card.tsx`.
 *
 * O padding do web (`p-6`, 24px) é grande para tela de celular segurada com uma
 * mão — aqui vira 16px, que é o que o PWA acaba sobrescrevendo na maioria dos
 * usos de qualquer forma.
 */

interface Props extends ViewProps {
  className?: string;
  children?: ReactNode;
}

export function Card({ className, ...props }: Props) {
  return <View className={cn('rounded-xl border border-border bg-card', className)} {...props} />;
}

export function CardHeader({ className, ...props }: Props) {
  return <View className={cn('gap-1.5 p-4', className)} {...props} />;
}

export function CardTitle({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Text
      // Cabeçalho de seção para o leitor de tela — sem isto todo card vira um
      // bloco de texto corrido na navegação por títulos.
      accessibilityRole="header"
      className={cn('text-base font-semibold text-card-foreground', className)}
    >
      {children}
    </Text>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <Text className={cn('text-sm text-muted-foreground', className)}>{children}</Text>;
}

export function CardContent({ className, ...props }: Props) {
  return <View className={cn('p-4 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: Props) {
  return <View className={cn('flex-row items-center p-4 pt-0', className)} {...props} />;
}
