import { duration, easeOut, motionMs, staggerDelay, stagger } from '@fatia/design';

/**
 * Os números do movimento, sem Reanimated (para testar no Node). Quem anima
 * (`motion.ts`, componentes) pega a duração e o atraso daqui, já zerados com
 * "reduzir movimento".
 */
export type MotionKind = 'fast' | 'base' | 'tab' | 'sheet' | 'data' | 'pop';

export function motionTiming(
  kind: MotionKind,
  reducedMotion: boolean,
  sequence?: { index: number; stagger: keyof typeof stagger },
): { duration: number; delay: number } {
  return {
    duration: motionMs(duration[kind], reducedMotion),
    delay: sequence ? staggerDelay(sequence.index, sequence.stagger, reducedMotion) : 0,
  };
}

/** O número exibido na contagem, `elapsed` ms depois do início. */
export function countUpValue(target: number, elapsed: number, total: number): number {
  if (total <= 0) return target;
  return Math.round(target * easeOut(elapsed / total));
}

/**
 * Quanto o toast fica: 2,5 s sem ação, 5 s com "Desfazer" (2,5 s não dá para
 * ler e alcançar o botão, WCAG 2.2.1). Mesmo número do `toastDuration` da web.
 */
export function toastDuration(hasAction: boolean): number {
  return hasAction ? duration.toastWithAction : duration.toast;
}

/** Botão pressionado encolhe para .97 (o `.anim-press` da web). */
export function pressScale(pressed: boolean): number {
  return pressed ? 0.97 : 1;
}
