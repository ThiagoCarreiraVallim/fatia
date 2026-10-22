import { describe, expect, it } from 'vitest';
import { toggled } from '../equipment';

describe('escolhedor de equipamento', () => {
  it('liga e desliga sem mexer no conjunto original', () => {
    const antes = new Set(['smith']);
    expect([...toggled(antes, 'esteira')]).toEqual(['smith', 'esteira']);
    expect([...toggled(antes, 'smith')]).toEqual([]);
    expect([...antes]).toEqual(['smith']);
  });
});
