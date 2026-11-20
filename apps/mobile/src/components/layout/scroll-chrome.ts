/**
 * Quando a barra de abas (e o botão da IA) some ao rolar (item 4).
 *
 * Mora no app, e não no `@fatia/api-client`, porque roda como worklet dentro do
 * `useAnimatedScrollHandler`, a cada quadro de rolagem, na thread de UI; e só o
 * app tem a barra que some. Sem Reanimated aqui, para testar no Node.
 */
export const SCROLL_CHROME = {
  /** Quanto rolar na mesma direção antes de esconder ou mostrar, px. */
  threshold: 12,
  /** Distância do topo e do fim em que a barra fica sempre visível, px. */
  edge: 24,
  /** Parado por este tempo, a barra volta. */
  idleMs: 250,
  /** Animação de descer e subir. */
  slideMs: 220,
} as const;

export interface ScrollChromeState {
  /** Último deslocamento visto. */
  y: number;
  /** Onde a direção atual começou: o limiar conta daqui. */
  anchor: number;
  hidden: boolean;
}

export interface ScrollFrame {
  y: number;
  contentHeight: number;
  viewportHeight: number;
}

export function initialScrollChrome(): ScrollChromeState {
  'worklet';
  return { y: 0, anchor: 0, hidden: false };
}

export function nextScrollChrome(prev: ScrollChromeState, frame: ScrollFrame): ScrollChromeState {
  'worklet';
  const { y } = frame;
  const maxY = frame.contentHeight - frame.viewportHeight;
  // Perto do topo (ou puxando além dele), perto do fim, ou tela que quase não
  // rola: a barra fica, e a contagem recomeça dali.
  if (y <= SCROLL_CHROME.edge || maxY <= SCROLL_CHROME.edge * 2 || maxY - y < SCROLL_CHROME.edge) {
    return { y, anchor: y, hidden: false };
  }
  const delta = y - prev.y;
  if (delta === 0) return prev;
  const before = prev.y - prev.anchor;
  // Mudou de direção: o limiar passa a contar do ponto da virada.
  const anchor = before !== 0 && Math.sign(before) !== Math.sign(delta) ? prev.y : prev.anchor;
  const travelled = y - anchor;
  let hidden = prev.hidden;
  if (travelled > SCROLL_CHROME.threshold) hidden = true;
  else if (travelled < -SCROLL_CHROME.threshold) hidden = false;
  return { y, anchor, hidden };
}

/** Parou de rolar: a barra volta, e a próxima descida conta a partir dali. */
export function chromeAfterIdle(state: ScrollChromeState): ScrollChromeState {
  'worklet';
  return { y: state.y, anchor: state.y, hidden: false };
}

/**
 * A tela voltou a ter foco (aba montada, ou volta de outra rota): a barra já
 * voltou visível, então o estado desta rolagem também — a contagem recomeça de
 * onde a tela está.
 */
export function chromeOnFocus(state: ScrollChromeState): ScrollChromeState {
  'worklet';
  return chromeAfterIdle(state);
}
