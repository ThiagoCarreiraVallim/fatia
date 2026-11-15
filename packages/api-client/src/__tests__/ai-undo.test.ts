import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { undoableWrite, undoWrite } from '../ai-drawer';
import type { ChatStreamFrame } from '../chat';
import { configureApiClient, resetApiClient } from '../http';

/**
 * "Almoço gravado · Desfazer" depois do "Gravar assim" (#369, prancha
 * Al-H6c8). O resume não devolve um id à parte: o registro criado chega no
 * resultado da tool, no quadro `updates` do próprio turno. Daqui sai o que
 * desfazer e o texto do aviso.
 */
const toolFrame = (
  name: string,
  toolCallId: string,
  content: unknown,
  status = 'success',
): ChatStreamFrame => ({
  event: 'updates',
  data: {
    ferramentas: {
      messages: [
        {
          type: 'tool',
          name,
          tool_call_id: toolCallId,
          status,
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
      ],
    },
  },
});

describe('undoableWrite', () => {
  it('refeição gravada: o id dela e "Almoço gravado"', () => {
    const frames = [
      { event: 'start', data: {} },
      toolFrame('log_meal', 'call-1', { id: 'meal-9', mealType: 'LUNCH', items: [] }),
      { event: 'done', data: { status: 'complete' } },
    ];
    expect(undoableWrite(frames, 'call-1')).toEqual({
      tool: 'log_meal',
      id: 'meal-9',
      message: 'Almoço gravado',
    });
  });

  it('água, peso e passos também se desfazem', () => {
    expect(
      undoableWrite([toolFrame('log_water', 'c', { waterLogId: 'w1', totalMlForDate: 300 })], 'c')
        ?.message,
    ).toBe('Água gravada');
    expect(undoableWrite([toolFrame('log_weight', 'c', { weightLogId: 'p1' })], 'c')?.message).toBe(
      'Peso gravado',
    );
    expect(undoableWrite([toolFrame('log_steps', 'c', { stepLogId: 's1' })], 'c')?.message).toBe(
      'Passos gravados',
    );
  });

  it('só o resultado da escrita aprovada, e só se deu certo', () => {
    const frames = [toolFrame('log_meal', 'outra', { id: 'meal-1', mealType: 'DINNER' })];
    expect(undoableWrite(frames, 'call-1')).toBeNull();
    expect(
      undoableWrite([toolFrame('log_meal', 'call-1', 'Erro: alimento', 'error')], 'call-1'),
    ).toBeNull();
    expect(undoableWrite([toolFrame('log_meal', 'call-1', 'não é JSON')], 'call-1')).toBeNull();
    // Água volta como { waterLogId, totalMlForDate }: sem o campo certo, sem Desfazer.
    expect(undoableWrite([toolFrame('log_water', 'c', { id: 'w1' })], 'c')).toBeNull();
  });

  it('tool sem desfazer conhecido não oferece Desfazer', () => {
    expect(undoableWrite([toolFrame('create_custom_food', 'c', { id: 'f1' })], 'c')).toBeNull();
  });
});

describe('undoWrite', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    configureApiClient({ resolveUrl: (p) => p, fetch: fetchMock as unknown as typeof fetch });
  });
  afterEach(() => resetApiClient());

  it.each([
    ['log_meal', '/api/nutrition/meals/x'],
    ['log_water', '/api/water-logs/x'],
    ['log_weight', '/api/weight-logs/x'],
    ['log_steps', '/api/step-logs/x'],
  ] as const)('%s apaga pelo endpoint do recurso (dono = token)', async (tool, url) => {
    await undoWrite({ tool, id: 'x', message: '' });
    const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(called).toBe(url);
    expect(init.method).toBe('DELETE');
  });
});
