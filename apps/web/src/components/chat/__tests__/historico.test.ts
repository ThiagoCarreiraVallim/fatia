import { describe, expect, it } from 'vitest';
import type { ChatHistoryMessage } from '@fatia/api-client';
import {
  codificarRetomada,
  decodificarRetomada,
  historyToMessages,
  pausaPendente,
} from '../historico';
import { stepState } from '../partes';

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

describe('historyToMessages', () => {
  it('fala da pessoa e resposta com texto viram mensagens com o id da linha', () => {
    expect(
      historyToMessages([
        linha({ id: 'u1', role: 'user', content: 'oi' }),
        linha({ id: 'a1', role: 'assistant', content: 'Olá!' }),
      ]),
    ).toEqual([
      { id: 'u1', type: 'human', content: 'oi' },
      { id: 'a1', type: 'ai', content: 'Olá!' },
    ]);
  });

  it('as tools voltam como chamadas concluídas, sem argumento — só o nome é gravado', () => {
    const [mensagem, resultado] = historyToMessages([
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

  it('com o id gravado, a chamada volta com o desfecho — inclusive o de uma linha posterior', () => {
    const mensagens = historyToMessages([
      linha({
        id: 'a1',
        role: 'assistant',
        tools: [{ name: 'log_meal' }],
        metadata: { status: 'resolved', toolCalls: [{ id: 'c1', name: 'log_meal' }] },
      }),
      linha({
        id: 'a2',
        role: 'assistant',
        content: 'Registrado.',
        metadata: { toolResults: [{ id: 'c1', status: 'error', errorText: 'Fora do ar.' }] },
      }),
    ]);

    expect(mensagens[0]).toMatchObject({ tool_calls: [{ id: 'c1', name: 'log_meal' }] });
    expect(mensagens[1]).toMatchObject({
      type: 'tool',
      tool_call_id: 'c1',
      status: 'error',
      content: 'Fora do ar.',
    });
  });

  it('a chamada de uma pausa ainda aberta não volta como feita', () => {
    // A escrita espera a pessoa no cartão; "feito" aqui seria mentira.
    const mensagens = historyToMessages([
      linha({
        id: 'a1',
        role: 'assistant',
        tools: [{ name: 'log_meal' }],
        metadata: { status: 'interrupted', toolCalls: [{ id: 'c1', name: 'log_meal' }] },
      }),
    ]);

    expect(mensagens.filter((m) => m.type === 'tool')).toEqual([]);
  });

  it('a chamada que nunca rodou volta como não executada, e não como feita', () => {
    // A pessoa escreveu outra coisa em vez de responder o cartão: a pausa virou
    // `resolved` e nenhum desfecho foi gravado.
    const mensagens = historyToMessages([
      linha({
        id: 'a1',
        role: 'assistant',
        tools: [{ name: 'log_meal' }],
        metadata: { status: 'resolved', toolCalls: [{ id: 'c1', name: 'log_meal' }] },
      }),
      linha({ id: 'u2', role: 'user', content: 'deixa pra lá' }),
      linha({ id: 'a2', role: 'assistant', content: 'Ok.' }),
    ]);

    expect(mensagens[1]).toMatchObject({ type: 'tool', tool_call_id: 'c1', status: 'error' });
    expect(
      stepState({ type: 'complete' }, true, (mensagens[1] as { content: string }).content),
    ).toBe('nao_rodou');
  });

  it('linha vazia não vira bolha em branco', () => {
    expect(historyToMessages([linha({ id: 'a1', role: 'assistant' })])).toEqual([]);
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
