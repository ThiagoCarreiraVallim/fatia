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
 * arrasto dela (e a inércia que esse arrasto deixa) muda a decisão.
 *
 * A rolagem que o próprio app faz (`scrollToEnd` animado) passa por posições longe do fim no meio
 * do caminho e, no Android, ainda dispara `onMomentumScrollBegin/End` como se fosse inércia. Por
 * isso a inércia só conta quando vem logo depois de um arrasto, e o app avisa quando rola
 * (`appScroll`) para a inércia dele não ser lida como da pessoa.
 */
export function createFollowEnd() {
  let following = true;
  let arrastando = false;
  // Soltou o dedo: a próxima inércia, se vier, é o arremesso da pessoa.
  let podeVirArremesso = false;
  let inerciaDaPessoa = false;
  return {
    get following() {
      return following;
    },
    /** Rolar sozinho só seguindo o fim e nunca contra o dedo de quem arrasta. */
    get shouldAutoScroll() {
      return following && !arrastando;
    },
    /** O app vai rolar (`scrollToEnd`): a inércia que vier é dele. */
    appScroll() {
      podeVirArremesso = false;
      inerciaDaPessoa = false;
    },
    dragStart() {
      arrastando = true;
      inerciaDaPessoa = false;
    },
    dragEnd(m: ScrollMetrics) {
      arrastando = false;
      following = isNearEnd(m);
      podeVirArremesso = true;
    },
    momentumStart() {
      inerciaDaPessoa = podeVirArremesso;
      podeVirArremesso = false;
    },
    momentumEnd(m: ScrollMetrics) {
      if (inerciaDaPessoa) following = isNearEnd(m);
      inerciaDaPessoa = false;
    },
    scroll(m: ScrollMetrics) {
      if (arrastando || inerciaDaPessoa) following = isNearEnd(m);
    },
    /** Mandou mensagem ou tocou em "Ir para o fim": volta a seguir. */
    followAgain() {
      following = true;
      podeVirArremesso = false;
      inerciaDaPessoa = false;
    },
  };
}
