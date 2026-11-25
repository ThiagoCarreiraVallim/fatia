/**
 * O ciclo da folha (`Drawer`), sem tela (#483).
 *
 * Antes, a folha desmontava no instante em que o @gorhom dizia "fechou" e
 * confiava só no `onChange(-1)` para avisar o pai. Num arrasto rápido para
 * baixo, a folha sumia de uma vez em vez de descer, e o rascunho se perdia sem
 * pergunta. Aqui o fechar tem três momentos:
 *
 * - `open`: montada e em cima;
 * - `closing`: descendo; o pai já sabe que fechou (o menu de baixo volta), mas a
 *   folha só desmonta quando a animação assenta (`closed`);
 * - `closed`: desmontada.
 *
 * Eventos: `open`/`close` são o `open` do pai; `dismiss` é a pessoa fechando
 * (arrasto, toque fora, voltar do Android); `closed` é a animação que assentou.
 * Com rascunho mexido (`dirty`), o `dismiss` devolve a folha ao lugar e pergunta.
 */
export type DrawerPhase = 'closed' | 'open' | 'closing';
export type DrawerEvent = { type: 'open' | 'close' | 'dismiss' | 'closed' };
export type DrawerEffect =
  'expand' | 'animateClose' | 'notifyClosed' | 'snapBack' | 'confirmDiscard';

export function drawerStep(
  phase: DrawerPhase,
  event: DrawerEvent,
  dirty: boolean,
): { phase: DrawerPhase; effects: DrawerEffect[] } {
  switch (event.type) {
    case 'open':
      return phase === 'open' ? { phase, effects: [] } : { phase: 'open', effects: ['expand'] };
    case 'close':
      return phase === 'open'
        ? { phase: 'closing', effects: ['animateClose'] }
        : { phase, effects: [] };
    case 'dismiss':
      if (phase !== 'open') return { phase, effects: [] };
      if (dirty) return { phase: 'open', effects: ['snapBack', 'confirmDiscard'] };
      return { phase: 'closing', effects: ['notifyClosed', 'animateClose'] };
    case 'closed':
      if (phase === 'closing') return { phase: 'closed', effects: [] };
      // Fechou sem passar pelo início da animação (descida instantânea com
      // "reduzir movimento", fling rápido demais, fechar durante a subida).
      if (phase === 'open') {
        // Com rascunho mexido, é o mesmo arrasto de sempre: a folha volta e pergunta.
        if (dirty) return { phase: 'open', effects: ['snapBack', 'confirmDiscard'] };
        // Sem rascunho, o pai ainda precisa saber, senão o `open` dele fica preso em `true`.
        return { phase: 'closed', effects: ['notifyClosed'] };
      }
      return { phase, effects: [] };
  }
}

/**
 * Os avisos do @gorhom traduzidos em eventos da folha.
 *
 * - `onAnimate` para -1 é o começo da descida (`dismiss`). O gorhom o pula
 *   quando a animação já terminou ao chegar no JS ("reduzir movimento"), e
 *   também durante a subida, em que o índice atual ainda é -1.
 * - O fim é o `onClose`, e não o `onChange(-1)`: o `onChange` só vem quando o
 *   índice muda, e fechar durante a subida (índice -1 → -1) não o emite. Sem
 *   aviso nenhum, a folha ficava `open`, o pai preso em `true` e a barra de
 *   baixo escondida. O `onClose` vem sempre que a animação termina em -1.
 */
export function drawerSheetCallbacks(send: (type: DrawerEvent['type']) => void) {
  return {
    onAnimate: (from: number, to: number) => {
      if (to === -1 && from !== -1) send('dismiss');
    },
    onClose: () => send('closed'),
  };
}
