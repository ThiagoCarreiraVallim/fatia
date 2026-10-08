import { describe, expect, it } from 'vitest';
import type { ChatStreamFrame } from '@fatia/api-client';
import { TURN_ERROR_EVENT, separateTurnError } from '../turn-error';

async function* de(...frames: ChatStreamFrame[]): AsyncGenerator<ChatStreamFrame> {
  for (const frame of frames) yield frame;
}

async function coletar(frames: AsyncIterable<ChatStreamFrame>): Promise<string[]> {
  const nomes: string[] = [];
  for await (const frame of frames) nomes.push(frame.event);
  return nomes;
}

const erro: ChatStreamFrame = { event: 'error', data: { code: 'AI_QUOTA_EXCEEDED' } };
const done: ChatStreamFrame = { event: 'done', data: { status: 'error' } };

describe('separateTurnError', () => {
  it('erro antes de qualquer resposta vira evento próprio', async () => {
    const start: ChatStreamFrame = { event: 'start', data: {} };
    expect(await coletar(separateTurnError(de(start, erro, done)))).toEqual([
      'start',
      TURN_ERROR_EVENT,
      'done',
    ]);
  });

  it('depois de um fragmento de IA, o erro passa como veio — ele é deste turno', async () => {
    const fragmento: ChatStreamFrame = {
      event: 'messages',
      data: [{ type: 'AIMessageChunk', content: 'Oi', id: 'ai-1' }, {}],
    };
    expect(await coletar(separateTurnError(de(fragmento, erro, done)))).toEqual([
      'messages',
      'error',
      'done',
    ]);
  });

  it('uma pausa sozinha não é resposta: o erro depois dela ainda é do turno sem resposta', async () => {
    const pausa: ChatStreamFrame = {
      event: 'updates',
      data: { __interrupt__: [{ id: 'p1', value: {} }] },
    };
    expect(await coletar(separateTurnError(de(pausa, erro)))).toEqual([
      'updates',
      TURN_ERROR_EVENT,
    ]);
  });

  it('a mensagem de IA que chega por `updates` também conta como resposta', async () => {
    const pedido: ChatStreamFrame = {
      event: 'updates',
      data: { agente: { messages: [{ type: 'ai', content: '', id: 'ai-1', tool_calls: [] }] } },
    };
    expect(await coletar(separateTurnError(de(pedido, erro)))).toEqual(['updates', 'error']);
  });
});
