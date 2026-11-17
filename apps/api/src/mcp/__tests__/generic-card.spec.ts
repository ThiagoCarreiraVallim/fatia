import { genericTable, readableKey } from '../generic-card';

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

  it('desenha a Tabela sem coluna numérica: texto também é cartão', () => {
    expect(genericTable([{ name: 'Lembrete', description: 'Beber água' }])).toEqual({
      kind: 'report',
      columns: ['Nome', 'Descrição'],
      rows: [['Lembrete', 'Beber água']],
    });
  });

  it('deixa de fora campo sem rótulo, id, campo técnico e objeto aninhado sem nome', () => {
    const card = genericTable([
      { id: 'x', foodId: 3, searchName: 'x', fooBar: 3, kcal: 10, nested: { a: 1 } },
    ]);
    expect(card?.columns).toEqual(['Calorias']);
  });

  it('objeto aninhado com nome vira o nome', () => {
    const card = genericTable([{ id: 's1', exercise: { id: 7, name: 'Supino reto' }, reps: 8 }]);
    expect(card).toEqual({
      kind: 'report',
      columns: ['Exercício', 'Repetições'],
      rows: [['Supino reto', 8]],
    });
  });

  it('um objeto solto vira Campo e Valor', () => {
    expect(genericTable({ id: 'u1', name: 'Pessoa', heightCm: 168 })).toEqual({
      kind: 'report',
      columns: ['Campo', 'Valor'],
      rows: [
        ['Nome', 'Pessoa'],
        ['Altura', expect.stringContaining('168')],
      ],
    });
  });

  it('sem nenhum campo com rótulo, o nome do campo legível', () => {
    expect(genericTable([{ id: 'a', actionName: 'leu', resourceCount: 2 }])).toEqual({
      kind: 'report',
      columns: ['Resource count', 'Action name'],
      rows: [[2, 'leu']],
    });
    expect(readableKey('loggedAt')).toBe('Logged at');
  });

  it('a lista de dentro do objeto leva o nome dele, e acha a lista um nível abaixo', () => {
    expect(genericTable({ name: 'Treino A', exercises: [{ name: 'Supino', reps: 8 }] })).toEqual({
      kind: 'report',
      label: 'Treino A',
      columns: ['Nome', 'Repetições'],
      rows: [['Supino', 8]],
    });
    expect(
      genericTable({ date: '2026-11-16', active: { meals: [{ name: 'Almoço' }] } })?.rows,
    ).toEqual([['Almoço']]);
  });

  it('uma lista de textos soltos vira uma coluna', () => {
    expect(genericTable({ groups: ['cereais', 'frutas'] })).toEqual({
      kind: 'report',
      columns: ['Valor'],
      rows: [['cereais'], ['frutas']],
    });
  });

  it('não inventa tabela de lista vazia, de nada, nem de objeto só com id', () => {
    expect(genericTable([])).toBeNull();
    expect(genericTable({ items: [], nextCursor: null })).toBeNull();
    expect(genericTable({ id: 'x', userId: 'u' })).toBeNull();
    expect(genericTable(null)).toBeNull();
  });

  it('corta em 4 colunas e 20 linhas', () => {
    const linha = { name: 'a', kcal: 1, proteinG: 2, carbsG: 3, fatG: 4, grams: 5 };
    const card = genericTable(Array.from({ length: 30 }, () => linha));
    expect(card?.columns).toHaveLength(4);
    expect(card?.rows).toHaveLength(20);
  });
});
