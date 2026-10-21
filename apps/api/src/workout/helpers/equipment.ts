import { normalizeSearchText } from '../../common/search-text';

/**
 * O equipamento que a academia marca no painel (Fase 7b) para o filtro "Na
 * minha academia".
 *
 * O catálogo (`Exercise.equipment`, como o seed grava) só conhece doze valores
 * largos: "barra", "máquina", "polia", "outro"… Uma academia, por outro lado,
 * pensa em "leg press", "smith", "esteira". Por isso cada item da lista diz
 * **o que ele destrava no catálogo**:
 *
 * - o item largo ("máquina") destrava o valor inteiro, como sempre foi;
 * - o item fino ("smith") destrava só os exercícios daquele valor cujo nome
 *   fala dele ("Supino no Smith Machine"). Sem isso, marcar a esteira traria
 *   todo exercício de máquina, e o filtro deixaria de dizer alguma coisa;
 * - o item sem `unlocks` não muda nada no catálogo, mas casa com o exercício
 *   pessoal ou da casa que alguém gravou com aquele equipamento.
 *
 * As chaves são texto em português e é a chave que vai para o banco, tanto em
 * `Group.equipment` quanto em `Exercise.equipment` de quem escolhe da lista. Por
 * isso **chave não muda de grafia**: academia que já marcou perderia o item.
 *
 * O espelho da lista, com rótulo e categoria, é `GYM_EQUIPMENT` em
 * `packages/api-client/src/community-exercises.ts`; o teste
 * `equipment.spec.ts` confere que as chaves batem.
 *
 * "peso corporal" não entra: está em toda academia, e o filtro o inclui sempre.
 * "outro" também não, porque não diz nada sobre o que a casa tem.
 */

/** Os valores de `Exercise.equipment` que o seed grava (ver `seed-exercises.ts`). */
export type CatalogEquipment =
  | 'barra'
  | 'barra W'
  | 'halteres'
  | 'polia'
  | 'máquina'
  | 'kettlebell'
  | 'elástico'
  | 'bola medicinal'
  | 'bola suíça'
  | 'rolo de espuma'
  | 'peso corporal'
  | 'outro';

/** O pedaço do catálogo que um item destrava: um valor, inteiro ou só os nomes que casam. */
export interface CatalogUnlock {
  equipment: CatalogEquipment;
  /** Trechos do `searchName` (já normalizados). Sem eles, o valor inteiro. */
  names?: readonly string[];
}

export interface GymEquipmentItem {
  key: string;
  unlocks: readonly CatalogUnlock[];
}

const all = (equipment: CatalogEquipment): CatalogUnlock => ({ equipment });
const named = (equipment: CatalogEquipment, ...names: string[]): CatalogUnlock => ({
  equipment,
  names: names.map(normalizeSearchText),
});

export const GYM_EQUIPMENT_ITEMS: readonly GymEquipmentItem[] = [
  // ---- pesos livres
  { key: 'barra', unlocks: [all('barra')] },
  { key: 'barra W', unlocks: [all('barra W')] },
  { key: 'halteres', unlocks: [all('halteres')] },
  { key: 'kettlebell', unlocks: [all('kettlebell')] },
  { key: 'anilhas', unlocks: [named('outro', 'anilha')] },
  { key: 'barra hexagonal', unlocks: [named('outro', 'hexagonal')] },
  { key: 'bola medicinal', unlocks: [all('bola medicinal')] },
  // ---- bancos e estruturas
  { key: 'banco', unlocks: [named('outro', 'banco')] },
  { key: 'banco scott', unlocks: [] },
  { key: 'rack de agachamento', unlocks: [] },
  {
    key: 'banco romano',
    unlocks: [
      named('outro', 'hiperextens'),
      named('máquina', 'glute ham', 'hiperextensão reversa'),
    ],
  },
  // ---- máquinas
  { key: 'máquina', unlocks: [all('máquina')] },
  { key: 'smith', unlocks: [named('máquina', 'smith')] },
  { key: 'leg press', unlocks: [named('máquina', 'leg press')] },
  { key: 'hack', unlocks: [named('máquina', 'hack')] },
  { key: 'cadeira extensora', unlocks: [named('máquina', 'extensão de pernas')] },
  { key: 'cadeira flexora', unlocks: [named('máquina', 'flexora', 'flexão de pernas')] },
  { key: 'cadeira adutora', unlocks: [named('máquina', 'adutor')] },
  { key: 'cadeira abdutora', unlocks: [named('máquina', 'abdutor')] },
  { key: 'panturrilha em pé', unlocks: [named('máquina', 'panturrilha em pé')] },
  { key: 'panturrilha sentado', unlocks: [named('máquina', 'panturrilha sentad')] },
  { key: 'voador', unlocks: [named('máquina', 'butterfly', 'crucifixo invertido na máquina')] },
  {
    key: 'máquinas articuladas',
    unlocks: [named('máquina', 'alavanca', 'supino máquina', 'remada t bar')],
  },
  { key: 'máquina de abdominal', unlocks: [named('máquina', 'abdominal')] },
  { key: 'graviton', unlocks: [named('máquina', 'mergulho')] },
  { key: 'máquina de glúteo', unlocks: [] },
  // ---- cabos
  { key: 'polia', unlocks: [all('polia')] },
  { key: 'crossover', unlocks: [named('polia', 'crossover', 'crucifixo', 'fly')] },
  { key: 'puxador', unlocks: [named('polia', 'pulldown', 'puxada')] },
  {
    key: 'remada baixa',
    unlocks: [named('polia', 'remada sentada', 'remada no pulley', 'remada na polia baixa')],
  },
  // ---- peso do corpo e suspensão
  { key: 'barra fixa', unlocks: [named('outro', 'barra fixa', 'muscle up', 'otis up')] },
  { key: 'paralelas', unlocks: [named('outro', 'paralelas', 'mergulho versão peitoral')] },
  { key: 'argolas', unlocks: [named('outro', 'argolas')] },
  { key: 'fita de suspensão', unlocks: [named('outro', 'suspens', 'remada invertida com alças')] },
  { key: 'espaldar', unlocks: [] },
  { key: 'corda de escalada', unlocks: [named('outro', 'escalada de corda')] },
  // ---- acessórios
  { key: 'elástico', unlocks: [all('elástico'), named('outro', 'banda')] },
  { key: 'bola suíça', unlocks: [all('bola suíça')] },
  {
    key: 'rolo de espuma',
    unlocks: [all('rolo de espuma'), named('outro', 'liberação miofascial')],
  },
  { key: 'roda abdominal', unlocks: [named('outro', 'roda abdominal')] },
  { key: 'caixa de salto', unlocks: [named('outro', 'caixa')] },
  { key: 'step', unlocks: [] },
  { key: 'bosu', unlocks: [] },
  { key: 'prancha de equilíbrio', unlocks: [named('outro', 'prancha de equilíbrio')] },
  { key: 'corda de pular', unlocks: [named('outro', 'pular corda')] },
  { key: 'cones', unlocks: [named('outro', 'cone')] },
  { key: 'colchonete', unlocks: [] },
  { key: 'caneleira', unlocks: [] },
  { key: 'rolo de punho', unlocks: [named('outro', 'rolo de punho')] },
  // ---- funcional e força
  { key: 'corda naval', unlocks: [named('outro', 'cordas de batalha')] },
  { key: 'trenó', unlocks: [named('outro', 'trenó', 'prowler')] },
  { key: 'pneu', unlocks: [named('outro', 'pneu')] },
  { key: 'marreta', unlocks: [named('outro', 'marreta')] },
  { key: 'saco de pancada', unlocks: [named('outro', 'saco pesado')] },
  { key: 'saco de areia', unlocks: [named('outro', 'saco de areia')] },
  { key: 'correntes', unlocks: [named('outro', 'correntes')] },
  // ---- cardio
  { key: 'esteira', unlocks: [named('máquina', 'esteira')] },
  {
    key: 'bicicleta ergométrica',
    unlocks: [named('máquina', 'ciclismo', 'bicicleta'), named('outro', 'ciclismo')],
  },
  { key: 'elíptico', unlocks: [named('máquina', 'elíptico')] },
  { key: 'remo ergômetro', unlocks: [named('máquina', 'remo ergométrico')] },
  { key: 'simulador de escada', unlocks: [named('máquina', 'escada ergométrica', 'step mill')] },
];

export const GYM_EQUIPMENT: readonly string[] = GYM_EQUIPMENT_ITEMS.map((i) => i.key);

export const BODYWEIGHT = 'peso corporal';
/** O que se grava no exercício quando nenhum item da lista serve. */
export const OTHER_EQUIPMENT = 'outro';

/** Quantos equipamentos próprios uma academia guarda, e o tamanho de cada nome. */
export const MAX_CUSTOM_EQUIPMENT = 30;
export const CUSTOM_EQUIPMENT_MAX_LENGTH = 40;

/** A forma comparável de um nome de equipamento: sem acento, caixa e espaço extra. */
export function equipmentKey(name: string): string {
  return normalizeSearchText(name);
}

const LIST_KEYS = new Set([...GYM_EQUIPMENT, BODYWEIGHT, OTHER_EQUIPMENT].map(equipmentKey));

/**
 * Os equipamentos próprios como a academia os guarda: espaço aparado, sem
 * repetição (sem olhar caixa nem acento) e sem o que já está na lista, que
 * a academia marca pela lista. Devolve também o nome que colidiu com a lista,
 * para o recado de erro.
 */
export function cleanCustomEquipment(names: readonly string[]): {
  names: string[];
  inList: string | null;
} {
  const vistos = new Set<string>();
  const limpos: string[] = [];
  for (const bruto of names) {
    const nome = bruto.replace(/\s+/g, ' ').trim();
    const chave = equipmentKey(nome);
    if (!chave) continue;
    if (LIST_KEYS.has(chave)) return { names: [], inList: nome };
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    limpos.push(nome);
  }
  return { names: limpos, inList: null };
}

/**
 * O que o filtro "Na minha academia" aceita, a partir do que a academia marcou.
 *
 * - `exact`: o valor de `Exercise.equipment` que vale como está (comparado sem
 *   caixa). Entra o valor largo do catálogo, a chave fina (o exercício pessoal
 *   gravado com "smith") e o equipamento próprio da academia. Marcar o largo
 *   ("máquina") também aceita as chaves finas dele: quem tem máquinas tem o
 *   exercício pessoal que alguém gravou com "leg press".
 * - `byName`: o pedaço do catálogo que o item fino destrava pelo nome.
 */
export function gymEquipmentFilter(
  marked: readonly string[],
  custom: readonly string[],
): { exact: string[]; byName: { equipment: string; names: string[] }[] } {
  const itens = new Map(GYM_EQUIPMENT_ITEMS.map((i) => [i.key, i]));
  const exact = new Set<string>([BODYWEIGHT, ...custom]);
  const largos = new Set<string>();
  const porNome = new Map<string, Set<string>>();

  for (const key of marked) {
    const item = itens.get(key);
    if (!item) continue;
    exact.add(key);
    for (const u of item.unlocks) {
      if (!u.names) {
        exact.add(u.equipment);
        largos.add(u.equipment);
        continue;
      }
      const nomes = porNome.get(u.equipment) ?? new Set<string>();
      u.names.forEach((n) => nomes.add(n));
      porNome.set(u.equipment, nomes);
    }
  }
  // Chave fina cujo valor largo já está liberado inteiro vale também.
  for (const item of GYM_EQUIPMENT_ITEMS) {
    if (item.unlocks.some((u) => u.names && largos.has(u.equipment))) exact.add(item.key);
  }

  return {
    exact: [...exact],
    byName: [...porNome]
      // O valor que já está liberado inteiro não precisa do recorte por nome.
      .filter(([equipment]) => !largos.has(equipment))
      .map(([equipment, nomes]) => ({ equipment, names: [...nomes] })),
  };
}
