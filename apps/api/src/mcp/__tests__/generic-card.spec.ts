import { genericTable } from '../generic-card';

describe('genericTable — a Tabela de quem não tem cartão próprio (#384)', () => {
  it('monta colunas em português a partir de uma lista de objetos', () => {
    const card = genericTable([
      { id: 'a', name: 'Arroz', kcal: 130, proteinG: 2.5 },
      { id: 'b', name: 'Feijão', kcal: 76, proteinG: 4.8 },
    ]);
    expect(card).toEqual({
      kind: 'report',
      columns: ['Nome', 'Calorias', 'Proteína'],
      rows: [
        ['Arroz', 130, 2.5],
        ['Feijão', 76, 4.8],
      ],
    });
  });

  it('acha a lista dentro do objeto quando ela é o único array', () => {
    const card = genericTable({ total: 1, items: [{ name: 'Supino', reps: 8 }] });
    expect(card?.rows).toEqual([['Supino', 8]]);
  });

  it('não desenha cartão sem número: o cartão só aparece quando há número', () => {
    expect(genericTable([{ name: 'Lembrete', title: 'Beber água' }])).toBeNull();
  });

  it('deixa de fora campo sem rótulo conhecido, id e objeto aninhado', () => {
    const card = genericTable([{ id: 'x', fooBar: 3, kcal: 10, nested: { a: 1 } }]);
    expect(card?.columns).toEqual(['Calorias']);
  });

  it('não inventa tabela de lista vazia nem de valor solto', () => {
    expect(genericTable([])).toBeNull();
    expect(genericTable({ kcal: 3 })).toBeNull();
    expect(genericTable(null)).toBeNull();
  });

  it('corta em 4 colunas e 20 linhas', () => {
    const linha = { name: 'a', kcal: 1, proteinG: 2, carbsG: 3, fatG: 4, grams: 5 };
    const card = genericTable(Array.from({ length: 30 }, () => linha));
    expect(card?.columns).toHaveLength(4);
    expect(card?.rows).toHaveLength(20);
  });
});
