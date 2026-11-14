import {
  Easing,
  FadeInDown,
  ReduceMotion,
  useReducedMotion,
  withSpring,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LIST_RISE_PX, easing } from '@fatia/design';
import { motionTiming, type MotionKind } from './motion-values';

/**
 * Movimento do design system no app (Reanimated). Os números vêm de
 * `@fatia/design`; tudo passa `ReduceMotion.System`, então com "reduzir
 * movimento" ligado a animação pula para o estado final.
 */

export const dsEase = Easing.bezier(...easing.ease);
export const dsSpring = Easing.bezier(...easing.spring);

export function timing(kind: MotionKind): WithTimingConfig {
  return {
    duration: motionTiming(kind, false).duration,
    easing: dsEase,
    reduceMotion: ReduceMotion.System,
  };
}

/** Anima um valor com a duração do tipo pedido. */
export function animateTo(value: number, kind: MotionKind = 'base') {
  'worklet';
  return withTiming(value, timing(kind));
}

/** Mola do check e da conquista (.35 s, um pouco de rebote). */
export function popSpring(value: number) {
  'worklet';
  return withSpring(value, {
    damping: 12,
    stiffness: 220,
    reduceMotion: ReduceMotion.System,
  });
}

/** Entrada em cascata: sobe 14 px + fade, 70 ms entre itens. */
export function listEntering(index: number) {
  const { duration, delay } = motionTiming('sheet', false, { index, stagger: 'list' });
  return FadeInDown.withInitialValues({ transform: [{ translateY: LIST_RISE_PX }] })
    .duration(duration)
    .delay(delay)
    .easing(dsEase)
    .reduceMotion(ReduceMotion.System);
}

/** Vibração leve do check e da conquista (o canvas pede "vibração leve no app"). */
export function lightHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export { useReducedMotion };
