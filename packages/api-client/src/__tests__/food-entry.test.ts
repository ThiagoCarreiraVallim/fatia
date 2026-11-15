import { describe, expect, it } from 'vitest';
import {
  addTargetLabel,
  emptySearchCopy,
  foodAmountPreview,
  foodOriginTag,
  isSearching,
  myFoodsTabs,
  resultsCaption,
} from '../food-entry';

describe('busca do "Adicionar" (Al-N15)', () => {
  it('fica em browsing até 2 letras; depois busca', () => {
    expect(isSearching('')).toBe(false);
    expect(isSearching(' a ')).toBe(false);
    expect(isSearching('ar')).toBe(true);
  });

  it('selo de origem: TACO, seu', () => {
    expect(foodOriginTag({ source: 'TACO' })).toEqual({ label: 'TACO', tone: 'mute' });
    expect(foodOriginTag({ source: 'CUSTOM' })).toEqual({ label: 'seu', tone: 'ok' });
  });

  it('legenda dos resultados no singular e no plural', () => {
    expect(resultsCaption(1)).toBe('1 resultado · TACO e seus alimentos');
    expect(resultsCaption(8)).toBe('8 resultados · TACO e seus alimentos');
  });

  it('sem resultado, convida a criar com o nome digitado', () => {
    expect(emptySearchCopy('  granola ')).toEqual({
      title: 'Nada com “granola”',
      action: 'Criar “granola” como meu alimento',
    });
  });

  it('o botão de concluir diz para qual refeição vai', () => {
    expect(addTargetLabel('DINNER')).toBe('Adicionar ao jantar');
    expect(addTargetLabel('BREAKFAST')).toBe('Adicionar ao café');
    expect(addTargetLabel(undefined)).toBe('Adicionar');
  });
});

describe('quantidade ao vivo (Al-N3)', () => {
  const arroz = {
    kcalPer100g: 124,
    proteinPer100g: 2.6,
    carbsPer100g: 25.8,
    fatPer100g: 1,
    nutrients: { fiber_g: 2.7, sodium_mg: 1 },
  };

  it('kcal, macros, fibra e sódio na quantidade', () => {
    expect(foodAmountPreview(arroz, 150)).toEqual({
      kcal: 186,
      proteinG: 3.9,
      carbsG: 38.7,
      fatG: 1.5,
      fiberG: 4.1,
      sodiumMg: 2,
    });
  });

  it('sem o dado, fibra e sódio ficam null (a tela mostra "—"), não zero', () => {
    const semMicros = { ...arroz, nutrients: null };
    expect(foodAmountPreview(semMicros, 100)).toMatchObject({ fiberG: null, sodiumMg: null });
  });

  it('quantidade inválida não dá número', () => {
    expect(foodAmountPreview(arroz, null)).toBeNull();
    expect(foodAmountPreview(arroz, 0)).toBeNull();
    expect(foodAmountPreview(arroz, Number.NaN)).toBeNull();
  });
});

describe('Meus alimentos (Al-N12)', () => {
  it('sem a aba "Lidos" (ADR 017): todos, alimentos e refeições', () => {
    expect(myFoodsTabs().map((t) => t.label)).toEqual(['Todos', 'Alimentos', 'Refeições']);
  });
});
