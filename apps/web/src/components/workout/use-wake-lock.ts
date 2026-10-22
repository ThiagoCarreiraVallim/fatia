'use client';

import { useEffect } from 'react';

/**
 * Mantém a tela acesa enquanto `enabled` — no PWA, o `useKeepAwake` do app.
 *
 * A tela apagando no meio da série obriga a desbloquear o celular com a mão que
 * está segurando a barra. A Screen Wake Lock API resolve, com duas pegadinhas:
 * o navegador solta o lock sozinho quando a aba some (troca de app, tela
 * bloqueada), então é preciso pedir de novo no `visibilitychange`; e nem todo
 * navegador tem a API — sem ela, ou com o pedido negado (bateria fraca), o
 * treino segue normal, só com a tela apagando como sempre.
 */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    async function acquire() {
      // Pedir com a aba escondida é recusado de cara; o `visibilitychange` pede depois.
      if (document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        // Saiu da tela enquanto o pedido estava em voo: solta na hora, senão
        // o lock ficaria preso sem ninguém para liberar.
        if (disposed) void next.release().catch(() => {});
        else sentinel = next;
      } catch {
        // Negado pelo navegador: segue sem.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void acquire();
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}
