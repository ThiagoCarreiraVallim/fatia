import { describe, expect, it } from 'vitest';
import { chooserQuery, sameEquipment, toggled } from '../equipment';

describe('escolhedor de equipamento', () => {
  it('o texto digitado filtra a lista', () => {
    expect(chooserQuery('esteir', [])).toBe('esteir');
    expect(chooserQuery('  ', [])).toBe('');
  });

  it('item já escolhido (pela chave, pelo rótulo ou próprio da academia) mostra a lista inteira', () => {
    expect(chooserQuery('leg press', [])).toBe('');
    expect(chooserQuery('Voador (peck deck)', [])).toBe('');
    expect(chooserQuery('PESO CORPORAL', [])).toBe('');
    expect(chooserQuery('hack da casa', ['Hack da Casa'])).toBe('');
  });

  it('compara sem caixa, acento nem espaço extra', () => {
    expect(sameEquipment(' Máquina  de glúteo', 'maquina de gluteo')).toBe(true);
    expect(sameEquipment('smith', 'leg press')).toBe(false);
  });

  it('liga e desliga sem mexer no conjunto original', () => {
    const antes = new Set(['smith']);
    expect([...toggled(antes, 'esteira')]).toEqual(['smith', 'esteira']);
    expect([...toggled(antes, 'smith')]).toEqual([]);
    expect([...antes]).toEqual(['smith']);
  });
});
