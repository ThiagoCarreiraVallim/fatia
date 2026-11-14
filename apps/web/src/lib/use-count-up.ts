'use client';

import { useEffect, useState } from 'react';
import { duration, easeOut } from '@fatia/design';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * O número sobe junto com o anel (1,3 s, prancha Movimento). Com "reduzir
 * movimento" já mostra o valor final. Leitor de tela lê o valor final: quem
 * usa o número põe o alvo no rótulo acessível, não o que está contando.
 */
export function useCountUp(target: number, total: number = duration.data): number {
  const [value, setValue] = useState(target);

  useEffect(() => {
    const ms = prefersReducedMotion() ? 0 : total;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
      setValue(Math.round(target * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, total]);

  return value;
}
