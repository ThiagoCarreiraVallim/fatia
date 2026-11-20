import { describe, expect, it } from 'vitest';
import {
  SCROLL_CHROME,
  chromeAfterIdle,
  initialScrollChrome,
  nextScrollChrome,
  type ScrollChromeState,
  chromeOnFocus,
} from '../scroll-chrome';

/**
 * A barra de abas que some ao rolar (item 4): desce ao rolar para baixo, volta
 * ao rolar para cima, ao parar (~250 ms), perto do topo e no fim da lista.
 */
const VIEWPORT = 800;
const CONTENT = 3000;
const frame = (y: number, content = CONTENT) => ({
  y,
  contentHeight: content,
  viewportHeight: VIEWPORT,
});

function scroll(ys: number[], start: ScrollChromeState = initialScrollChrome()) {
  return ys.reduce((s, y) => nextScrollChrome(s, frame(y)), start);
}

describe('nextScrollChrome', () => {
  it('começa visível', () => {
    expect(initialScrollChrome().hidden).toBe(false);
  });

  it('rolar para baixo além do limiar esconde', () => {
    expect(scroll([100, 110, 130, 160]).hidden).toBe(true);
  });

  it('tremida menor que o limiar não esconde', () => {
    const still: ScrollChromeState = { y: 100, anchor: 100, hidden: false };
    expect(nextScrollChrome(still, frame(100 + SCROLL_CHROME.threshold - 1)).hidden).toBe(false);
    expect(nextScrollChrome(still, frame(100 + SCROLL_CHROME.threshold + 1)).hidden).toBe(true);
  });

  it('rolar para cima além do limiar mostra de novo', () => {
    const hidden = scroll([100, 200, 400]);
    expect(hidden.hidden).toBe(true);
    expect(scroll([390, 380, 360], hidden).hidden).toBe(false);
  });

  it('a direção conta a partir de onde mudou, não do início', () => {
    // Desceu muito, subiu um pouco (menos que o limiar): continua escondida.
    const hidden = scroll([100, 600]);
    expect(scroll([600 - SCROLL_CHROME.threshold + 2], hidden).hidden).toBe(true);
  });

  it('perto do topo fica sempre visível', () => {
    const hidden = scroll([100, 400]);
    expect(nextScrollChrome(hidden, frame(SCROLL_CHROME.edge - 1)).hidden).toBe(false);
    // Puxar além do topo (o "bounce" do iOS) também.
    expect(nextScrollChrome(hidden, frame(-30)).hidden).toBe(false);
  });

  it('no fim da lista volta a aparecer', () => {
    const end = CONTENT - VIEWPORT;
    const hidden = scroll([100, 400, end - 200]);
    expect(hidden.hidden).toBe(true);
    expect(nextScrollChrome(hidden, frame(end - SCROLL_CHROME.edge + 1)).hidden).toBe(false);
  });

  it('tela que não rola não esconde a barra', () => {
    const s = nextScrollChrome(initialScrollChrome(), frame(60, VIEWPORT + 10));
    expect(s.hidden).toBe(false);
  });
});

describe('chromeAfterIdle', () => {
  it('parado, a barra volta e a próxima descida conta dali', () => {
    const hidden = scroll([100, 500]);
    const idle = chromeAfterIdle(hidden);
    expect(idle.hidden).toBe(false);
    expect(idle.anchor).toBe(500);
    expect(nextScrollChrome(idle, frame(505)).hidden).toBe(false);
    expect(nextScrollChrome(idle, frame(500 + SCROLL_CHROME.threshold + 1)).hidden).toBe(true);
  });

  it('o tempo parado é ~250 ms', () => {
    expect(SCROLL_CHROME.idleMs).toBe(250);
  });
});

/**
 * As abas ficam montadas: a rolagem de uma aba guarda o estado de quando a
 * barra sumiu. Ao voltar a ela, a barra está visível de novo, e um toque de
 * rolagem não pode escondê-la só porque o estado velho dizia "escondida".
 */
describe('chromeOnFocus — a barra volta visível ao voltar para a tela', () => {
  const frame = { contentHeight: 3000, viewportHeight: 800 };

  it('esquece o "escondida" e conta o limiar de onde a tela está', () => {
    const velho = { y: 500, anchor: 400, hidden: true };
    const agora = chromeOnFocus(velho);
    expect(agora.hidden).toBe(false);
    expect(nextScrollChrome(agora, { ...frame, y: 505 }).hidden).toBe(false);
    expect(nextScrollChrome(agora, { ...frame, y: 500 + 13 }).hidden).toBe(true);
  });
});
