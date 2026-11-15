import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import { swipeSettle } from '@fatia/api-client';
import { useReducedMotion } from 'react-native-reanimated';
import { duration } from '@fatia/design';
import { colors } from '@/theme/colors';
import { cn } from './utils';
import { Icon } from './icon';
import { Text } from './text';

const ACTION_WIDTH = 88;

export interface SwipeAction {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}

/**
 * Linha de lista com swipe (prancha Componentes · Listas), espelho do
 * `swipe-row.tsx` da web: arrastar para a esquerda revela Editar/Apagar. O
 * gesto nunca é o único caminho: "Mais ações" abre as mesmas ações, e o
 * leitor de tela as recebe também como ações da linha.
 */
export function SwipeRow({
  children,
  actions,
  label,
  className,
}: {
  children: ReactNode;
  actions: SwipeAction[];
  /** O objeto da linha, para nomear o botão ("Mais ações: Café da manhã"). */
  label: string;
  className?: string;
}) {
  const full = actions.length * ACTION_WIDTH;
  const reduced = useReducedMotion();
  const [x] = useState(() => new Animated.Value(0));
  const base = useRef(0);
  const [open, setOpen] = useState(false);

  const settle = (to: number) => {
    base.current = to;
    setOpen(to !== 0);
    Animated.timing(x, {
      toValue: to,
      duration: reduced ? 0 : duration.base,
      useNativeDriver: true,
    }).start();
  };
  const settleRef = useRef(settle);
  useLayoutEffect(() => {
    settleRef.current = settle;
  });

  // Os refs só são lidos dentro dos callbacks do gesto, nunca no render.
  // eslint-disable-next-line react-hooks/refs -- PanResponder criado uma vez
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        x.setValue(Math.min(0, Math.max(-full, base.current + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        settleRef.current(swipeSettle(Math.min(0, base.current + g.dx), full));
      },
      onPanResponderTerminate: () => settleRef.current(base.current),
    }),
  );

  return (
    <View
      className={cn('overflow-hidden', className)}
      accessibilityActions={actions.map((a) => ({ name: a.label, label: a.label }))}
      onAccessibilityAction={(e) =>
        actions.find((a) => a.label === e.nativeEvent.actionName)?.onPress()
      }
    >
      <View
        className="absolute inset-y-0 right-0 flex-row"
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => {
              settle(0);
              a.onPress();
            }}
            style={{ width: ACTION_WIDTH }}
            className={cn(
              'items-center justify-center',
              a.tone === 'danger' ? 'bg-destructive' : 'bg-surface-3',
            )}
          >
            <Text
              className={cn(
                'font-sans-bold text-sm',
                a.tone === 'danger' ? 'text-destructive-foreground' : 'text-foreground',
              )}
            >
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Animated.View
        style={{ transform: [{ translateX: x }] }}
        className="min-h-[60px] flex-row items-center gap-3.5 bg-card py-3.5 pl-[18px] pr-2"
        {...pan.panHandlers}
      >
        <View className="min-w-0 flex-1">{children}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mais ações: ${label}`}
          accessibilityState={{ expanded: open }}
          onPress={() => settle(open ? 0 : -full)}
          className="h-11 w-11 items-center justify-center rounded-chip"
        >
          <Icon name="more" size={20} color={colors.faintForeground} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
