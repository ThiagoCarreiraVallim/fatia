/**
 * Tokens do design system v2 "Noite" — a fonte em TypeScript.
 *
 * Os três CSS (apps/web/src/app/globals.css, apps/mobile/global.css e
 * apps/site/src/styles/global.css) repetem estes valores em HSL, porque é o
 * formato que o Tailwind usa (`hsl(var(--x))`). Os testes de paridade conferem
 * os três contra este arquivo; mudar uma cor só num lugar quebra ali.
 *
 * Os nomes são os mesmos nos dois temas (ADR 041). Mapa do canvas:
 * bg → background · s1 → muted · s2 → card (escuro) · s3 → surface-3 ·
 * line → border · line2 → border-strong · tx → foreground ·
 * tx2 → muted-foreground · tx3 → faint-foreground · lime → primary ·
 * ink → primary-foreground · bad → danger · warn → warning.
 * O #0c0c0c atrás da tela que encolhe no menu da IA (Al-H6c5) → sunken.
 *
 * No claro o cartão é branco (s1 do canvas) sobre o fundo #F4F5F2: é onde as
 * cores de dado passam 4,5:1. No escuro o cartão continua #2A2A2A, como hoje.
 */

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const TOKEN_NAMES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'primary-text',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'faint-foreground',
  'surface-3',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'border-strong',
  'input',
  'ring',
  'danger',
  'success',
  'warning',
  'info',
  'ok',
  'kcal',
  'protein',
  'carbs',
  'fat',
  'water',
  'steps',
  'brand',
  'brand-foreground',
  'sunken',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

export type Palette = Record<TokenName, string>;

const dark: Palette = {
  background: '#131313',
  foreground: '#e5e2e1',
  card: '#2a2a2a',
  'card-foreground': '#e5e2e1',
  popover: '#1a1a1a',
  'popover-foreground': '#e5e2e1',
  primary: '#2ce500',
  'primary-foreground': '#0b1a05',
  'primary-text': '#2ce500',
  secondary: '#333333',
  'secondary-foreground': '#e5e2e1',
  muted: '#1f1f1f',
  'muted-foreground': '#baccaf',
  'faint-foreground': '#9aa593',
  'surface-3': '#343434',
  accent: '#3c4b35',
  'accent-foreground': '#e5e2e1',
  destructive: '#93000a',
  'destructive-foreground': '#e5e2e1',
  border: '#383838',
  'border-strong': '#3d3d3d',
  input: '#383838',
  ring: '#2ce500',
  danger: '#fb7185',
  success: '#10b981',
  warning: '#fbbf24',
  info: '#60a5fa',
  ok: '#2ce500',
  kcal: '#e5e2e1',
  protein: '#6ea3ff',
  carbs: '#2ce500',
  fat: '#ffb4ab',
  water: '#60a5fa',
  steps: '#2dd4bf',
  brand: '#ff7a1a',
  'brand-foreground': '#1f0e00',
  sunken: '#0c0c0c',
};

/**
 * Claro (#352, ADR 041). Carbo, gordura, água, passos e proteína são os do
 * canvas. Perigo, aviso, sucesso e info não vinham no canvas para o claro: os
 * tons abaixo são os mais próximos dos do escuro que passam 4,5:1 no fundo e
 * no cartão, e pedem revisão de design.
 */
const light: Palette = {
  background: '#f4f5f2',
  foreground: '#141613',
  card: '#ffffff',
  'card-foreground': '#141613',
  popover: '#ffffff',
  'popover-foreground': '#141613',
  primary: '#2ce500',
  'primary-foreground': '#0b1a05',
  'primary-text': '#1a7f00',
  secondary: '#e1e4dd',
  'secondary-foreground': '#141613',
  muted: '#eceee9',
  'muted-foreground': '#4f544b',
  'faint-foreground': '#646a60',
  'surface-3': '#e1e4dd',
  accent: '#e3ebdb',
  'accent-foreground': '#141613',
  destructive: '#b42318',
  'destructive-foreground': '#ffffff',
  border: '#e1e4dd',
  'border-strong': '#cdd1c8',
  input: '#cdd1c8',
  ring: '#1a7f00',
  danger: '#b42318',
  success: '#0b7a50',
  warning: '#8a5a00',
  info: '#1a66c2',
  ok: '#1a7f00',
  kcal: '#141613',
  protein: '#2563eb',
  carbs: '#1a7f00',
  fat: '#b93a2e',
  water: '#1a66c2',
  steps: '#0e7468',
  brand: '#ff7a1a',
  'brand-foreground': '#1f0e00',
  sunken: '#e6e8e3',
};

export const palettes: Record<Theme, Palette> = { dark, light };

/** Tokens translúcidos: cor + opacidade, por tema. Só a web os usa como CSS. */
export const SOFT_TOKENS = {
  'border-subtle': { dark: ['#ffffff', 0.05], light: ['#000000', 0.06] },
  'primary-soft': { dark: ['#2ce500', 0.12], light: ['#2ce500', 0.16] },
  'brand-soft': { dark: ['#ff7a1a', 0.14], light: ['#ff7a1a', 0.14] },
} as const satisfies Record<string, Record<Theme, readonly [string, number]>>;
export type SoftTokenName = keyof typeof SOFT_TOKENS;

/** Cor padrão da comunidade (quando ela não escolheu nenhuma). */
export const DEFAULT_BRAND = { color: '#ff7a1a', text: '#1f0e00' } as const;

/** Raios do canvas, em px. Pílula só em selo e interruptor. */
export const radius = { chip: 10, field: 14, card: 20, sheet: 28, pill: 999 } as const;

/** Espaço: a escala de 4 em 4 do Tailwind; margem da tela 20, entre blocos 12–16. */
export const spacing = {
  scale: [4, 8, 12, 16, 20, 24, 32, 48],
  screenMargin: 20,
  blockGap: [12, 16],
  minTarget: 44,
} as const;

/** Escala de tipo. `display` = Sora (números e títulos); `body` = Manrope. */
export const typeScale = {
  d1: { size: 56, weight: 700, lineHeight: 1, tracking: -0.04, family: 'display' },
  d2: { size: 40, weight: 700, lineHeight: 1, tracking: -0.03, family: 'display' },
  d3: { size: 28, weight: 700, lineHeight: 1.1, tracking: -0.02, family: 'display' },
  h1: { size: 28, weight: 700, lineHeight: 1.15, tracking: -0.02, family: 'display' },
  h2: { size: 22, weight: 700, lineHeight: 1.2, tracking: -0.015, family: 'display' },
  h3: { size: 17, weight: 600, lineHeight: 1.3, tracking: 0, family: 'display' },
  b1: { size: 15, weight: 400, lineHeight: 1.45, tracking: 0, family: 'body' },
  b2: { size: 13, weight: 400, lineHeight: 1.4, tracking: 0, family: 'body' },
  eb: { size: 12, weight: 700, lineHeight: 1.3, tracking: 0.06, family: 'body' },
} as const;
export type TypeStep = keyof typeof typeScale;

/** HSL "H S% L%" (o formato dos CSS), com uma casa decimal. */
export function hexToHslTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const f = (v: number) => String(Math.round(v * 10) / 10);
  return `${f(h)} ${f(s * 100)}% ${f(l * 100)}%`;
}

/** As linhas `--nome: H S% L%;` de um tema, para colar nos CSS. */
export function cssVariables(theme: Theme, names: readonly TokenName[] = TOKEN_NAMES): string {
  const p = palettes[theme];
  const lines = names.map((n) => `--${n}: ${hexToHslTriplet(p[n])}; /* ${p[n]} */`);
  return lines.join('\n');
}
