import {
  contrastRatio,
  formatRatio,
  hexToRgb,
  isHexColor,
  linearToSrgb,
  normalizeHex,
  rgbToHex,
  srgbToLinear,
} from './contrast';

/**
 * Cor da comunidade (`--brand`): o editor de marca do painel e a API usam a
 * mesma regra.
 *
 * 1. A cor precisa aceitar texto branco ou o escuro da marca (#0B1A05) com
 *    4,5:1. O texto escolhido é o que tem mais contraste.
 * 2. Se nenhum passa, a cor ainda é aceita, mas vem um aviso e a sugestão do
 *    tom mais próximo que passa: o mesmo matiz, escurecido (para texto branco)
 *    ou clareado (para texto escuro) em OKLab até {@link SUGGESTION_TARGET}.
 *    O alvo tem folga sobre 4,5 porque um tom que passa raspando volta a
 *    falhar em tela ruim e em texto fino; com 5,5 o roxo #7C5CFF vira ≈ #6A4AE0
 *    (a referência do canvas).
 * 3. Verde perto do verde do Fatia é recusado: a cor da comunidade nunca pode
 *    se confundir com a marca nem com o "na meta". "Perto" é distância OKLab
 *    menor que {@link FATIA_GREEN_DISTANCE} (0,1): pega #2EE600, #5CFF2E e
 *    #00FF00, e deixa passar verdes de outra família, como #22C55E (0,114).
 */

export const FATIA_GREEN = '#2ce500';
export const BRAND_LIGHT_TEXT = '#ffffff';
export const BRAND_DARK_TEXT = '#0b1a05';
export const MIN_TEXT_CONTRAST = 4.5;
export const SUGGESTION_TARGET = 5.5;
export const FATIA_GREEN_DISTANCE = 0.1;

export type BrandColorCheck =
  | { status: 'ok'; color: string; text: string; contrast: number }
  | {
      status: 'warning';
      color: string;
      text: string;
      contrast: number;
      suggestion: string;
      suggestionText: string;
      message: string;
    }
  | { status: 'rejected'; reason: 'invalid' | 'fatia-green'; message: string };

type Oklab = [number, number, number];

function toOklab(hex: string): Oklab {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Oklab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return rgbToHex([
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/** Distância euclidiana em OKLab (0 = mesma cor; ~0,02 já é perceptível). */
export function oklabDistance(a: string, b: string): number {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export function isNearFatiaGreen(hex: string): boolean {
  return oklabDistance(hex, FATIA_GREEN) < FATIA_GREEN_DISTANCE;
}

/** O texto (branco ou escuro) com mais contraste sobre a cor. */
export function bestTextOn(hex: string): { text: string; contrast: number } {
  const light = contrastRatio(hex, BRAND_LIGHT_TEXT);
  const dark = contrastRatio(hex, BRAND_DARK_TEXT);
  return light >= dark
    ? { text: BRAND_LIGHT_TEXT, contrast: light }
    : { text: BRAND_DARK_TEXT, contrast: dark };
}

/**
 * Tom mais próximo que passa {@link SUGGESTION_TARGET} com o texto dado.
 * Escurecer encolhe L, a e b juntos (o matiz se mantém); clarear mistura com
 * o branco em OKLab.
 */
function suggestTone(hex: string, text: string): string | null {
  const [L, a, b] = toOklab(hex);
  const darken = text === BRAND_LIGHT_TEXT;
  for (let step = 1; step <= 140; step++) {
    const t = step * 0.005;
    const candidate = darken
      ? fromOklab([L * (1 - t), a * (1 - t), b * (1 - t)])
      : fromOklab([L + (1 - L) * t, a * (1 - t), b * (1 - t)]);
    if (contrastRatio(candidate, text) >= SUGGESTION_TARGET) {
      return isNearFatiaGreen(candidate) ? null : candidate;
    }
  }
  return null;
}

export function checkBrandColor(input: string): BrandColorCheck {
  if (!isHexColor(input)) {
    return {
      status: 'rejected',
      reason: 'invalid',
      message: 'Use uma cor em hexadecimal, como #FF7A1A.',
    };
  }
  const color = normalizeHex(input);
  if (isNearFatiaGreen(color)) {
    return {
      status: 'rejected',
      reason: 'fatia-green',
      message: 'Essa cor fica perto demais do verde do Fatia. Escolha outra cor para a comunidade.',
    };
  }

  const best = bestTextOn(color);
  if (best.contrast >= MIN_TEXT_CONTRAST) {
    return { status: 'ok', color, text: best.text, contrast: best.contrast };
  }

  // Tenta os dois sentidos e fica com a sugestão mais próxima da cor original.
  const options = [BRAND_LIGHT_TEXT, BRAND_DARK_TEXT]
    .map((text) => ({ text, tone: suggestTone(color, text) }))
    .filter((o): o is { text: string; tone: string } => o.tone !== null)
    .sort((x, y) => oklabDistance(x.tone, color) - oklabDistance(y.tone, color));
  const pick = options[0] ?? { text: BRAND_LIGHT_TEXT, tone: '#000000' };

  return {
    status: 'warning',
    color,
    text: best.text,
    contrast: best.contrast,
    suggestion: pick.tone,
    suggestionText: pick.text,
    message: `Texto branco ou escuro sobre essa cor não chega a 4,5:1 (dá ${formatRatio(
      best.contrast,
    )}:1). Sugestão: ${pick.tone.toUpperCase()}.`,
  };
}
