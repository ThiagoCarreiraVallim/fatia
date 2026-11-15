import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Branco translúcido pensado para o escuro some no tema claro (ADR 041, item
 * 6): o trilho do anel de calorias em `rgba(255,255,255,0.06)` ficava
 * invisível com 0 kcal, e as bordas `border-white/10` sumiam no fundo claro.
 * Use os tokens (`border-subtle`, `bg-muted`…), que existem nos dois temas.
 *
 * Fora da regra só ficam as sobreposições sobre câmera e o cartão de
 * compartilhar, que tem fundo próprio e fixo.
 */
const SRC = path.resolve(__dirname, '../../..');
const ALLOWED = new Set([
  'components/nutrition/barcode-scanner.tsx',
  'components/sharing/share-card.tsx',
]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

describe('cores literais na web', () => {
  it('nenhum componente usa branco translúcido fixo em borda, fundo, divisor ou traço', () => {
    const offenders = tsxFiles(SRC)
      .map((f) => path.relative(SRC, f))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) =>
        /rgba\(\s*255\s*,\s*255\s*,\s*255|\b(border|bg|divide)-white\/\d+/.test(
          readFileSync(path.join(SRC, f), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
