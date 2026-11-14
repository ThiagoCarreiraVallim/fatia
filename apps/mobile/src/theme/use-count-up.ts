import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { duration } from '@fatia/design';
import { countUpValue } from './motion-values';

/**
 * O número sobe junto com o anel (1,3 s). Com "reduzir movimento" já aparece no
 * valor final. Usa requestAnimationFrame em vez de um valor animado porque o
 * que muda é o texto, que o Reanimated não anima sem um TextInput.
 */
export function useCountUp(target: number, total: number = duration.data): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    const ms = reduced ? 0 : total;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      setValue(countUpValue(target, elapsed, ms));
      if (elapsed < ms) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, total, reduced]);

  return value;
}
