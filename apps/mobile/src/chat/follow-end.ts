/** O que o `onScroll` (e os eventos de arrasto) de uma lista do React Native trazem. */
export type ScrollMetrics = {
  contentOffset: { y: number };
  layoutMeasurement: { height: number };
  contentSize: { height: number };
};

/**
 * A folga do "perto do fim": uma linha ou duas acima ainda conta. Sem ela, o meio pixel que o
 * streaming acrescenta entre dois quadros faria a conversa largar quem não mexeu em nada.
 */
const FOLGA_PX = 96;

export function isNearEnd(m: ScrollMetrics, folga = FOLGA_PX): boolean {
  const fim = m.contentSize.height - m.layoutMeasurement.height;
  return m.contentOffset.y >= fim - folga;
}

/**
 * Se a conversa segue o fim enquanto a resposta chega (#486). Quem decide é a pessoa: só o
 * arrasto dela (e a inércia que ele deixa) muda a decisão. A rolagem que o próprio app faz
 * (`scrollToEnd` animado) passa por posições longe do fim no meio do caminho, e não pode
 * desligar o seguir.
 */
export function createFollowEnd() {
  let following = true;
  let pessoaRolando = false;
  return {
    get following() {
      return following;
    },
    dragStart() {
      pessoaRolando = true;
    },
    dragEnd(m: ScrollMetrics) {
      following = isNearEnd(m);
      // Se vier inércia, `momentumStart` liga de novo; se não, a próxima rolagem é do app.
      pessoaRolando = false;
    },
    momentumStart() {
      pessoaRolando = true;
    },
    momentumEnd(m: ScrollMetrics) {
      if (!pessoaRolando) return;
      following = isNearEnd(m);
      pessoaRolando = false;
    },
    scroll(m: ScrollMetrics) {
      if (pessoaRolando) following = isNearEnd(m);
    },
    /** Mandou mensagem ou tocou em "Ir para o fim": volta a seguir. */
    followAgain() {
      following = true;
    },
  };
}
