import { describe, expect, it } from 'vitest';
import { moveAnchor, pageIndexOf, weekPages } from '../week-pager-math';

describe('faixa de dias arrastável (#479)', () => {
  it('as segundas-feiras de N semanas antes a M depois da semana de hoje', () => {
    expect(weekPages('2026-11-25', { back: 2, forward: 1 })).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('domingo é o último dia da semana, não o primeiro', () => {
    expect(weekPages('2026-11-29', { back: 0, forward: 0 })).toEqual(['2026-11-23']);
  });

  it('a página de um dia é a da segunda da semana dele, presa nas pontas', () => {
    const pages = weekPages('2026-11-25', { back: 2, forward: 1 });
    expect(pageIndexOf(pages, '2026-11-19')).toBe(1);
    expect(pageIndexOf(pages, '2026-11-23')).toBe(2);
    expect(pageIndexOf(pages, '2020-01-01')).toBe(0);
    expect(pageIndexOf(pages, '2030-01-01')).toBe(3);
  });

  it('arrastar para outra página leva o dia escolhido junto, no mesmo dia da semana', () => {
    expect(moveAnchor('2026-11-25', 2, 1)).toBe('2026-11-18');
    expect(moveAnchor('2026-11-25', 2, 4)).toBe('2026-12-09');
    expect(moveAnchor('2026-11-25', 2, 2)).toBe('2026-11-25');
  });
});
