import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import { Text } from './text';
import { Icon } from './icon';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';
import { colors } from '@/theme/colors';
import { pressScale } from '@/theme/motion-values';

/**
 * Botão do app nativo.
 *
 * As variantes têm os mesmos nomes das do PWA (`apps/web/src/components/ui/button.tsx`)
 * para que uma tela portada não precise traduzir vocabulário. O que muda:
 *
 * - `Pressable` no lugar de `<button>`; sem `asChild`, porque não existe DOM
 *   para delegar — navegação vira `onPress={() => router.push(...)}`
 * - o texto não herda cor no React Native, então a cor da label é uma variante
 *   própria, casada com a do fundo
 * - altura mínima de 44pt em todos os tamanhos, que é o alvo de toque mínimo das
 *   diretrizes da Apple e do Material. O `sm` do web tem 32px e ficaria abaixo;
 *   o `xs` (34, "Mini" da prancha) completa os 44 com `hitSlop`.
 *
 * Rótulo em 600 (700 no `xl` e no `xs`), raio 12 (14 no `xl`, 10 no `xs`) e
 * desativado a .4, como a web e a prancha Componentes · Botões.
 */
const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-md', {
  variants: {
    variant: {
      default: 'bg-primary',
      secondary: 'bg-secondary',
      outline: 'border border-border-strong bg-transparent',
      /** "Texto" da prancha: sem fundo. */
      text: 'bg-transparent',
      /** "Apagar" da prancha: fundo vermelho suave, texto vermelho. */
      danger: 'bg-danger/10',
      /** "Adicionar" da prancha: verde, com o ícone de mais. */
      add: 'bg-primary',
      /** "Gerar com IA": verde, com a faísca. */
      ai: 'bg-primary',
      brand: 'bg-brand',
      destructive: 'bg-destructive',
      ghost: 'bg-transparent',
      link: 'bg-transparent',
    },
    // Alvo de toque de 44 pt em todos; o `xs` (34) ganha o resto pelo hitSlop.
    size: {
      default: 'min-h-[44px] px-4 py-2',
      /** 52 px, o botão principal da tela (`.btn` da prancha). */
      xl: 'h-[52px] rounded-field px-6',
      sm: 'min-h-[44px] px-3 py-1',
      lg: 'min-h-[52px] px-8 py-3',
      /** 34 px, o "Mini" da prancha. */
      xs: 'h-[34px] rounded-chip px-3.5',
      icon: 'h-11 w-11 px-0',
    },
    disabled: {
      true: 'opacity-40',
      false: '',
    },
  },
  defaultVariants: { variant: 'default', size: 'default', disabled: false },
});

const labelVariants = cva('text-sm font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      outline: 'text-foreground',
      text: 'text-foreground',
      danger: 'text-danger',
      add: 'text-primary-foreground',
      ai: 'text-primary-foreground',
      brand: 'text-brand-foreground',
      destructive: 'text-destructive-foreground',
      ghost: 'text-foreground',
      link: 'text-primary underline',
    },
    size: {
      default: 'text-sm',
      xl: 'font-bold text-[15px]',
      sm: 'text-xs',
      lg: 'text-base',
      xs: 'font-bold text-[13px]',
      icon: 'text-sm',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps
  extends
    Omit<PressableProps, 'children' | 'disabled'>,
    Omit<VariantProps<typeof buttonVariants>, 'disabled'> {
  children?: ReactNode;
  className?: string;
  /** Classe aplicada ao texto, quando `children` é string. */
  textClassName?: string;
  disabled?: boolean;
  /** Troca o conteúdo por um spinner e bloqueia o toque. */
  loading?: boolean;
}

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    children,
    className,
    textClassName,
    variant,
    size,
    disabled,
    loading,
    style,
    onPressIn,
    onPressOut,
    ...props
  },
  ref,
) {
  const isDisabled = Boolean(disabled || loading);
  // Pressionado = escala .97 (prancha Componentes). Sem animar: o Pressable
  // animado do Reanimated perdia o `className` (fundo do botão sumia) no
  // NativeWind, e a troca instantânea também respeita "reduzir movimento".
  const [pressed, setPressed] = useState(false);
  const press = (p: boolean) => setPressed(p);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      // `disabled` no `accessibilityState` é o que faz o leitor de tela anunciar
      // "desativado" — sem ele o botão parece tocável para quem não vê a opacidade.
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={size === 'xs' ? 5 : undefined}
      className={cn(buttonVariants({ variant, size, disabled: isDisabled }), className)}
      style={[
        typeof style === 'function' ? undefined : style,
        { transform: [{ scale: pressScale(pressed) }] },
      ]}
      onPressIn={(e: GestureResponderEvent) => {
        press(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        press(false);
        onPressOut?.(e);
      }}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === 'default' || variant === 'add' || variant === 'ai'
              ? colors.primaryForeground
              : colors.primaryText
          }
        />
      ) : typeof children === 'string' ? (
        <>
          {variant === 'add' || variant === 'ai' ? (
            <Icon
              name={variant === 'add' ? 'plus' : 'spark'}
              size={16}
              color={colors.primaryForeground}
            />
          ) : null}
          <Text className={cn(labelVariants({ variant, size }), textClassName)}>{children}</Text>
        </>
      ) : (
        children
      )}
    </Pressable>
  );
});

export { buttonVariants };
