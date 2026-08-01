import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { cn } from './utils';

/**
 * Não existe `<label for>` no React Native — o vínculo com o campo é feito por
 * `accessibilityLabel` no próprio `TextInput`. Este componente é só o texto; a
 * ligação semântica fica a cargo de quem monta o formulário (ver `form.tsx`).
 */
export function Label({ className, children }: { className?: string; children?: ReactNode }) {
  return <Text className={cn('text-sm font-medium text-foreground', className)}>{children}</Text>;
}
