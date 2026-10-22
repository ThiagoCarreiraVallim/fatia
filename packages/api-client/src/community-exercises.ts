import { apiFetch } from './http';
import type { MediaView } from './community-content';

/**
 * O catálogo de exercícios da comunidade (Fase 7b, ADR 030). A equipe cria os
 * exercícios da casa e grava o tutorial (vídeo, fotos, dicas) por cima de
 * qualquer exercício; quem treina vê esse tutorial no detalhe do exercício, e a
 * busca põe o que a comunidade destaca primeiro.
 */

/**
 * O equipamento que a academia marca, agrupado como a pessoa procura na tela.
 *
 * A `key` é o que vai para o banco (`Group.equipment` e `Exercise.equipment`) e
 * **não muda de grafia**. O espelho com o que cada chave libera no catálogo é
 * `GYM_EQUIPMENT_ITEMS` em `apps/api/src/workout/helpers/equipment.ts`; o teste
 * `equipment.spec.ts` da API confere que as chaves batem, na mesma ordem.
 *
 * "Peso corporal" vale sempre e por isso não está aqui.
 */
export const EQUIPMENT_CATEGORIES = [
  { key: 'free-weights', label: 'Pesos livres' },
  { key: 'benches', label: 'Bancos e estruturas' },
  { key: 'machines', label: 'Máquinas' },
  { key: 'cables', label: 'Cabos e polias' },
  { key: 'bodyweight', label: 'Peso do corpo e suspensão' },
  { key: 'accessories', label: 'Acessórios' },
  { key: 'functional', label: 'Funcional e força' },
  { key: 'cardio', label: 'Cardio' },
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]['key'];

export const GYM_EQUIPMENT_OPTIONS = [
  { key: 'barra', label: 'Barra', category: 'free-weights' },
  { key: 'barra W', label: 'Barra W', category: 'free-weights' },
  { key: 'halteres', label: 'Halteres', category: 'free-weights' },
  { key: 'kettlebell', label: 'Kettlebell', category: 'free-weights' },
  { key: 'anilhas', label: 'Anilhas', category: 'free-weights' },
  { key: 'barra hexagonal', label: 'Barra hexagonal', category: 'free-weights' },
  { key: 'bola medicinal', label: 'Bola medicinal', category: 'free-weights' },
  { key: 'banco', label: 'Banco reto/inclinado', category: 'benches' },
  { key: 'banco scott', label: 'Banco Scott', category: 'benches' },
  { key: 'rack de agachamento', label: 'Rack de agachamento', category: 'benches' },
  { key: 'banco romano', label: 'Banco romano (lombar)', category: 'benches' },
  { key: 'máquina', label: 'Máquinas em geral', category: 'machines' },
  { key: 'smith', label: 'Smith', category: 'machines' },
  { key: 'leg press', label: 'Leg press', category: 'machines' },
  { key: 'hack', label: 'Agachamento hack', category: 'machines' },
  { key: 'cadeira extensora', label: 'Cadeira extensora', category: 'machines' },
  { key: 'cadeira flexora', label: 'Cadeira/mesa flexora', category: 'machines' },
  { key: 'cadeira adutora', label: 'Cadeira adutora', category: 'machines' },
  { key: 'cadeira abdutora', label: 'Cadeira abdutora', category: 'machines' },
  { key: 'panturrilha em pé', label: 'Panturrilha em pé', category: 'machines' },
  { key: 'panturrilha sentado', label: 'Panturrilha sentado', category: 'machines' },
  { key: 'voador', label: 'Voador (peck deck)', category: 'machines' },
  { key: 'máquinas articuladas', label: 'Máquinas articuladas', category: 'machines' },
  { key: 'máquina de abdominal', label: 'Máquina de abdominal', category: 'machines' },
  { key: 'graviton', label: 'Graviton', category: 'machines' },
  { key: 'máquina de glúteo', label: 'Máquina de glúteo', category: 'machines' },
  { key: 'polia', label: 'Polia', category: 'cables' },
  { key: 'crossover', label: 'Crossover', category: 'cables' },
  { key: 'puxador', label: 'Puxador (pulldown)', category: 'cables' },
  { key: 'remada baixa', label: 'Remada baixa', category: 'cables' },
  { key: 'barra fixa', label: 'Barra fixa', category: 'bodyweight' },
  { key: 'paralelas', label: 'Paralelas', category: 'bodyweight' },
  { key: 'argolas', label: 'Argolas', category: 'bodyweight' },
  { key: 'fita de suspensão', label: 'Fita de suspensão (TRX)', category: 'bodyweight' },
  { key: 'espaldar', label: 'Espaldar', category: 'bodyweight' },
  { key: 'corda de escalada', label: 'Corda de escalada', category: 'bodyweight' },
  { key: 'elástico', label: 'Elástico', category: 'accessories' },
  { key: 'bola suíça', label: 'Bola suíça', category: 'accessories' },
  { key: 'rolo de espuma', label: 'Rolo de espuma', category: 'accessories' },
  { key: 'roda abdominal', label: 'Roda abdominal', category: 'accessories' },
  { key: 'caixa de salto', label: 'Caixa de salto', category: 'accessories' },
  { key: 'step', label: 'Step', category: 'accessories' },
  { key: 'bosu', label: 'Bosu', category: 'accessories' },
  { key: 'prancha de equilíbrio', label: 'Prancha de equilíbrio', category: 'accessories' },
  { key: 'corda de pular', label: 'Corda de pular', category: 'accessories' },
  { key: 'cones', label: 'Cones', category: 'accessories' },
  { key: 'colchonete', label: 'Colchonete', category: 'accessories' },
  { key: 'caneleira', label: 'Caneleira', category: 'accessories' },
  { key: 'rolo de punho', label: 'Rolo de punho', category: 'accessories' },
  { key: 'corda naval', label: 'Corda naval', category: 'functional' },
  { key: 'trenó', label: 'Trenó', category: 'functional' },
  { key: 'pneu', label: 'Pneu', category: 'functional' },
  { key: 'marreta', label: 'Marreta', category: 'functional' },
  { key: 'saco de pancada', label: 'Saco de pancada', category: 'functional' },
  { key: 'saco de areia', label: 'Saco de areia', category: 'functional' },
  { key: 'correntes', label: 'Correntes', category: 'functional' },
  { key: 'esteira', label: 'Esteira', category: 'cardio' },
  { key: 'bicicleta ergométrica', label: 'Bicicleta ergométrica', category: 'cardio' },
  { key: 'elíptico', label: 'Elíptico', category: 'cardio' },
  { key: 'remo ergômetro', label: 'Remo ergômetro', category: 'cardio' },
  { key: 'simulador de escada', label: 'Simulador de escada', category: 'cardio' },
] as const satisfies readonly { key: string; label: string; category: EquipmentCategory }[];

export type GymEquipment = (typeof GYM_EQUIPMENT_OPTIONS)[number]['key'];

/** Só as chaves, na ordem da lista. */
export const GYM_EQUIPMENT: readonly GymEquipment[] = GYM_EQUIPMENT_OPTIONS.map((o) => o.key);

export const EQUIPMENT_LABEL = Object.fromEntries(
  GYM_EQUIPMENT_OPTIONS.map((o) => [o.key, o.label]),
) as Record<GymEquipment, string>;

export const BODYWEIGHT_EQUIPMENT = 'peso corporal';
export const OTHER_EQUIPMENT = 'outro';

/** O equipamento de um exercício da casa: o da lista, peso corporal ou outro. */
export const EXERCISE_EQUIPMENT: readonly string[] = [
  ...GYM_EQUIPMENT,
  BODYWEIGHT_EQUIPMENT,
  OTHER_EQUIPMENT,
];

/** Os mesmos limites da API (`EquipmentDto`). */
export const MAX_CUSTOM_EQUIPMENT = 30;
export const CUSTOM_EQUIPMENT_MAX_LENGTH = 40;

/** Sem acento, sem caixa e com espaço colapsado: como a API compara nomes de equipamento. */
const comparable = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** O rótulo de um equipamento gravado: o da lista, ou o próprio texto (equipamento próprio). */
export function equipmentLabel(value: string): string {
  if ((GYM_EQUIPMENT as readonly string[]).includes(value)) {
    return EQUIPMENT_LABEL[value as GymEquipment];
  }
  if (value === BODYWEIGHT_EQUIPMENT) return 'Peso corporal';
  if (value === OTHER_EQUIPMENT) return 'Outro';
  return value;
}

/**
 * A lista em grupos, para a tela: só as categorias com algum item que casa com
 * a busca (sem acento, sem caixa, pelo rótulo ou pela chave).
 */
export function groupedEquipmentOptions(query = ''): {
  key: EquipmentCategory;
  label: string;
  items: { key: GymEquipment; label: string }[];
}[] {
  const q = comparable(query);
  return EQUIPMENT_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    items: GYM_EQUIPMENT_OPTIONS.filter(
      (o) =>
        o.category === c.key &&
        (!q || comparable(o.label).includes(q) || comparable(o.key).includes(q)),
    ).map((o) => ({ key: o.key, label: o.label })),
  })).filter((c) => c.items.length > 0);
}

/** Os equipamentos próprios que casam com a busca. */
export function filterCustomEquipment(custom: readonly string[], query = ''): string[] {
  const q = comparable(query);
  return q ? custom.filter((c) => comparable(c).includes(q)) : [...custom];
}

/**
 * O recado para um equipamento próprio que não dá para adicionar, ou `null`.
 * A mesma regra da API: nome com tamanho, fora da lista e sem repetir.
 */
export function customEquipmentProblem(name: string, existing: readonly string[]): string | null {
  const nome = comparable(name);
  if (!nome) return 'Dê um nome ao equipamento.';
  if (name.trim().length > CUSTOM_EQUIPMENT_MAX_LENGTH) {
    return `Use até ${CUSTOM_EQUIPMENT_MAX_LENGTH} caracteres.`;
  }
  if (EXERCISE_EQUIPMENT.some((e) => comparable(e) === nome)) {
    return 'Esse já está na lista: marque por lá.';
  }
  if (existing.some((e) => comparable(e) === nome)) return 'Esse equipamento já foi adicionado.';
  if (existing.length >= MAX_CUSTOM_EQUIPMENT) {
    return `Até ${MAX_CUSTOM_EQUIPMENT} equipamentos próprios.`;
  }
  return null;
}

/** O nome como o equipamento próprio é gravado: sem espaço sobrando. */
export function customEquipmentName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Os dois nomes são o mesmo equipamento (sem olhar caixa, acento nem espaço extra)? */
export function sameEquipment(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

/**
 * O termo que filtra a lista abaixo do campo de equipamento do exercício
 * pessoal, no web e no app.
 *
 * O campo é texto livre e serve de busca ao mesmo tempo. Quando o texto já é
 * um item conhecido (o que a pessoa acabou de tocar), filtrar por ele deixaria
 * só aquele item na tela, e trocar de ideia exigiria apagar o campo. Nesse caso
 * a lista volta inteira, com o item marcado.
 */
export function chooserQuery(text: string, custom: readonly string[]): string {
  const t = text.trim();
  if (!t) return '';
  const known = [...EXERCISE_EQUIPMENT, ...custom].some(
    (e) => sameEquipment(e, t) || sameEquipment(equipmentLabel(e), t),
  );
  return known ? '' : t;
}

/** Os grupos musculares do catálogo, na ordem do editor (os mesmos da API). */
export const MUSCLE_GROUPS = [
  'peito',
  'costas',
  'pernas',
  'ombro',
  'braço',
  'core',
  'cardio',
] as const;

export const MUSCLE_GROUP_LABEL: Record<(typeof MUSCLE_GROUPS)[number], string> = {
  peito: 'Peito',
  costas: 'Costas',
  pernas: 'Pernas',
  ombro: 'Ombro',
  braço: 'Braço',
  core: 'Core',
  cardio: 'Cardio',
};

export const MAX_GUIDE_PHOTOS = 4;
export const MAX_GUIDE_TIPS = 2000;

export interface GroupExercise {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** Criado pela comunidade; `false` = exercício do catálogo geral com o tutorial dela. */
  ownedByCommunity: boolean;
  video: MediaView | null;
  photos: MediaView[];
  tips: string | null;
  authorName: string;
  updatedAt: string;
  /** Só na bancada da equipe. */
  canEdit?: boolean;
}

export interface GroupExerciseInput {
  name: string;
  muscleGroup: string;
  equipment?: string | null;
  level?: string | null;
  mechanic?: string | null;
  instructions?: string[];
}

/** O equipamento de uma academia, ou o das academias da pessoa. */
export interface GymEquipmentState {
  equipment: string[];
  customEquipment: string[];
}

export interface GuideInput {
  videoFileId?: string | null;
  photoFileIds?: string[];
  tips?: string | null;
}

const base = '/api/groups';
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const groupExerciseApi = {
  /** Bancada da equipe: o catálogo, o equipamento marcado e o próprio da academia. */
  list: (groupId: string) =>
    apiFetch<GymEquipmentState & { items: GroupExercise[] }>(
      `${base}/${groupId}/content/exercises`,
    ),
  get: (groupId: string, exerciseId: number) =>
    apiFetch<GroupExercise>(`${base}/${groupId}/content/exercises/${exerciseId}`),
  create: (groupId: string, input: GroupExerciseInput & GuideInput) =>
    apiFetch<GroupExercise>(`${base}/${groupId}/content/exercises`, json('POST', input)),
  update: (groupId: string, exerciseId: number, input: Partial<GroupExerciseInput>) =>
    apiFetch<GroupExercise>(
      `${base}/${groupId}/content/exercises/${exerciseId}`,
      json('PATCH', input),
    ),
  setGuide: (groupId: string, exerciseId: number, input: GuideInput) =>
    apiFetch<GroupExercise>(
      `${base}/${groupId}/content/exercises/${exerciseId}/guide`,
      json('PUT', input),
    ),
  remove: (groupId: string, exerciseId: number) =>
    apiFetch<{ id: number }>(`${base}/${groupId}/content/exercises/${exerciseId}`, json('DELETE')),
  /** `customEquipment` ausente mantém os equipamentos próprios que já estão. */
  setEquipment: (groupId: string, equipment: string[], customEquipment?: string[]) =>
    apiFetch<GymEquipmentState>(
      `${base}/${groupId}/equipment`,
      json('PUT', customEquipment === undefined ? { equipment } : { equipment, customEquipment }),
    ),

  /** Vitrine do membro. */
  forMember: (groupId: string) => apiFetch<GroupExercise[]>(`${base}/${groupId}/exercises`),
};

export const VIDEO_MIMES = ['video/mp4', 'video/quicktime'] as const;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/** Mensagem para a pessoa antes de pedir a URL, ou `null` se o vídeo serve. */
export function videoProblem(file: { type: string; size: number }): string | null {
  if (!(VIDEO_MIMES as readonly string[]).includes(file.type)) {
    return 'Escolha um vídeo MP4 ou MOV.';
  }
  if (file.size > VIDEO_MAX_BYTES) return 'O vídeo passa de 200 MB. Grave um trecho menor.';
  if (file.size <= 0) return 'O vídeo está vazio.';
  return null;
}

/** "45 MB", "800 KB": para a pessoa saber o que está enviando. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** As instruções do editor: uma por linha, sem linhas vazias. */
export function instructionsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim())
    .filter(Boolean);
}

/** O que o editor da equipe pode salvar, ou o recado do que falta. */
export function groupExerciseProblem(input: { name: string; muscleGroup: string }): string | null {
  if (!input.name.trim()) return 'Dê um nome ao exercício.';
  if (!input.muscleGroup.trim()) return 'Escolha o grupo muscular.';
  return null;
}
