import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import { Text } from './text';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';
import { colors } from '@/theme/colors';
import { pressScale } from '@/theme/motion-values';
import { duration } from '@fatia/design';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressable, { className: 'style' });

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
 *   diretrizes da Apple e do Material. O `sm` do web tem 32px e ficaria abaixo.
 */
const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-md', {
  variants: {
    variant: {
      default: 'bg-primary',
      destructive: 'bg-destructive',
      outline: 'border border-input bg-transparent',
      secondary: 'bg-secondary',
      ghost: 'bg-transparent',
      link: 'bg-transparent',
    },
    size: {
      default: 'min-h-[44px] px-4 py-2',
      sm: 'min-h-[44px] px-3 py-1',
      lg: 'min-h-[52px] px-8 py-3',
      icon: 'h-11 w-11 px-0',
    },
    disabled: {
      true: 'opacity-50',
      false: '',
    },
  },
  defaultVariants: { variant: 'default', size: 'default', disabled: false },
});

const labelVariants = cva('text-sm font-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      secondary: 'text-secondary-foreground',
      ghost: 'text-foreground',
      link: 'text-primary underline',
    },
    size: {
      default: 'text-sm',
      sm: 'text-xs',
      lg: 'text-base',
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
  // Pressionado = escala .97 (prancha Componentes); com "reduzir movimento" o
  // tamanho troca sem animar.
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const press = (pressed: boolean) => {
    scale.value = withTiming(pressScale(pressed), {
      duration: duration.fast,
      reduceMotion: ReduceMotion.System,
    });
  };
  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole="button"
      // `disabled` no `accessibilityState` é o que faz o leitor de tela anunciar
      // "desativado" — sem ele o botão parece tocável para quem não vê a opacidade.
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      className={cn(buttonVariants({ variant, size, disabled: isDisabled }), className)}
      style={[typeof style === 'function' ? undefined : style, pressStyle]}
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
          color={variant === 'default' ? colors.background : colors.primaryText}
        />
      ) : typeof children === 'string' ? (
        <Text className={cn(labelVariants({ variant, size }), textClassName)}>{children}</Text>
      ) : (
        children
      )}
    </AnimatedPressable>
  );
});

export { buttonVariants };
