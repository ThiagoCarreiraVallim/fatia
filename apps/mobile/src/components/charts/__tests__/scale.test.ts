import { describe, expect, it } from 'vitest';
import {
  bandScale,
  decimalsFor,
  ensureSpan,
  extent,
  includeValue,
  linearScale,
  niceTicks,
  padDomain,
  pickTickIndexes,
  pointPositions,
  withZero,
} from '../scale';

describe('extent', () => {
  it('devolve null para série vazia', () => {
    expect(extent([])).toBeNull();
  });

  it('ignora valores não finitos', () => {
    expect(extent([3, Number.NaN, 1, Number.POSITIVE_INFINITY, 5])).toEqual([1, 5]);
  });

  it('devolve null quando nenhum valor é finito', () => {
    expect(extent([Number.NaN])).toBeNull();
  });
});

describe('padDomain / withZero / includeValue', () => {
  it('abre folga dos dois lados', () => {
    expect(padDomain([70, 80], 1)).toEqual([69, 81]);
  });

  it('ancora o domínio no zero', () => {
    expect(withZero([4000, 9000])).toEqual([0, 9000]);
    expect(withZero([-3, 5])).toEqual([-3, 5]);
  });

  it('estende para caber a meta', () => {
    expect(includeValue([0, 6000], 10_000)).toEqual([0, 10_000]);
    expect(includeValue([0, 6000], Number.NaN)).toEqual([0, 6000]);
  });
});

describe('ensureSpan', () => {
  it('mantém domínio já amplo', () => {
    expect(ensureSpan([10, 20])).toEqual([10, 20]);
  });

  it('abre amplitude ao redor de série constante', () => {
    expect(ensureSpan([80, 80], 2)).toEqual([79, 81]);
  });
});

describe('linearScale', () => {
  it('mapeia domínio em intervalo invertido (y cresce para baixo)', () => {
    const y = linearScale([0, 100], [150, 0]);
    expect(y(0)).toBe(150);
    expect(y(100)).toBe(0);
    expect(y(50)).toBe(75);
  });

  it('coloca domínio degenerado no meio do intervalo em vez de dividir por zero', () => {
    const y = linearScale([5, 5], [100, 0]);
    expect(y(5)).toBe(50);
    expect(Number.isFinite(y(5))).toBe(true);
  });
});

describe('niceTicks', () => {
  it('gera passos redondos dentro do domínio', () => {
    const ticks = niceTicks([0, 10_000], 4);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(10_000);
    expect(ticks.every((tick) => Number.isFinite(tick))).toBe(true);
  });

  it('não deixa resíduo de ponto flutuante no rótulo', () => {
    for (const tick of niceTicks([72.3, 75.1], 4)) {
      expect(String(tick)).not.toMatch(/\d{6,}/);
    }
  });

  it('mantém todos os ticks dentro do domínio', () => {
    const domain: [number, number] = [69.4, 81.2];
    for (const tick of niceTicks(domain, 5)) {
      expect(tick).toBeGreaterThanOrEqual(domain[0]);
      expect(tick).toBeLessThanOrEqual(domain[1]);
    }
  });

  it('devolve um único tick para domínio degenerado e nada para domínio inválido', () => {
    expect(niceTicks([7, 7])).toEqual([7]);
    expect(niceTicks([Number.NaN, 3])).toEqual([]);
  });
});

describe('decimalsFor', () => {
  it('acompanha a casa decimal do passo', () => {
    expect(decimalsFor(1)).toBe(0);
    expect(decimalsFor(0.5)).toBe(1);
    expect(decimalsFor(0.05)).toBe(2);
    expect(decimalsFor(1000)).toBe(0);
  });
});

describe('pointPositions', () => {
  it('espalha da borda esquerda à direita', () => {
    expect(pointPositions(3, 100)).toEqual([0, 50, 100]);
  });

  it('centraliza o ponto único', () => {
    expect(pointPositions(1, 100)).toEqual([50]);
  });

  it('devolve vazio sem pontos', () => {
    expect(pointPositions(0, 100)).toEqual([]);
  });
});

describe('bandScale', () => {
  it('centraliza cada faixa e desconta o espaçamento', () => {
    const band = bandScale(4, 100, 0.2);
    expect(band.center(0)).toBe(12.5);
    expect(band.center(3)).toBe(87.5);
    expect(band.width).toBeCloseTo(20);
  });

  it('nunca deixa a barra sumir em série longa', () => {
    expect(bandScale(180, 100).width).toBeGreaterThanOrEqual(1);
  });
});

describe('pickTickIndexes', () => {
  it('devolve todos os índices quando cabem', () => {
    expect(pickTickIndexes(4, 6)).toEqual([0, 1, 2, 3]);
  });

  it('sempre inclui o primeiro e o último', () => {
    const indexes = pickTickIndexes(90, 5);
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(89);
    expect(indexes.length).toBeLessThanOrEqual(6);
  });

  it('não repete índice', () => {
    const indexes = pickTickIndexes(30, 4);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it('lida com série vazia', () => {
    expect(pickTickIndexes(0, 4)).toEqual([]);
  });
});
