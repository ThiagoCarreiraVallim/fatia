import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guarda do catálogo de medidas caseiras (`packages/db/prisma/data/medidas-caseiras.json`).
 *
 * O seed casa pelo nome exato da TACO e só avisa quando não acha — em produção
 * o aviso some no log e a medida simplesmente não aparece. Aqui o nome errado
 * (uma vírgula, um acento, o espaço que a TACO deixa no fim) quebra o CI.
 */
const DATA = resolve(__dirname, '../../../../../packages/db/prisma/data');

interface Entry {
  alimento: string;
  porcoes: Array<{ label: string; grams: number }>;
}

function tacoNames(): Set<string> {
  const names = new Set<string>();
  for (const line of readFileSync(resolve(DATA, 'taco.csv'), 'utf-8').split('\n')) {
    // Linha de alimento: número, depois a descrição — entre aspas quando tem vírgula.
    const m = /^(\d+),(?:"([^"]*)"|([^,]*)),/.exec(line);
    if (m) names.add((m[2] ?? m[3]).trim());
  }
  return names;
}

const catalog = (
  JSON.parse(readFileSync(resolve(DATA, 'medidas-caseiras.json'), 'utf-8')) as {
    medidas: Entry[];
  }
).medidas;

describe('catálogo de medidas caseiras', () => {
  it('lê a TACO inteira (o teste não passa por ler nada)', () => {
    expect(tacoNames().size).toBe(597);
  });

  it('todo alimento do catálogo existe na TACO com o nome exato', () => {
    const taco = tacoNames();
    expect(catalog.map((e) => e.alimento).filter((n) => !taco.has(n))).toEqual([]);
  });

  it('não repete alimento nem medida dentro do alimento', () => {
    const nomes = catalog.map((e) => e.alimento);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const e of catalog) {
      const labels = e.porcoes.map((p) => p.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('toda medida tem rótulo e um peso plausível', () => {
    for (const e of catalog) {
      expect(e.porcoes.length).toBeGreaterThan(0);
      for (const p of e.porcoes) {
        expect(p.label.trim()).toBe(p.label);
        expect(p.label.length).toBeGreaterThan(0);
        expect(p.grams).toBeGreaterThan(0);
        expect(p.grams).toBeLessThanOrEqual(1000);
      }
    }
  });
});
