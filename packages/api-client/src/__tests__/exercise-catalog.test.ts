import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  catalogGuideLabel,
  restClock,
  groupExerciseApi,
  parseRest,
  usageLabel,
  videoDurationProblem,
} from '../community-exercises';
import {
  contentApi,
  MAX_TIP_BODY,
  tipEditorCategories,
  TIP_CATEGORY_LABEL,
  wrapSelection,
} from '../index';
import { configureApiClient, resetApiClient } from '../http';
import { exerciseHowTo } from '../workout';

const fetchMock = vi.fn();
const pedido = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
};

describe('catálogo da equipe e editor de dica no cliente (#408)', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('os filtros do catálogo vão na query; desligados não vão', async () => {
    await groupExerciseApi.list('g1', {
      q: 'agacha',
      muscle: 'pernas',
      equipment: 'barra',
      house: true,
      favorite: false,
      limit: 60,
    });
    await groupExerciseApi.list('g1');
    expect(pedido(0).url).toBe(
      '/api/groups/g1/content/exercises?q=agacha&muscle=pernas&equipment=barra&house=true&limit=60',
    );
    expect(pedido(1).url).toBe('/api/groups/g1/content/exercises');
  });

  it('estrela e duplicar', async () => {
    await groupExerciseApi.setFavorite('g1', 7, true);
    await groupExerciseApi.duplicate('g1', 7);
    expect(`${pedido(0).method} ${pedido(0).url}`).toBe(
      'PUT /api/groups/g1/content/exercises/7/favorite',
    );
    expect(pedido(0).body).toEqual({ favorite: true });
    expect(`${pedido(1).method} ${pedido(1).url}`).toBe(
      'POST /api/groups/g1/content/exercises/7/duplicate',
    );
  });

  it('publicar a dica leva o "Anunciar no mural"', async () => {
    await contentApi.setTipState('g1', 't1', { published: true }, { announce: false });
    expect(pedido(0).body).toEqual({ published: true, announce: false });
  });

  it('vídeo do exercício: até 60 s', () => {
    expect(videoDurationProblem(24)).toBeNull();
    expect(videoDurationProblem(60)).toBeNull();
    expect(videoDurationProblem(61)).toBe('O vídeo vai até 60 s. Corte e envie de novo.');
    // Sem duração (o navegador não leu): a API confere.
    expect(videoDurationProblem(Number.NaN)).toBeNull();
  });

  it('descanso digitável: segundos ou mm:ss', () => {
    expect(parseRest('90')).toBe(90);
    expect(parseRest('2:00')).toBe(120);
    expect(parseRest('02:30')).toBe(150);
    expect(parseRest('')).toBeNull();
    expect(parseRest('abc')).toBeUndefined();
    expect(parseRest('1:75')).toBeUndefined();
    expect(restClock(120)).toBe('02:00');
    expect(restClock(null)).toBe('');
  });

  it('a coluna "Guia" e o "em N planos"', () => {
    const base = {
      hasGuide: true,
      hasVideo: true,
      hasTips: true,
      photoCount: 0,
      ownedByCommunity: false,
    };
    expect(catalogGuideLabel(base)).toBe('vídeo e dicas');
    expect(catalogGuideLabel({ ...base, hasVideo: false })).toBe('dicas');
    expect(catalogGuideLabel({ ...base, hasTips: false })).toBe('vídeo');
    expect(catalogGuideLabel({ ...base, hasVideo: false, hasTips: false })).toBe('guia');
    expect(catalogGuideLabel({ ...base, hasGuide: false })).toBe('do catálogo');
    expect(catalogGuideLabel({ ...base, hasGuide: false, ownedByCommunity: true })).toBe(
      'sem guia',
    );

    // Abaixo de 5 alunos não diz quantos, nem se é zero (#466).
    expect(usageLabel({ templates: 0, plans: { band: 'none', count: null } })).toBe(
      'em menos de 5 planos',
    );
    expect(usageLabel({ templates: 2, plans: { band: 'none', count: null } })).toBe(
      'em 2 modelos e menos de 5 planos',
    );
    expect(usageLabel({ templates: 0, plans: { band: 'many', count: 14 } })).toBe('em 14 planos');
    expect(usageLabel({ templates: 1, plans: { band: 'many', count: 5 } })).toBe(
      'em 1 modelo e 5 planos',
    );
  });

  it('dica: as quatro da prancha, mais a "geral" só para a dica antiga', () => {
    expect(MAX_TIP_BODY).toBe(600);
    expect(TIP_CATEGORY_LABEL.RECOVERY).toBe('Recuperação');
    expect(tipEditorCategories('HABITS')).toEqual(['WORKOUT', 'NUTRITION', 'HABITS', 'RECOVERY']);
    expect(tipEditorCategories('GENERAL')).toEqual([
      'WORKOUT',
      'NUTRITION',
      'HABITS',
      'RECOVERY',
      'GENERAL',
    ]);
  });

  it('"Como fazer" do membro: os passos da casa no lugar das instruções, e os erros', () => {
    const base = { instructions: ['Deite no banco.'], community: null };
    expect(exerciseHowTo(base)).toEqual({ steps: ['Deite no banco.'], mistakes: [] });
    const guia = {
      groupId: 'g',
      groupName: 'Academia',
      video: null,
      photos: [],
      tips: null,
    };
    // Guia sem passos (ou da API antiga): ficam as instruções.
    expect(exerciseHowTo({ ...base, community: { ...guia, steps: [] } }).steps).toEqual([
      'Deite no banco.',
    ]);
    expect(
      exerciseHowTo({
        ...base,
        community: { ...guia, steps: ['Pés firmes.'], commonMistakes: ['Quadril sobe.'] },
      }),
    ).toEqual({ steps: ['Pés firmes.'], mistakes: ['Quadril sobe.'] });
  });

  it('negrito e itálico em volta da seleção, ou o marcador no cursor', () => {
    expect(wrapSelection('Beba 500 ml de água', 5, 11, '**')).toEqual({
      text: 'Beba **500 ml** de água',
      start: 7,
      end: 13,
    });
    expect(wrapSelection('Beba', 4, 4, '*')).toEqual({ text: 'Beba**', start: 5, end: 5 });
    // Já marcado: tira.
    expect(wrapSelection('**500**', 2, 5, '**')).toEqual({ text: '500', start: 0, end: 3 });
  });
});
