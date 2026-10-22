import { describe, expect, it } from 'vitest';
import {
  EMPTY_CHAT_THREAD,
  TOOL_NOT_RUN_PREFIX,
  TOOL_REFUSED_PREFIX,
  appendUserMessage,
  applyChatFrame,
  askFieldsOf,
  questionAnswer,
  threadFromHistory,
  type ChatAssistantMessage,
  type ChatThreadState,
} from '../chat-thread';
import type { ChatHistoryMessage, ChatStreamFrame } from '../chat';

/** A conversa do app nativo como função pura dos quadros do agente (Fase 9e). */

const aplicar = (frames: ChatStreamFrame[], inicio: ChatThreadState = EMPTY_CHAT_THREAD) =>
  frames.reduce(applyChatFrame, inicio);

const fragmento = (id: string, content: unknown): ChatStreamFrame => ({
  event: 'messages',
  data: [{ type: 'AIMessageChunk', id, content }, { langgraph_node: 'agente' }],
});
const resposta = (s: ChatThreadState) => s.messages.at(-1) as ChatAssistantMessage;

describe('applyChatFrame', () => {
  it('acumula o texto por id, na ordem, e guarda o cursor', () => {
    const s = aplicar([
      { event: 'start', data: { runId: 'r' }, id: 1 },
      { ...fragmento('ai-1', 'Você '), id: 2 },
      { ...fragmento('ai-1', 'comeu arroz.'), id: 3 },
    ]);
    expect(resposta(s).text).toBe('Você comeu arroz.');
    expect(s.running).toBe(true);
    expect(s.lastSeq).toBe(3);
  });

  it('raciocínio vai para o lado, e não para a resposta', () => {
    const s = aplicar([
      fragmento('ai-1', [{ type: 'reasoning', reasoning: 'Vou somar.', index: 0 }]),
      fragmento('ai-1', 'Total: 92 g.'),
    ]);
    expect(resposta(s)).toMatchObject({ text: 'Total: 92 g.', reasoning: 'Vou somar.' });
  });

  it('a chamada de tool aparece rodando e ganha o desfecho do ToolMessage', () => {
    const s = aplicar([
      {
        event: 'updates',
        data: {
          agente: {
            messages: [
              {
                type: 'ai',
                id: 'ai-1',
                content: '',
                tool_calls: [{ id: 'c1', name: 'list_meals' }],
              },
            ],
          },
        },
      },
    ]);
    expect(resposta(s).tools).toEqual([{ id: 'c1', name: 'list_meals', status: 'running' }]);

    const depois = aplicar(
      [
        {
          event: 'updates',
          data: {
            ferramentas: {
              messages: [
                { type: 'tool', tool_call_id: 'c1', status: 'error', content: 'sem acesso' },
              ],
            },
          },
        },
      ],
      s,
    );
    expect(resposta(depois).tools[0]).toEqual({
      id: 'c1',
      name: 'list_meals',
      status: 'error',
      errorText: 'sem acesso',
    });
  });

  it('messages/complete substitui o texto montado pelos fragmentos', () => {
    const s = aplicar([
      fragmento('ai-1', 'Você comeu ar'),
      {
        event: 'messages/complete',
        data: [{ type: 'ai', id: 'ai-1', content: 'Você comeu arroz.' }],
      },
    ]);
    expect(resposta(s).text).toBe('Você comeu arroz.');
  });

  it('a pausa fica guardada até o done interrompido, e some num done normal', () => {
    const pausa = {
      event: 'updates',
      data: {
        __interrupt__: [
          { id: 'p1', value: { kind: 'confirm', prompt: 'Registrar?', actions: [] } },
        ],
      },
    };
    const parada = aplicar([pausa, { event: 'done', data: { status: 'interrupted' } }]);
    expect(parada.interrupt?.id).toBe('p1');
    expect(parada.running).toBe(false);

    expect(aplicar([pausa, { event: 'done', data: { status: 'completed' } }]).interrupt).toBeNull();
  });

  it('erro fica no estado com o código; o done fecha o turno', () => {
    const s = aplicar([
      { event: 'error', data: { code: 'AI_PROVIDER_TIMEOUT', message: 'detalhe de infra' } },
      { event: 'done', data: { status: 'error' } },
    ]);
    expect(s.error).toEqual({ code: 'AI_PROVIDER_TIMEOUT' });
    expect(s.running).toBe(false);
  });

  it('parar marca a resposta; tool sem desfecho não fica girando', () => {
    const s = aplicar([
      {
        event: 'updates',
        data: {
          agente: { messages: [{ type: 'ai', id: 'ai-1', tool_calls: [{ id: 'c1', name: 'x' }] }] },
        },
      },
      fragmento('ai-1', 'Consultando'),
      { event: 'done', data: { status: 'stopped' } },
    ]);
    expect(resposta(s).stopped).toBe(true);
    expect(resposta(s).tools[0].status).toBe('error');
  });

  it('persisted liga a resposta à linha do banco, onde o voto grava', () => {
    const s = aplicar([
      fragmento('ai-1', 'Oi!'),
      { event: 'done', data: { status: 'completed', durationMs: 1200 } },
      { event: 'persisted', data: { messageId: 'ai-1', assistantMessageId: 'linha-9' } },
    ]);
    expect(resposta(s)).toMatchObject({ rowId: 'linha-9', durationMs: 1200 });
  });

  it('cartão, plano e títulos das tools', () => {
    const s = aplicar([
      { event: 'catalog', data: { tools: { log_meal: 'Registrar refeição' } } },
      { event: 'plan', data: { steps: [{ id: '1', title: 'Somar', status: 'running' }] } },
      { event: 'artifact', data: { toolCallId: 'c1', kind: 'metric', value: 92 } },
    ]);
    expect(s.toolTitles.log_meal).toBe('Registrar refeição');
    expect(s.plan).toHaveLength(1);
    expect(s.artifacts.c1).toMatchObject({ kind: 'metric' });
  });

  it('a pergunta da pessoa entra antes da resposta e limpa o erro anterior', () => {
    const comErro = { ...EMPTY_CHAT_THREAD, error: { code: 'AI_UNKNOWN_ERROR' as const } };
    const s = appendUserMessage(comErro, { id: 'u1', text: 'oi', photos: 1 });
    expect(s.messages).toEqual([{ role: 'user', id: 'u1', text: 'oi', photos: 1 }]);
    expect(s.error).toBeNull();
    expect(s.running).toBe(true);
  });
});

describe('threadFromHistory', () => {
  const linha = (extra: Partial<ChatHistoryMessage>): ChatHistoryMessage => ({
    id: 'm',
    role: 'assistant',
    content: '',
    tools: null,
    metadata: null,
    runId: null,
    review: null,
    createdAt: '2026-10-18T12:00:00Z',
    ...extra,
  });

  it('refaz a conversa com desfechos, cartões, voto e a pausa aberta', () => {
    const s = threadFromHistory([
      linha({ id: 'u1', role: 'user', content: 'almocei', metadata: { photos: 1 } }),
      linha({
        id: 'a1',
        content: 'Registrei.',
        review: 'like',
        metadata: {
          status: 'completed',
          toolCalls: [
            { id: 'c1', name: 'log_meal' },
            { id: 'c2', name: 'x' },
          ],
          toolResults: [{ id: 'c1', status: 'success' }],
          artifacts: { c1: { toolCallId: 'c1', kind: 'metric' } as never },
        },
      }),
      linha({
        id: 'a2',
        content: '',
        metadata: {
          status: 'interrupted',
          toolCalls: [{ id: 'c3', name: 'log_weight' }],
          interrupt: { id: 'p1', value: { kind: 'confirm', prompt: 'ok?', actions: [] } },
        },
      }),
    ]);

    expect(s.messages[0]).toEqual({ role: 'user', id: 'u1', text: 'almocei', photos: 1 });
    const a1 = s.messages[1] as ChatAssistantMessage;
    // Sem desfecho fora de uma pausa aberta: nunca rodou, e não vira "feito".
    expect(a1.tools.map((t) => t.status)).toEqual(['success', 'not_run']);
    expect(a1).toMatchObject({ rowId: 'a1', review: 'like' });
    expect((s.messages[2] as ChatAssistantMessage).tools[0].status).toBe('running');
    expect(s.interrupt?.id).toBe('p1');
    expect(s.artifacts.c1).toBeDefined();
  });
});

describe('recusa e "não executada" não são erro (como no PWA)', () => {
  const desfecho = (content: string): ChatStreamFrame => ({
    event: 'updates',
    data: {
      ferramentas: {
        messages: [{ type: 'tool', tool_call_id: 'c1', status: 'error', content }],
      },
    },
  });
  const pedido: ChatStreamFrame = {
    event: 'updates',
    data: {
      agente: {
        messages: [
          { type: 'ai', id: 'ai-1', content: '', tool_calls: [{ id: 'c1', name: 'log_meal' }] },
        ],
      },
    },
  };

  it('a pessoa recusou: refused, sem texto de erro', () => {
    const s = aplicar([pedido, desfecho(`${TOOL_REFUSED_PREFIX} esta alteração na tela.`)]);
    expect(resposta(s).tools[0]).toEqual({ id: 'c1', name: 'log_meal', status: 'refused' });
  });

  it('a conversa seguiu antes: not_run', () => {
    const s = aplicar([pedido, desfecho(`${TOOL_NOT_RUN_PREFIX}: a conversa seguiu.`)]);
    expect(resposta(s).tools[0].status).toBe('not_run');
  });

  it('falha de verdade continua error, com o texto', () => {
    const s = aplicar([pedido, desfecho('sem acesso')]);
    expect(resposta(s).tools[0]).toMatchObject({ status: 'error', errorText: 'sem acesso' });
  });
});

describe('perguntas do agente', () => {
  it('sem campo aproveitável, a resposta é livre', () => {
    const campos = askFieldsOf({
      kind: 'question',
      toolCallId: 't',
      messageId: 'm',
      prompt: 'Que horas?',
      fields: [42 as never],
    });
    expect(campos).toEqual([{ name: '__livre', label: 'Sua resposta', type: 'text' }]);
    expect(questionAnswer(campos, { __livre: '12h' })).toBe('12h');
  });

  it('com campos, vai rótulo → valor, sem os vazios', () => {
    const campos = askFieldsOf({
      kind: 'question',
      toolCallId: 't',
      messageId: 'm',
      prompt: 'Detalhes',
      fields: [
        { name: 'g', label: 'Gramas', type: 'number' },
        { name: 'h', label: 'Hora', type: 'text' },
      ],
    });
    expect(questionAnswer(campos, { g: '200', h: '' })).toEqual({ Gramas: '200' });
  });
});
