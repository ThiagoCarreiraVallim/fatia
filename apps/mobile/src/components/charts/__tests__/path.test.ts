import { describe, expect, it } from 'vitest';
import { areaPath, linePath, monotonePath, type Point } from '../path';

const series: Point[] = [
  { x: 0, y: 100 },
  { x: 50, y: 60 },
  { x: 100, y: 80 },
  { x: 150, y: 20 },
];

describe('linePath', () => {
  it('devolve string vazia sem pontos', () => {
    expect(linePath([])).toBe('');
  });

  it('move para o primeiro ponto e liga o resto', () => {
    expect(linePath(series.slice(0, 2))).toBe('M0 100 L50 60');
  });
});

describe('monotonePath', () => {
  it('cai para reta com menos de três pontos', () => {
    expect(monotonePath(series.slice(0, 2))).toBe(linePath(series.slice(0, 2)));
  });

  it('passa por todos os pontos da série', () => {
    const d = monotonePath(series);
    for (const point of series.slice(1)) {
      expect(d).toContain(`${point.x} ${point.y}`);
    }
  });

  it('cai para reta quando o x não é crescente', () => {
    const outOfOrder: Point[] = [
      { x: 0, y: 10 },
      { x: 0, y: 20 },
      { x: 5, y: 30 },
    ];
    expect(monotonePath(outOfOrder)).toBe(linePath(outOfOrder));
  });

  it('zera a tangente no extremo local, para a curva não inventar pico', () => {
    // O ponto do meio é um mínimo local; controle e ponto compartilham o y,
    // que é o que impede a curva de ultrapassar o valor medido.
    const valley: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 50 },
      { x: 20, y: 0 },
    ];
    expect(monotonePath(valley)).toContain('C3.33 16.67, 6.67 50, 10 50');
  });
});

describe('areaPath', () => {
  it('fecha na base e volta ao início', () => {
    const d = areaPath(series, 200);
    expect(d.endsWith('L150 200 L0 200 Z')).toBe(true);
  });

  it('devolve string vazia sem pontos', () => {
    expect(areaPath([], 200)).toBe('');
  });
});
