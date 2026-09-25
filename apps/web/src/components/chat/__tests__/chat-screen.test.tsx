import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ChatConversation,
  ChatStreamFrame,
  ChatTurnRequest,
  StreamChatInit,
} from '@fatia/api-client';

/**
 * A tela do chat com o runtime **de verdade** do assistant-ui (ADR 023).
 *
 * Só a rede é dublê: `streamChat` e as rotas de conversa. O resto — o
 * `useLangGraphRuntime`, a acumulação de fragmentos, a pausa, o `Command` de
 * retomada — é o código de produção. É o que prova que o protocolo que o agente
 * emite é o que o runtime entende, que é exatamente onde as três camadas da #247
 * divergiram antes.
 *
 * O streaming é dirigido à mão por `Fonte`: despejar todos os quadros e olhar o
 * fim passaria igual com uma tela que só renderiza quando o stream fecha.
 */

class Fonte {
  private quadros: ChatStreamFrame[] = [];
  private aguardando: (() => void) | null = null;
  private terminou = false;

  async *gerar(signal?: AbortSignal): AsyncGenerator<ChatStreamFrame> {
    let i = 0;
    for (;;) {
      if (signal?.aborted) return;
      if (i < this.quadros.length) {
        yield this.quadros[i];
        i += 1;
        continue;
      }
      if (this.terminou) return;
      await new Promise<void>((resolve) => {
        this.aguardando = resolve;
        signal?.addEventListener('abort', () => resolve(), { once: true });
      });
    }
  }

  emitir(...quadros: ChatStreamFrame[]): void {
    this.quadros.push(...quadros);
    this.aguardando?.();
    this.aguardando = null;
  }

  fechar(): void {
    this.terminou = true;
    this.aguardando?.();
    this.aguardando = null;
  }
}

const CONVERSA = '3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44';

let fontes: Fonte[] = [];
const corpos: ChatTurnRequest[] = [];
let conversaGravada: ChatConversation | null = null;

const streamChatMock = vi.fn((corpo: ChatTurnRequest, init?: StreamChatInit) => {
  corpos.push(corpo);
  const fonte = new Fonte();
  fontes.push(fonte);
  return fonte.gerar(init?.signal);
});

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    streamChat: streamChatMock,
    listConversations: vi.fn(async () => []),
    getChatAvailability: vi.fn(async () => ({ available: true })),
    getConversation: vi.fn(async () => {
      if (!conversaGravada) throw new actual.ApiError('Conversa não encontrada.', 404);
      return conversaGravada;
    }),
    sendChatFeedback: vi.fn(async () => undefined),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => `/chat/${CONVERSA}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { ChatRuntimeProvider } = await import('../chat-runtime-provider');
const { ChatScreen } = await import('../chat-screen');

beforeAll(() => {
  // `use-stick-to-bottom` e o `SwapLabel` dos elements medem com `ResizeObserver`,
  // que o jsdom não tem.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  fontes = [];
  corpos.length = 0;
  conversaGravada = null;
});

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatRuntimeProvider>
        <ChatScreen />
      </ChatRuntimeProvider>
    </QueryClientProvider>,
  );
}

async function enviar(texto: string) {
  const user = userEvent.setup();
  const campo = await screen.findByRole('textbox', { name: 'Mensagem para o Fatia' });
  await user.type(campo, texto);
  await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
  await waitFor(() => expect(fontes).toHaveLength(corpos.length || 1));
  return user;
}

const fragmento = (id: string, content: string): ChatStreamFrame => ({
  event: 'messages',
  data: [{ type: 'AIMessageChunk', content, id }, { langgraph_node: 'agente' }],
});

describe('ChatScreen', () => {
  it('manda a conversa da URL e a mensagem, e desenha a resposta token a token', async () => {
    montar();
    await enviar('bom dia');

    expect(corpos[0]).toEqual({ conversationId: CONVERSA, message: 'bom dia' });

    fontes[0].emitir(fragmento('ai-1', 'Bom '));
    expect(await screen.findByText('Bom')).toBeInTheDocument();
    expect(screen.queryByText('Bom dia!')).not.toBeInTheDocument();

    fontes[0].emitir(fragmento('ai-1', 'dia!'));
    expect(await screen.findByText('Bom dia!')).toBeInTheDocument();
  });

  it('mostra "Pensando" até o primeiro token', async () => {
    montar();
    await enviar('bom dia');

    expect(await screen.findByLabelText('Pensando')).toBeInTheDocument();
    fontes[0].emitir(fragmento('ai-1', 'Oi'));
    await screen.findByText('Oi');
    expect(screen.queryByLabelText('Pensando')).not.toBeInTheDocument();
  });

  it('rotula a tool pelo título que o agente anunciou', async () => {
    montar();
    await enviar('o que comi?');

    fontes[0].emitir(
      { event: 'catalog', data: { tools: { list_meals: 'Listar refeições' } } },
      {
        event: 'updates',
        data: {
          agente: {
            messages: [
              {
                type: 'ai',
                id: 'ai-1',
                content: '',
                tool_calls: [{ id: 'c1', name: 'list_meals', args: { date: '2026-08-05' } }],
              },
            ],
          },
        },
      },
    );

    expect((await screen.findAllByText('Listar refeições')).length).toBeGreaterThan(0);
  });

  it('a escrita pausa num cartão, e confirmar retoma com o id da pausa', async () => {
    montar();
    const user = await enviar('almocei 200 g de frango');

    fontes[0].emitir(
      {
        event: 'updates',
        data: {
          agente: {
            messages: [
              {
                type: 'ai',
                id: 'ai-1',
                content: 'Vou registrar.',
                tool_calls: [{ id: 'c1', name: 'log_meal', args: { grams: 200 } }],
              },
            ],
          },
        },
      },
      {
        event: 'updates',
        data: {
          __interrupt__: [
            {
              id: 'pausa-1',
              value: {
                kind: 'confirm',
                prompt: 'Registrar refeição',
                actions: [
                  {
                    kind: 'confirm',
                    toolCallId: 'c1',
                    tool: 'log_meal',
                    title: 'Registrar refeição',
                    prompt: 'Registrar refeição',
                    arguments: { grams: 200 },
                  },
                ],
              },
            },
          ],
        },
      },
      { event: 'done', data: { status: 'interrupted' } },
    );
    fontes[0].fechar();

    const cartao = await screen.findByRole('group', { name: 'Ação aguardando confirmação' });
    expect(
      within(cartao).getByText('Nada foi salvo ainda. Confira os dados antes de confirmar.'),
    ).toBeInTheDocument();
    expect(within(cartao).getByText('200')).toBeInTheDocument();

    await user.click(within(cartao).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(corpos).toHaveLength(2));
    expect(corpos[1]).toEqual({
      conversationId: CONVERSA,
      resume: { interruptId: 'pausa-1', value: { approvals: { c1: true }, answers: {} } },
    });
  });

  it('erro no meio da resposta vira aviso com o texto do código, e não a prosa do servidor', async () => {
    montar();
    await enviar('oi');

    fontes[0].emitir(
      fragmento('ai-1', 'Consultando'),
      { event: 'error', data: { code: 'MCP_UNAUTHORIZED', message: 'Bearer recusado em /mcp' } },
      { event: 'done', data: { status: 'error' } },
    );
    fontes[0].fechar();

    expect(await screen.findByText(/Sua sessão expirou/)).toBeInTheDocument();
    expect(screen.queryByText(/Bearer recusado/)).not.toBeInTheDocument();
  });

  it('F5 com pausa pendente traz o cartão de volta', async () => {
    conversaGravada = {
      id: CONVERSA,
      title: 'Almoço',
      createdAt: '2026-09-25T12:00:00Z',
      updatedAt: '2026-09-25T12:00:00Z',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'almocei',
          tools: null,
          metadata: null,
          runId: null,
          review: null,
          createdAt: '2026-09-25T12:00:00Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          content: '',
          tools: [{ name: 'log_meal' }],
          metadata: {
            status: 'interrupted',
            interrupt: {
              id: 'pausa-9',
              value: {
                kind: 'question',
                prompt: 'Quantas gramas?',
                actions: [
                  {
                    kind: 'question',
                    toolCallId: 'q1',
                    messageId: 'tool-q1',
                    prompt: 'Quantas gramas?',
                    fields: [],
                  },
                ],
              },
            },
          },
          runId: 'r',
          review: null,
          createdAt: '2026-09-25T12:00:01Z',
        },
      ],
    };
    montar();

    expect(await screen.findByText('almocei')).toBeInTheDocument();
    expect(
      await screen.findByRole('group', { name: 'Pergunta do assistente' }),
    ).toBeInTheDocument();
  });
});
