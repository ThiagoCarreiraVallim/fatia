/**
 * Contraste WCAG 2.x: luminância relativa e razão entre duas cores.
 *
 * É o mesmo código no app, na web, no painel e na API (validador da cor de
 * marca), para que o aviso que o editor mostra seja o mesmo que o servidor
 * aplica.
 */

export type Rgb = readonly [number, number, number];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** `#AbC` → `#aabbcc`. */
export function normalizeHex(hex: string): string {
  if (!isHexColor(hex)) throw new Error(`Cor inválida: ${hex}`);
  const h = hex.slice(1).toLowerCase();
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Canal sRGB (0–255) para linear (0–1). */
export function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear (0–1) para canal sRGB (0–255), sem arredondar. */
export function linearToSrgb(value: number): number {
  const c = Math.min(1, Math.max(0, value));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste (1 a 21), simétrica. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `4.3537` → `"4,3"` — o jeito como a razão aparece para quem lê. */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 10) / 10).toFixed(1).replace('.', ',');
}
