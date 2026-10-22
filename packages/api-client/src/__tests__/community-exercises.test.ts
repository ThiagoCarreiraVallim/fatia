import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chooserQuery,
  customEquipmentName,
  customEquipmentProblem,
  EQUIPMENT_CATEGORIES,
  equipmentLabel,
  filterCustomEquipment,
  formatBytes,
  groupedEquipmentOptions,
  GYM_EQUIPMENT,
  groupExerciseApi,
  groupExerciseProblem,
  instructionsFromText,
  sameEquipment,
  videoProblem,
} from '../community-exercises';
import { activePanelSection, panelHref } from '../community-panel';
import { configureApiClient, resetApiClient } from '../http';
import { routeInfo } from '../navigation';
import { workoutApi } from '../workout';

const fetchMock = vi.fn();
const pedido = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
};

describe('catálogo de exercícios da comunidade no cliente', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('a equipe cria, grava o tutorial e marca o equipamento; o membro vê a vitrine', async () => {
    await groupExerciseApi.create('g1', { name: 'Leg da casa', muscleGroup: 'pernas' });
    await groupExerciseApi.setGuide('g1', 42, { videoFileId: 'v1', photoFileIds: [], tips: null });
    await groupExerciseApi.setEquipment('g1', ['halteres']);
    await groupExerciseApi.remove('g1', 42);
    await groupExerciseApi.forMember('g1');
    expect([0, 1, 2, 3, 4].map((i) => `${pedido(i).method} ${pedido(i).url}`)).toEqual([
      'POST /api/groups/g1/content/exercises',
      'PUT /api/groups/g1/content/exercises/42/guide',
      'PUT /api/groups/g1/equipment',
      'DELETE /api/groups/g1/content/exercises/42',
      'GET /api/groups/g1/exercises',
    ]);
    expect(pedido(2).body).toEqual({ equipment: ['halteres'] });
  });

  it('os equipamentos próprios vão junto só quando a tela manda', async () => {
    await groupExerciseApi.setEquipment('g1', ['smith'], ['Hack 45° da casa']);
    await workoutApi.gymEquipment();
    expect(pedido(0).body).toEqual({ equipment: ['smith'], customEquipment: ['Hack 45° da casa'] });
    expect(`${pedido(1).method} ${pedido(1).url}`).toBe('GET /api/workout/equipment');
  });

  it('"Na minha academia" vira onlyMyGym na busca, e some quando desligado', async () => {
    await workoutApi.searchExercises('supino', undefined, { onlyMyGym: true });
    await workoutApi.searchExercises('supino');
    expect(pedido(0).url).toBe('/api/workout/exercises?q=supino&onlyMyGym=true');
    expect(pedido(1).url).toBe('/api/workout/exercises?q=supino');
  });
});

describe('regras do catálogo', () => {
  it('vídeo: só MP4 ou MOV, até 200 MB', () => {
    expect(videoProblem({ type: 'video/mp4', size: 50 * 1024 * 1024 })).toBeNull();
    expect(videoProblem({ type: 'video/quicktime', size: 1 })).toBeNull();
    expect(videoProblem({ type: 'video/webm', size: 1 })).toBe('Escolha um vídeo MP4 ou MOV.');
    expect(videoProblem({ type: 'video/mp4', size: 201 * 1024 * 1024 })).toMatch(/200 MB/);
    expect(videoProblem({ type: 'video/mp4', size: 0 })).toMatch(/vazio/);
  });

  it('tamanho legível', () => {
    expect(formatBytes(45 * 1024 * 1024)).toBe('45 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 MB');
    expect(formatBytes(800 * 1024)).toBe('800 KB');
  });

  it('instruções: uma por linha, sem numeração colada e sem linha vazia', () => {
    expect(instructionsFromText('1. Sente na máquina\n\n2) Empurre\n- Volte devagar\n  ')).toEqual([
      'Sente na máquina',
      'Empurre',
      'Volte devagar',
    ]);
  });

  it('nome e grupo muscular são obrigatórios', () => {
    expect(groupExerciseProblem({ name: ' ', muscleGroup: 'pernas' })).toMatch(/nome/);
    expect(groupExerciseProblem({ name: 'Leg', muscleGroup: '' })).toMatch(/grupo muscular/);
    expect(groupExerciseProblem({ name: 'Leg', muscleGroup: 'pernas' })).toBeNull();
  });

  it('a seção Exercícios do painel e o voltar do editor', () => {
    expect(panelHref('g1', 'exercises')).toBe('/org/g1/exercises');
    expect(activePanelSection('/org/g1/exercises/42')).toBe('exercises');
    expect(routeInfo('/org/g1/exercises/42')).toMatchObject({
      title: 'Exercício',
      parent: '/org/g1/exercises',
    });
    expect(routeInfo('/org/g1/exercises')).toMatchObject({ parent: '/org/g1' });
  });
});

describe('lista de equipamentos', () => {
  it('cobre os valores do catálogo e vai muito além deles, sem repetir', () => {
    for (const v of ['barra', 'barra W', 'halteres', 'polia', 'máquina', 'kettlebell']) {
      expect(GYM_EQUIPMENT).toContain(v);
    }
    expect(GYM_EQUIPMENT.length).toBeGreaterThanOrEqual(50);
    expect(new Set(GYM_EQUIPMENT).size).toBe(GYM_EQUIPMENT.length);
  });

  it('agrupa por categoria e busca sem acento nem caixa', () => {
    expect(groupedEquipmentOptions().map((c) => c.key)).toEqual(
      EQUIPMENT_CATEGORIES.map((c) => c.key),
    );
    const achados = groupedEquipmentOptions('ELIPTICO');
    expect(achados).toEqual([
      { key: 'cardio', label: 'Cardio', items: [{ key: 'elíptico', label: 'Elíptico' }] },
    ]);
    expect(groupedEquipmentOptions('nada disso')).toEqual([]);
    expect(filterCustomEquipment(['Hack 45° da casa', 'Remada articulada'], 'hack')).toEqual([
      'Hack 45° da casa',
    ]);
  });

  it('rótulo: o da lista, peso corporal, outro ou o próprio nome', () => {
    expect(equipmentLabel('voador')).toBe('Voador (peck deck)');
    expect(equipmentLabel('peso corporal')).toBe('Peso corporal');
    expect(equipmentLabel('Hack da casa')).toBe('Hack da casa');
    expect(equipmentLabel('toString')).toBe('toString');
  });

  it('equipamento próprio: nome, tamanho, fora da lista e sem repetir', () => {
    expect(customEquipmentProblem('  ', [])).toMatch(/nome/);
    expect(customEquipmentProblem('x'.repeat(41), [])).toMatch(/40/);
    expect(customEquipmentProblem('Leg Press', [])).toMatch(/lista/);
    expect(customEquipmentProblem('Peso Corporal', [])).toMatch(/lista/);
    expect(customEquipmentProblem('hack  da CASA', ['Hack da casa'])).toMatch(/já foi/);
    expect(
      customEquipmentProblem(
        'Novo',
        Array.from({ length: 30 }, (_, i) => `e${i}`),
      ),
    ).toMatch(/30/);
    expect(customEquipmentProblem('Hack 45° da casa', [])).toBeNull();
  });

  it('o texto do campo filtra a lista, a não ser que já seja um item conhecido', () => {
    expect(chooserQuery('esteir', [])).toBe('esteir');
    expect(chooserQuery('  ', [])).toBe('');
    expect(chooserQuery('leg press', [])).toBe('');
    expect(chooserQuery('Voador (peck deck)', [])).toBe('');
    expect(chooserQuery('PESO CORPORAL', [])).toBe('');
    expect(chooserQuery('hack da casa', ['Hack da Casa'])).toBe('');
  });

  it('compara sem caixa, acento nem espaço extra, e grava sem espaço sobrando', () => {
    expect(sameEquipment(' Máquina  de glúteo', 'maquina de gluteo')).toBe(true);
    expect(sameEquipment('smith', 'leg press')).toBe(false);
    expect(customEquipmentName('  Hack   45° ')).toBe('Hack 45°');
  });
});
