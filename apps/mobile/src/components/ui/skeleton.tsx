import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { cn } from './utils';

/**
 * Esqueleto de carregamento (item 6): a tela aparece na hora com a forma do
 * que vem, e o conteúdo entra no lugar. Uma pulsação só por grupo
 * (`SkeletonGroup`), para os blocos respirarem juntos; com "reduzir movimento",
 * fica parado.
 */
const PulseContext = createContext<SharedValue<number> | null>(null);

export function SkeletonGroup({
  children,
  label = 'Carregando',
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(
      withRepeat(
        withTiming(1, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);
  return (
    <PulseContext.Provider value={pulse}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        className={cn('gap-3', className)}
      >
        {children}
      </View>
    </PulseContext.Provider>
  );
}

/** Um bloco cinza com a forma do que vai aparecer. */
export function Skeleton({
  height,
  width = '100%',
  className,
}: {
  height: number;
  width?: DimensionValue;
  className?: string;
}) {
  const pulse = useContext(PulseContext);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + 0.35 * (pulse?.get() ?? 0) }));
  return (
    <Animated.View
      accessible={false}
      style={[{ height, width }, style]}
      className={cn('rounded-card bg-card', className)}
    />
  );
}
