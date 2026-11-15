import { useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { rulerMajorTick } from '@fatia/api-client';
import { cn } from './utils';
import { RULER_TICK_PX, rulerValueFromDrag } from './ds-math';
import { Text } from './text';

/**
 * Régua (prancha Componentes · Campos: peso, altura), espelho do `ruler.tsx`
 * da web. Arrastar anda um passo por traço; o leitor de tela ganha o controle
 * "ajustável" (deslizar para cima/baixo), então o gesto não é o único caminho.
 */
export function Ruler({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  label,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  label: string;
  className?: string;
}) {
  const range = { min, max, step };
  const latest = useRef({ value, onChange, range });
  useLayoutEffect(() => {
    latest.current = { value, onChange, range };
  });
  const start = useRef(value);
  // Os refs só são lidos dentro dos callbacks do gesto, nunca no render.
  // eslint-disable-next-line react-hooks/refs -- PanResponder criado uma vez
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
      onPanResponderGrant: () => {
        start.current = latest.current.value;
      },
      onPanResponderMove: (_, g) => {
        const next = rulerValueFromDrag(start.current, g.dx, latest.current.range);
        if (next !== latest.current.value) latest.current.onChange(next);
      },
    }),
  );

  const shown = `${value.toLocaleString('pt-BR')} ${unit}`;
  const ticks = 21;
  return (
    <View className={cn('gap-3', className)}>
      <View className="flex-row items-end justify-between">
        <Text className="font-sans-semibold text-b2 text-muted-foreground">{label}</Text>
        <Text className="font-display text-[28px] leading-[28px] text-foreground">
          {value.toLocaleString('pt-BR')}
          <Text className="font-sans-semibold text-xs text-muted-foreground"> {unit}</Text>
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const dir = e.nativeEvent.actionName === 'increment' ? -1 : 1;
          onChange(rulerValueFromDrag(value, dir * RULER_TICK_PX, range));
        }}
        className="h-11 flex-row items-center justify-between overflow-hidden rounded-field bg-muted px-3"
        {...pan.panHandlers}
      >
        {Array.from({ length: ticks }, (_, i) => (
          <View
            key={i}
            className={cn(
              'w-px bg-border-strong',
              rulerMajorTick(i, { value, min, step }) ? 'h-5' : 'h-3',
            )}
          />
        ))}
        <View
          pointerEvents="none"
          className="absolute bottom-2 top-2 w-0.5 rounded bg-primary"
          style={{ left: '50%' }}
        />
      </View>
    </View>
  );
}
