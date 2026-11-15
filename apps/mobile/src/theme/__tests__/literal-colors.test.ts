import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cor literal em componente é defeito nos dois temas (ADR 041, item 6): um hex
 * escolhido para o escuro some no claro. O caso que motivou: os atalhos de água
 * do Hoje com `bg-[#16233d]`, texto água #1A66C2 a ~2,8:1 no tema claro.
 */
const ROOT = path.resolve(__dirname, '../../..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

const rel = (f: string) => path.relative(ROOT, f);

describe('cores literais', () => {
  it('nenhum className do app usa hex fixo ([#…])', () => {
    const offenders = [...tsxFiles(path.join(ROOT, 'app')), ...tsxFiles(path.join(ROOT, 'src'))]
      .filter((f) => /className=[^\n]*\[#[0-9a-fA-F]{3,8}\]/.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('os cards do Hoje não têm hex nem rgba fixos', () => {
    const offenders = [
      ...tsxFiles(path.join(ROOT, 'src/components/dashboard')),
      ...tsxFiles(path.join(ROOT, 'src/components/today')),
    ]
      .filter((f) => /'#[0-9a-fA-F]{3,8}'|rgba?\(/.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('nenhum componente usa branco translúcido fixo em borda, fundo, divisor ou traço', () => {
    // O trilho do anel de calorias em rgba(255,255,255,0.06) e a borda
    // border-white/5 da barra de topo somem no tema claro. Só a câmera, que
    // é sempre escura, pode usar branco translúcido.
    const allowed = new Set(['src/components/nutrition/photo-capture.tsx']);
    const offenders = [...tsxFiles(path.join(ROOT, 'app')), ...tsxFiles(path.join(ROOT, 'src'))]
      .map(rel)
      .filter((f) => !allowed.has(f))
      .filter((f) =>
        /rgba\(\s*255\s*,\s*255\s*,\s*255|\b(border|bg|divide)-white\/\d+/.test(
          readFileSync(path.join(ROOT, f), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
