/**
 * Leitura de tokens dos CSS, para os testes de paridade (aqui e no app).
 *
 * Lê por bloco, e não o arquivo inteiro: o bloco claro repete os nomes do
 * escuro, e juntar tudo faria o claro sobrescrever o escuro.
 */

/** O conteúdo entre as chaves do primeiro bloco aberto por `selector {`. */
export function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(^|[\\s;{}])${escaped}\\s*\\{`).exec(css);
  if (!m) throw new Error(`bloco "${selector}" não existe`);
  let depth = 1;
  const start = m.index + m[0].length;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i);
  }
  throw new Error(`bloco "${selector}" sem fechar`);
}

/** `--nome: valor;` do nível de cima do bloco (ignora blocos aninhados). */
export function readCssTokens(block: string): Record<string, string> {
  let flat = '';
  let depth = 0;
  for (const ch of block) {
    if (ch === '{') depth++;
    if (depth === 0) flat += ch;
    if (ch === '}') depth--;
  }
  const tokens: Record<string, string> = {};
  for (const [, name, value] of flat
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

/** "H S% L%" → "#rrggbb". */
export function hslToHex(hsl: string): string {
  const [h, s, l] = hsl.split(/\s+/).map((v) => parseFloat(v));
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = Math.round(255 * (lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    return v.toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
