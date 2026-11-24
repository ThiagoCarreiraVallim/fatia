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
      // Fechou sem passar pelo início da animação (fling rápido demais): o pai
      // ainda precisa saber, senão o `open` dele fica preso em `true`.
      if (phase === 'open') return { phase: 'closed', effects: ['notifyClosed'] };
      return { phase, effects: [] };
  }
}
