import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  barHeightPercent,
  dayA11yLabel,
  HEATMAP_LEVEL_OPACITY,
  ringGeometry,
  ringPercent,
} from '../ds-math';

/**
 * Blocos de dado do app (prancha Componentes · Blocos de dado), com as mesmas
 * contas da web (`apps/web/src/components/ui/data-blocks.tsx`). O vitest do
 * app não renderiza React Native: aqui ficam as contas e a conferência de
 * que a galeria mostra cada seção da prancha.
 */
describe('anel', () => {
  it('a fração fica entre 0 e 100, e meta 0 não divide por zero', () => {
    expect(ringPercent(1240, 2000)).toBe(62);
    expect(ringPercent(2600, 2000)).toBe(100);
    expect(ringPercent(-5, 2000)).toBe(0);
    expect(ringPercent(10, 0)).toBe(0);
  });

  it('o raio desconta metade do traço, como na web', () => {
    const g = ringGeometry(132, 10);
    expect(g.radius).toBe(61);
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 61);
  });
});

describe('barras e mapa de calor', () => {
  it('a barra mais alta enche; nenhuma some (mínimo de 6%)', () => {
    expect(barHeightPercent(4, 4)).toBe(100);
    expect(barHeightPercent(0, 4)).toBe(6);
    expect(barHeightPercent(1, 0)).toBe(100);
  });

  it('o mapa de calor tem 4 níveis, do fundo ao verde cheio', () => {
    expect(HEATMAP_LEVEL_OPACITY).toEqual([0, 0.25, 0.5, 1]);
  });
});

describe('faixa de dias', () => {
  it('o leitor de tela ouve o dia e se já foi registrado', () => {
    expect(dayA11yLabel({ weekday: 'Q', day: 4, label: 'quarta, 4 de novembro', done: true })).toBe(
      'quarta, 4 de novembro, registrado',
    );
    expect(dayA11yLabel({ weekday: 'Q', day: 5, label: 'quinta, 5 de novembro' })).toBe(
      'quinta, 5 de novembro',
    );
  });
});

const ROOT = path.resolve(__dirname, '../../../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

describe('galeria do app', () => {
  const gallery = read('app/(app)/design-system.tsx');

  it('tem todas as seções da prancha Componentes', () => {
    for (const title of ['Botões', 'Seleção', 'Campos', 'Blocos de dado', 'Retorno', 'Estados']) {
      expect(gallery, title).toContain(`title="${title}"`);
    }
  });

  it('mostra todas as variantes de botão da prancha', () => {
    for (const label of [
      'Salvar',
      'Secundário',
      'Contorno',
      'Texto',
      'Apagar',
      'Adicionar',
      'Pequeno',
      'Mini',
      'Desativado',
      'Gerar com IA',
    ]) {
      expect(gallery, label).toContain(label);
    }
  });

  it('usa os componentes de dado e de seleção do DS', () => {
    for (const c of [
      '<Ring',
      '<StatBlock',
      '<DayStrip',
      '<Heatmap',
      '<Bars',
      '<Checkbox',
      '<Segmented',
      '<Switch',
      '<Chip',
      '<EmptyState',
      '<ErrorState',
      '<LoadingState',
    ]) {
      expect(gallery, c).toContain(c);
    }
  });
});

describe('botão do app', () => {
  const button = read('src/components/ui/button.tsx');

  it('o rótulo tem peso 600, como a web e a prancha', () => {
    expect(button).toMatch(/const labelVariants = cva\('text-sm font-semibold'/);
  });

  it('tem as variantes e os tamanhos da prancha (texto, apagar, adicionar, IA; 52, 44, 34)', () => {
    for (const v of ['text:', 'danger:', 'add:', 'ai:', 'brand:', 'xl:', 'xs:']) {
      expect(button, v).toContain(v);
    }
    expect(button).toContain("true: 'opacity-40'");
  });
});
