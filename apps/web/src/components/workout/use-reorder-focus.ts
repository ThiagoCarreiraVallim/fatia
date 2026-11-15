'use client';

import { useEffect, useRef } from 'react';

/**
 * Reordenar perdia o foco (#221). São dois efeitos somados: o nó do card muda
 * de lugar no DOM e a seta que está sob o foco vira `disabled` até a API
 * responder. O navegador manda o foco para o `<body>`, então quem navega por
 * teclado ou switch volta para o começo do documento a cada movimento —
 * justamente quem mais depende das setas, porque arrastar não é opção.
 *
 * Sem lista de dependências de propósito: com a resposta instantânea o
 * `isPending` da mutation nasce e morre dentro do mesmo commit, e um efeito
 * com `[isMoving]` nunca reexecutaria. O corpo sai na primeira linha quando não
 * há seta acionada, que é o caso de quase todo render.
 */
export function useReorderFocus(isMoving: boolean | undefined) {
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  /** Seta acionada neste card. Só quem pediu a troca devolve o foco. */
  const pressed = useRef<'up' | 'down' | null>(null);

  useEffect(() => {
    if (isMoving) return;
    const which = pressed.current;
    pressed.current = null;
    if (!which) return;
    // Se o foco não está no `<body>`, ele não se perdeu: a pessoa foi para
    // outro controle durante o voo. Puxá-lo de volta seria pior.
    if (document.activeElement && document.activeElement !== document.body) return;
    const used = which === 'up' ? upRef.current : downRef.current;
    const sibling = which === 'up' ? downRef.current : upRef.current;
    // Parar na borda desabilita justamente a seta usada; a irmã fica no mesmo card.
    const target = used && !used.disabled ? used : sibling;
    target?.focus();
  });

  return {
    upRef,
    downRef,
    markUp: () => {
      pressed.current = 'up';
    },
    markDown: () => {
      pressed.current = 'down';
    },
  };
}
