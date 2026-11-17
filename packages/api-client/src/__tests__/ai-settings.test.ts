import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import {
  AI_NEVER_AUTOMATIC,
  AI_WRITE_CATEGORIES,
  adjustReviewGrams,
  aiTurnState,
  forgetAllChatMemories,
  getAiSettings,
  isAiConsentRequired,
  memoryCountLabel,
  memoryMeta,
  nextAiWriteMode,
  quotaResetLabel,
  reviewItemsFrom,
  reviewMealItems,
  reviewTotalKcal,
  savedUndoId,
  setAiWriteMode,
  undoAutoWrite,
} from '../ai-settings';
import type { ChatArtifact } from '../chat';
import type { MealRecognition } from '../nutrition';

const fetchMock = vi.fn();

function configure() {
  configureApiClient({
    resolveUrl: (path) => `/api/proxy${path.slice('/api'.length)}`,
    fetch: fetchMock as unknown as typeof fetch,
  });
}

afterEach(() => {
  fetchMock.mockReset();
  resetApiClient();
});

describe('Config da IA (Al-M24, ADR 039)', () => {
  it('as quatro categorias, na ordem da prancha', () => {
    expect(AI_WRITE_CATEGORIES.map((c) => [c.key, c.title, c.description])).toEqual([
      ['DAY_LOG', 'Registros do dia', 'Refeições, água, peso e passos'],
      ['WORKOUT', 'Treino', 'Sessões, exercícios e cargas'],
      ['GOALS', 'Metas', 'Criar e ajustar metas'],
      ['MEMORIES', 'Memórias', 'Preferências e rotina'],
    ]);
  });

  it('o toque gira Perguntar antes → Automático → Desligado → Perguntar antes', () => {
    expect(nextAiWriteMode('ASK')).toBe('AUTO');
    expect(nextAiWriteMode('AUTO')).toBe('OFF');
    expect(nextAiWriteMode('OFF')).toBe('ASK');
  });

  it('a lista do "nunca é automático" é a da ADR 039', () => {
    expect(AI_NEVER_AUTOMATIC).toEqual([
      'Apagar qualquer registro',
      'Cobrança e assinatura',
      'Compartilhar com a equipe',
      'Publicar no mural',
    ]);
  });

  it('lê e grava pelas rotas da API', async () => {
    configure();
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
    await getAiSettings();
    await setAiWriteMode('DAY_LOG', 'AUTO');
    await undoAutoWrite('a/1');
    await forgetAllChatMemories();

    const chamadas = fetchMock.mock.calls.map(([url, init]) => [
      url,
      (init as RequestInit).method ?? 'GET',
      (init as RequestInit).body ?? null,
    ]);
    expect(chamadas).toEqual([
      ['/api/proxy/chat/settings', 'GET', null],
      ['/api/proxy/chat/settings/modes', 'PATCH', '{"category":"DAY_LOG","mode":"AUTO"}'],
      ['/api/proxy/chat/auto-writes/a%2F1/undo', 'POST', null],
      ['/api/proxy/chat/memories', 'DELETE', null],
    ]);
  });
});

describe('o "Gravado" e o Desfazer', () => {
  const gravado = (extra: Record<string, unknown>) =>
    ({
      kind: 'saved',
      at: '2026-11-17T12:00:00Z',
      lines: [{ label: 'Quantidade', after: '300 ml' }],
      ...extra,
    }) as ChatArtifact;

  it('desfaz só o que a API marcou como desfazível, pelo id dela', () => {
    expect(savedUndoId(gravado({ undoable: true, autoWriteId: 'w1' }))).toBe('w1');
    expect(savedUndoId(gravado({ undoable: false, autoWriteId: 'w1' }))).toBeNull();
    expect(savedUndoId(gravado({ undoable: true }))).toBeNull();
    expect(savedUndoId({ kind: 'metric', value: 1 } as unknown as ChatArtifact)).toBeNull();
  });
});

describe('O que a IA lembra (Al-M9)', () => {
  it('categoria · data, como na prancha', () => {
    expect(
      memoryMeta(
        { id: '1', content: 'x', category: 'PREFERENCE', createdAt: '2026-10-12T15:00:00Z' },
        'America/Sao_Paulo',
      ),
    ).toBe('preferência · 12 out');
    expect(
      memoryMeta(
        { id: '1', content: 'x', category: null, createdAt: '2026-03-02T15:00:00Z' },
        'America/Sao_Paulo',
      ),
    ).toBe('2 mar');
  });

  it('o "n de 50"', () => {
    expect(memoryCountLabel(3, 50)).toBe('3 de 50');
  });
});

describe('a cota do dia (Al-M11)', () => {
  it('diz quando a IA volta, na hora de quem lê', () => {
    expect(
      quotaResetLabel(
        '2026-11-18T03:00:00Z',
        'America/Sao_Paulo',
        new Date('2026-11-17T20:00:00Z'),
      ),
    ).toBe('A IA volta amanhã às 00:00.');
    expect(
      quotaResetLabel(
        '2026-11-17T23:00:00Z',
        'America/Sao_Paulo',
        new Date('2026-11-17T12:00:00Z'),
      ),
    ).toBe('A IA volta hoje às 20:00.');
  });
});

describe('revisão da foto do prato (Al-M10)', () => {
  const rec: MealRecognition = {
    observacao: null,
    photoFileId: 'p1',
    itens: [
      {
        nomeReconhecido: 'arroz',
        foodId: 1,
        nomeDoCatalogo: 'Arroz, tipo 1, cozido',
        grams: 120,
        confidence: 0.9,
        estimado: false,
        kcal: 150,
        proteinG: 3,
        carbsG: 33,
        fatG: 0.3,
      },
      {
        nomeReconhecido: 'molho',
        foodId: null,
        nomeDoCatalogo: null,
        grams: 40,
        confidence: 0.4,
        estimado: true,
        kcal: 80,
        proteinG: 1,
        carbsG: 4,
        fatG: 6,
      },
    ],
  };

  it('começa com tudo marcado e soma o que está marcado, proporcional ao peso', () => {
    const itens = reviewItemsFrom(rec);
    expect(itens.every((i) => i.checked)).toBe(true);
    expect(reviewTotalKcal(itens)).toBe(230);

    const ajustados = [
      { ...itens[0]!, grams: 240 },
      { ...itens[1]!, checked: false },
    ];
    expect(reviewTotalKcal(ajustados)).toBe(300);
  });

  it('o −/+ anda de 10 em 10 g e não passa de 10 g para baixo', () => {
    expect(adjustReviewGrams(120, +1)).toBe(130);
    expect(adjustReviewGrams(125, -1)).toBe(115);
    expect(adjustReviewGrams(10, -1)).toBe(10);
  });

  it('grava só o marcado: TACO por foodId e gramas, o resto com os macros na escala', () => {
    const itens = reviewItemsFrom(rec);
    expect(
      reviewMealItems([
        { ...itens[0]!, checked: false },
        { ...itens[1]!, grams: 80 },
      ]),
    ).toEqual([
      {
        foodName: 'molho',
        grams: 80,
        kcal: 160,
        proteinG: 2,
        carbsG: 8,
        fatG: 12,
        source: 'AI',
      },
    ]);
    expect(reviewMealItems([itens[0]!])).toEqual([{ foodId: 1, grams: 120, source: 'AI' }]);
  });
});

describe('o 403 do aceite da IA (#384) na foto', () => {
  it('reconhece só o 403 com o código do aceite', async () => {
    const { ApiError } = await import('../http');
    expect(isAiConsentRequired(new ApiError('x', 403, { code: 'AI_CONSENT_REQUIRED' }))).toBe(true);
    expect(isAiConsentRequired(new ApiError('x', 403, { code: 'OUTRO' }))).toBe(false);
    expect(isAiConsentRequired(new ApiError('x', 402, { code: 'AI_CONSENT_REQUIRED' }))).toBe(
      false,
    );
    expect(isAiConsentRequired(new Error('x'))).toBe(false);
  });
});

describe('qual estado da Al-M11 um erro de turno vira', () => {
  it('cota, fora do ar e interrompida; o resto fica no cartão de erro de sempre', () => {
    expect(aiTurnState('AI_QUOTA_EXCEEDED')).toBe('quota');
    for (const code of [
      'AI_PROVIDER_UNREACHABLE',
      'AI_PROVIDER_TIMEOUT',
      'AI_PROVIDER_ERROR',
      'AI_PROVIDER_REFUSED',
      'AI_PROVIDER_NOT_CONFIGURED',
      'MCP_UNREACHABLE',
      'AI_NETWORK_ERROR',
    ] as const) {
      expect(aiTurnState(code)).toBe('down');
    }
    expect(aiTurnState('AGENT_STREAM_INTERRUPTED')).toBe('interrupted');
    expect(aiTurnState('AI_PLAN_REQUIRED')).toBe('other');
    expect(aiTurnState('AI_RESPONSE_TRUNCATED')).toBe('other');
  });
});
