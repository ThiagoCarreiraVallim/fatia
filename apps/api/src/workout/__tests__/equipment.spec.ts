import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BODYWEIGHT,
  cleanCustomEquipment,
  GYM_EQUIPMENT,
  GYM_EQUIPMENT_ITEMS,
  gymEquipmentFilter,
} from '../helpers/equipment';

/** Os valores que o seed grava em `Exercise.equipment` (ver `seed-exercises.ts`). */
const CATALOG_VALUES = [
  'barra',
  'barra W',
  'halteres',
  'polia',
  'máquina',
  'kettlebell',
  'elástico',
  'bola medicinal',
  'bola suíça',
  'rolo de espuma',
];

describe('lista de equipamentos da academia', () => {
  it('cobre todo valor de equipamento do catálogo (menos peso corporal e outro)', () => {
    // O filtro só traz exercício do catálogo pelo valor gravado nele; valor
    // sem item na lista ficaria fora da "minha academia" para sempre.
    for (const v of CATALOG_VALUES) {
      expect(
        GYM_EQUIPMENT_ITEMS.some((i) => i.unlocks.some((u) => u.equipment === v && !u.names)),
      ).toBe(true);
    }
  });

  it('é bem maior que os dez valores largos e não repete chave', () => {
    expect(GYM_EQUIPMENT.length).toBeGreaterThanOrEqual(50);
    expect(new Set(GYM_EQUIPMENT).size).toBe(GYM_EQUIPMENT.length);
    expect(GYM_EQUIPMENT).not.toContain(BODYWEIGHT);
  });

  it('as chaves são as mesmas do api-client', () => {
    // O app não importa a API: a lista com rótulo e categoria mora no
    // api-client. Chave que só existe de um lado vira 400 ao salvar, ou item
    // que a tela nunca mostra.
    const fonte = readFileSync(
      join(__dirname, '../../../../../packages/api-client/src/community-exercises.ts'),
      'utf-8',
    );
    const bloco = fonte.slice(
      fonte.indexOf('export const GYM_EQUIPMENT_OPTIONS'),
      fonte.indexOf('] as const satisfies'),
    );
    const doCliente = [...bloco.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
    expect(doCliente).toEqual([...GYM_EQUIPMENT]);
  });
});

describe('gymEquipmentFilter', () => {
  it('sem nada marcado aceita só peso corporal', () => {
    expect(gymEquipmentFilter([], [])).toEqual({ exact: [BODYWEIGHT], byName: [] });
  });

  it('o item largo libera o valor inteiro do catálogo', () => {
    const f = gymEquipmentFilter(['halteres'], []);
    expect(f.exact).toEqual(expect.arrayContaining(['halteres', BODYWEIGHT]));
    expect(f.byName).toEqual([]);
  });

  it('o item fino libera só os exercícios do valor cujo nome fala dele', () => {
    const f = gymEquipmentFilter(['smith', 'esteira'], []);
    expect(f.exact).not.toContain('máquina');
    expect(f.exact).toEqual(expect.arrayContaining(['smith', 'esteira']));
    expect(f.byName).toEqual([
      { equipment: 'máquina', names: expect.arrayContaining(['smith', 'esteira']) },
    ]);
  });

  it('com o largo marcado, o recorte por nome sai e as chaves finas valem', () => {
    const f = gymEquipmentFilter(['máquina', 'smith'], []);
    expect(f.byName).toEqual([]);
    // O exercício pessoal gravado com "leg press" vale em quem tem máquinas.
    expect(f.exact).toEqual(expect.arrayContaining(['máquina', 'smith', 'leg press']));
  });

  it('o equipamento próprio da academia vale como está', () => {
    const f = gymEquipmentFilter([], ['Hack 45° da casa']);
    expect(f.exact).toEqual(expect.arrayContaining(['Hack 45° da casa', BODYWEIGHT]));
  });

  it('ignora chave que não é da lista', () => {
    expect(gymEquipmentFilter(['nave espacial'], []).exact).toEqual([BODYWEIGHT]);
  });
});

describe('cleanCustomEquipment', () => {
  it('apara, colapsa espaço e tira repetido sem olhar caixa nem acento', () => {
    expect(
      cleanCustomEquipment(['  Hack  45°  ', 'hack 45°', 'Máquina X', 'maquina x', ' ']),
    ).toEqual({ names: ['Hack 45°', 'Máquina X'], inList: null });
  });

  it('acusa o nome que já está na lista', () => {
    expect(cleanCustomEquipment(['Leg Press']).inList).toBe('Leg Press');
    expect(cleanCustomEquipment(['Peso Corporal']).inList).toBe('Peso Corporal');
  });
});
