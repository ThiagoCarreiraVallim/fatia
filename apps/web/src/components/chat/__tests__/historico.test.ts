import { describe, expect, it } from 'vitest';
import type { ChatHistoryMessage } from '@fatia/api-client';
import {
  codificarRetomada,
  decodificarRetomada,
  historicoParaMensagens,
  pausaPendente,
} from '../historico';

const linha = (parcial: Partial<ChatHistoryMessage> & Pick<ChatHistoryMessage, 'id' | 'role'>) =>
  ({
    content: '',
    tools: null,
    metadata: null,
    runId: null,
    review: null,
    createdAt: '2026-09-25T12:00:00Z',
    ...parcial,
  }) as ChatHistoryMessage;

describe('historicoParaMensagens', () => {
  it('fala da pessoa e resposta com texto viram mensagens com o id da linha', () => {
    expect(
      historicoParaMensagens([
        linha({ id: 'u1', role: 'user', content: 'oi' }),
        linha({ id: 'a1', role: 'assistant', content: 'Olá!' }),
      ]),
    ).toEqual([
      { id: 'u1', type: 'human', content: 'oi' },
      { id: 'a1', type: 'ai', content: 'Olá!' },
    ]);
  });

  it('as tools voltam como chamadas concluídas, sem argumento — só o nome é gravado', () => {
    const [mensagem, resultado] = historicoParaMensagens([
      linha({ id: 'a1', role: 'assistant', content: 'Registrei.', tools: [{ name: 'log_meal' }] }),
    ]);

    expect(mensagem).toMatchObject({
      id: 'a1',
      type: 'ai',
      content: 'Registrei.',
      tool_calls: [{ id: 'a1:0', name: 'log_meal', args: {} }],
    });
    // Lado a lado com a chamada: é o que faz o runtime desenhá-la como concluída
    // em vez de "rodando" para sempre depois de um F5.
    expect(resultado).toMatchObject({ type: 'tool', tool_call_id: 'a1:0', status: 'success' });
  });

  it('linha vazia não vira bolha em branco', () => {
    expect(historicoParaMensagens([linha({ id: 'a1', role: 'assistant' })])).toEqual([]);
  });
});

describe('pausaPendente', () => {
  const pausa = {
    status: 'interrupted' as const,
    interrupt: { id: 'p1', value: { kind: 'confirm' as const, prompt: 'x', actions: [] } },
  };

  it('devolve a pausa da última resposta, com o id', () => {
    expect(pausaPendente([linha({ id: 'a1', role: 'assistant', metadata: pausa })])).toMatchObject({
      id: 'p1',
      value: { kind: 'confirm' },
    });
  });

  it('ignora pausa que não está na última linha — ela já foi respondida', () => {
    expect(
      pausaPendente([
        linha({ id: 'a1', role: 'assistant', metadata: pausa }),
        linha({ id: 'u2', role: 'user', content: 'deixa pra lá' }),
      ]),
    ).toBeUndefined();
  });
});

describe('retomada', () => {
  it('ida e volta preservam o id da pausa e o valor', () => {
    const bruta = codificarRetomada('p1', { approvals: { c1: true } });
    expect(decodificarRetomada(bruta)).toEqual({
      interruptId: 'p1',
      value: { approvals: { c1: true } },
    });
  });

  it('texto puro é uma resposta simples, sem id', () => {
    expect(decodificarRetomada('sim')).toEqual({ interruptId: '', value: 'sim' });
  });
});
