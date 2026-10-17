import { describe, expect, it } from 'vitest';
import type { ChatHistoryMessage } from '@fatia/api-client';
import {
  formatDuration,
  stoppedFromHistory,
  timingFromDone,
  timingStats,
  timingsFromHistory,
  voteRowsFromHistory,
} from '../turn-timing';

describe('formatDuration', () => {
  it('lê como gente: ms, segundos com vírgula, minutos', () => {
    expect(formatDuration(840)).toBe('840 ms');
    expect(formatDuration(4180)).toBe('4,2 s');
    expect(formatDuration(64_000)).toBe('1 min 4 s');
  });

  it('medida impossível não vira número', () => {
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('timingStats', () => {
  it('medida ausente não vira zero: só aparece o que foi medido', () => {
    expect(timingStats({ durationMs: 2000 })).toEqual([{ label: 'respondeu em', value: '2,0 s' }]);
    expect(timingStats({})).toEqual([]);
    expect(timingStats(undefined)).toEqual([]);
  });
});

describe('timingFromDone', () => {
  it('aceita só inteiro não negativo, e nada vira nulo', () => {
    expect(timingFromDone({ status: 'completed', durationMs: 10, ttftMs: 3 })).toEqual({
      durationMs: 10,
      ttftMs: 3,
    });
    expect(timingFromDone({ status: 'completed', durationMs: -2, ttftMs: '3' })).toBeNull();
    expect(timingFromDone({ status: 'completed' })).toBeNull();
  });
});

describe('do histórico', () => {
  const linha = (id: string, metadata: ChatHistoryMessage['metadata'], role = 'assistant') =>
    ({
      id,
      role,
      content: 'x',
      tools: null,
      metadata,
      runId: null,
      review: null,
      createdAt: '2026-09-25T12:00:00Z',
    }) as ChatHistoryMessage;

  it('lê o tempo e as respostas paradas, e ignora a fala da pessoa', () => {
    const linhas = [
      linha('u1', { durationMs: 99 }, 'user'),
      linha('a1', { status: 'completed', durationMs: 1200, ttftMs: 300 }),
      linha('u2', null, 'user'),
      linha('a2', { status: 'stopped' }),
      linha('u3', null, 'user'),
      linha('a3', null),
    ];
    expect(timingsFromHistory(linhas)).toEqual({ a1: { durationMs: 1200, ttftMs: 300 } });
    expect(stoppedFromHistory(linhas)).toEqual(['a2']);
  });

  it('respostas seguidas são uma na tela: o id é o da primeira, o estado é o da última', () => {
    // Confirmação (a1) e retomada (a2) são duas linhas e uma resposta só na tela.
    const linhas = [
      linha('u1', null, 'user'),
      linha('a1', { status: 'resolved', durationMs: 1100 }),
      linha('a2', { status: 'stopped', durationMs: 7700 }),
    ];
    expect(timingsFromHistory(linhas)).toEqual({ a1: { durationMs: 7700 } });
    expect(stoppedFromHistory(linhas)).toEqual(['a1']);
    expect(voteRowsFromHistory(linhas).get('a1')).toBe('a2');
  });
});
