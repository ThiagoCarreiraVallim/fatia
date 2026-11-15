import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';

/**
 * O botão-ícone do topo, como o `.ib` do canvas: 44 × 44, quadrado de cantos
 * 14 px em `--s1` (`bg-card`). `lime` é o de criar (verde, tinta escura);
 * `ghost`, sem fundo. Igual a `headerButtonClass` do PWA (`tab-header.tsx`).
 */
export function headerButtonClass(variant: 'default' | 'lime' | 'ghost' = 'default'): string {
  return cn(
    'h-11 w-11 items-center justify-center rounded-[14px] active:opacity-70',
    variant === 'default' && 'bg-card',
    variant === 'lime' && 'bg-primary',
  );
}

/**
 * Botão-ícone pronto para o `TabHeader` e para as ações do `TopBar`. Passe o
 * ícone com a cor certa: `colors.foreground` nos normais e
 * `colors.primaryForeground` no `lime`.
 */
export function HeaderButton({
  label,
  onPress,
  variant = 'default',
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'lime' | 'ghost';
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      className={cn(headerButtonClass(variant), disabled && 'opacity-40')}
    >
      {children}
    </Pressable>
  );
}

/**
 * Cabeçalho das 5 abas (pranchas Al-H1, Al-N1, Al-T1, Al-V1, Cm-01): título
 * grande à esquerda (Sora 28/700, `text-h1`) e os botões-ícone à direita,
 * 8 px entre eles. As abas não têm a barra de topo pequena (`hasTopBar`);
 * a `Screen` só reserva a área segura. Sem padding lateral: fica dentro da
 * coluna da tela, alinhado aos cards. Réplica do `TabHeader` do PWA.
 *
 * ```tsx
 * <TabHeader title="Nutrição">
 *   <HeaderButton label="Ler código" onPress={…}>
 *     <Icon name="scan" size={20} />
 *   </HeaderButton>
 * </TabHeader>
 * ```
 */
export function TabHeader({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('min-h-11 flex-row items-center justify-between gap-3', className)}>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className="min-w-0 flex-1 font-display text-h1 text-foreground"
      >
        {title}
      </Text>
      {children ? <View className="flex-row items-center gap-2">{children}</View> : null}
    </View>
  );
}
