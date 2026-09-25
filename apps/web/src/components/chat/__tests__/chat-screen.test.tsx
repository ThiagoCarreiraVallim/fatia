import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ChatConversation,
  ChatMemory,
  ChatQuota,
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
const pushMock = vi.fn();
let liberarLista: () => void = () => {};
let listaLiberada: Promise<void> = Promise.resolve();
let cota: ChatQuota;
let memorias: ChatMemory[] = [];
let recursos = { photos: false, dictation: false };
const transcribeAudioMock = vi.fn(async (_audio: Blob) => ({ text: 'registra 200 g de frango' }));
const deleteChatMemoryMock = vi.fn(async (id: string) => {
  memorias = memorias.filter((m) => m.id !== id);
});

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
    listConversations: vi.fn(async () => {
      await listaLiberada;
      return [];
    }),
    getChatAvailability: vi.fn(async () => ({ available: true, ...recursos })),
    transcribeAudio: transcribeAudioMock,
    getConversation: vi.fn(async () => {
      if (!conversaGravada) throw new actual.ApiError('Conversa não encontrada.', 404);
      return conversaGravada;
    }),
    sendChatFeedback: vi.fn(async () => undefined),
    getChatQuota: vi.fn(async () => cota),
    listChatMemories: vi.fn(async () => memorias),
    deleteChatMemory: deleteChatMemoryMock,
  };
});

// O navegador de teste não tem canvas: a recodificação tem teste próprio, e aqui
// a foto já "sai" recodificada.
vi.mock('../foto', async () => {
  const actual = await vi.importActual<typeof import('../foto')>('../foto');
  return {
    ...actual,
    adaptadorDeFoto: {
      ...actual.adaptadorDeFoto,
      send: async (anexo: Parameters<typeof actual.adaptadorDeFoto.send>[0]) => ({
        ...anexo,
        status: { type: 'complete' as const },
        content: [{ type: 'image' as const, image: 'data:image/jpeg;base64,SEMEXIF' }],
      }),
    },
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => `/chat/${CONVERSA}`,
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
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
  // A gaveta (`vaul`) consulta `matchMedia` e captura o ponteiro para o arrasto,
  // e o jsdom também não tem nenhum dos dois.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  fontes = [];
  corpos.length = 0;
  conversaGravada = null;
  cota = {
    spentMicros: 0,
    limitMicros: null,
    usedRatio: null,
    resetsAt: '2026-09-26T00:00:00.000Z',
    allowed: true,
  };
  memorias = [];
  recursos = { photos: false, dictation: false };
  deleteChatMemoryMock.mockClear();
  pushMock.mockClear();
  listaLiberada = Promise.resolve();
  transcribeAudioMock.mockClear();
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
  await waitFor(() => expect(campo).toBeEnabled());
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

  it('o campo espera a conversa abrir, em vez de perder o que foi digitado', async () => {
    // A chegada à conversa da URL zera o composer; o que se digitasse antes sumia.
    listaLiberada = new Promise((resolve) => {
      liberarLista = resolve;
    });
    recursos = { photos: true, dictation: true };
    montar();

    const campo = await screen.findByRole('textbox', { name: 'Mensagem para o Fatia' });
    expect(campo).toBeDisabled();
    expect(campo).toHaveAttribute('placeholder', 'Abrindo a conversa…');
    // A foto anexada nesse intervalo também sumiria na troca de conversa.
    expect(await screen.findByRole('button', { name: 'Anexar foto' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ditar mensagem' })).toBeDisabled();

    liberarLista();
    await waitFor(() => expect(campo).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Anexar foto' })).toBeEnabled();
  });

  it('o cabeçalho mostra o título que o servidor gerou depois do primeiro turno', async () => {
    montar();
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat' })).toBeInTheDocument();
    await enviar('almocei arroz e feijão');

    conversaGravada = {
      id: CONVERSA,
      title: 'Almoço de arroz e feijão',
      createdAt: '2026-09-25T12:00:00Z',
      updatedAt: '2026-09-25T12:00:01Z',
      messages: [],
    };
    fontes[0].emitir(fragmento('ai-1', 'Anotado.'), {
      event: 'done',
      data: { status: 'completed' },
    });
    fontes[0].fechar();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Almoço de arroz e feijão' }),
    ).toBeInTheDocument();
  });

  it('conversa nova, que ainda não existe no servidor, fica na URL dela ao enviar', async () => {
    // O 404 da conversa nova derrubava a troca de conversa do runtime, e o envio
    // levava a tela para `/chat/__LOCALID_…`, vazia.
    montar();
    await enviar('bom dia');
    fontes[0].emitir(fragmento('ai-1', 'Bom dia!'), {
      event: 'done',
      data: { status: 'completed' },
    });
    fontes[0].fechar();

    expect(await screen.findByText('Bom dia!')).toBeInTheDocument();
    for (const [destino] of pushMock.mock.calls) {
      expect(destino).toMatch(/^\/chat\/[0-9a-f-]{36}$/);
    }
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

  it('o artefato da tool aparece no cartão dela, com o número inteiro', async () => {
    montar();
    await enviar('quanto comi hoje?');

    fontes[0].emitir(
      {
        event: 'updates',
        data: {
          agente: {
            messages: [
              {
                type: 'ai',
                id: 'ai-1',
                content: '',
                tool_calls: [{ id: 'c1', name: 'get_today_summary', args: {} }],
              },
            ],
          },
        },
      },
      {
        event: 'updates',
        data: {
          ferramentas: {
            messages: [
              {
                type: 'tool',
                id: 'tool-c1',
                tool_call_id: 'c1',
                name: 'get_today_summary',
                content: '{"nutrition":{}}',
              },
            ],
          },
        },
      },
      {
        event: 'artifact',
        data: {
          toolCallId: 'c1',
          kind: 'metric',
          label: 'Calorias de hoje',
          value: 1832,
          unit: 'kcal',
          target: { min: 1800, max: 2200 },
        },
      },
    );

    const cartao = await screen.findByRole('figure', { name: 'Calorias de hoje' });
    expect(within(cartao).getByText('1.832')).toBeInTheDocument();
    expect(within(cartao).getByText('meta 1.800–2.200')).toBeInTheDocument();
  });

  it('mostra o plano do turno e o passo em andamento', async () => {
    montar();
    await enviar('compara minha semana com a anterior');

    fontes[0].emitir({
      event: 'plan',
      data: {
        steps: [
          { id: '1', title: 'Ler esta semana', status: 'done' },
          { id: '2', title: 'Ler a semana anterior', status: 'running' },
          { id: '3', title: 'Comparar', status: 'pending' },
        ],
      },
    });

    const plano = await screen.findByRole('region', { name: 'Plano' });
    const passos = within(plano).getAllByRole('listitem');
    expect(passos.map((p) => p.textContent)).toEqual([
      'Ler esta semana(feito)',
      'Ler a semana anterior(em andamento)',
      'Comparar(a fazer)',
    ]);
    expect(passos[1]).toHaveAttribute('aria-current', 'step');
  });

  it('avisa quando a cota de IA do dia acabou', async () => {
    cota = { ...cota, limitMicros: 100_000, spentMicros: 100_000, usedRatio: 1, allowed: false };
    montar();

    expect(await screen.findByRole('status')).toHaveTextContent('A cota de IA de hoje acabou');
  });

  it('a gaveta de memórias lista e esquece com dois toques', async () => {
    memorias = [
      { id: 'm-1', content: 'Não come carne nem ovo.', createdAt: '2026-09-25T12:00:00Z' },
    ];
    const user = userEvent.setup();
    montar();

    await user.click(await screen.findByRole('button', { name: 'Memórias do assistente' }));
    expect(await screen.findByText('Não come carne nem ovo.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Esquecer: Não come carne nem ovo.' }));
    expect(deleteChatMemoryMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar: esquecer' }));

    await waitFor(() => expect(deleteChatMemoryMock).toHaveBeenCalledWith('m-1'));
    expect(await screen.findByText('Nada guardado ainda.')).toBeInTheDocument();
  });

  it('sem visão nem ditado na instância, o composer não mostra câmera nem microfone', async () => {
    montar();

    await screen.findByRole('textbox', { name: 'Mensagem para o Fatia' });
    expect(screen.queryByRole('button', { name: 'Anexar foto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ditar mensagem' })).not.toBeInTheDocument();
  });

  it('a foto vai no corpo do turno, recodificada, e só a foto já basta para enviar', async () => {
    recursos = { photos: true, dictation: false };
    const user = userEvent.setup();
    montar();

    await screen.findByRole('button', { name: 'Anexar foto' });
    const arquivo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'prato.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByTestId('entrada-de-foto'), arquivo);
    expect(await screen.findByRole('button', { name: 'Tirar foto' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await waitFor(() => expect(corpos).toHaveLength(1));

    expect(corpos[0]).toEqual({
      conversationId: CONVERSA,
      message: 'O que tem nesta foto?',
      photos: [{ mediaType: 'image/jpeg', data: 'SEMEXIF' }],
    });
  });

  it('o ditado preenche o campo e não envia nada', async () => {
    recursos = { photos: false, dictation: true };
    const pararTrilha = vi.fn();
    const gravadores: {
      onstop: (() => void) | null;
      ondataavailable: ((e: { data: Blob }) => void) | null;
    }[] = [];
    class GravadorFalso {
      static isTypeSupported = (tipo: string) => tipo === 'audio/webm;codecs=opus';
      mimeType = 'audio/webm;codecs=opus';
      onstop: (() => void) | null = null;
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      constructor() {
        gravadores.push(this);
      }
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', GravadorFalso);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: pararTrilha }] })) },
    });
    const user = userEvent.setup();
    montar();

    await user.click(await screen.findByRole('button', { name: 'Ditar mensagem' }));
    await user.click(await screen.findByRole('button', { name: 'Parar de gravar' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Mensagem para o Fatia' })).toHaveValue(
        'registra 200 g de frango',
      ),
    );
    expect(transcribeAudioMock.mock.calls[0][0].type).toBe('audio/webm;codecs=opus');
    expect(pararTrilha).toHaveBeenCalled();
    expect(corpos).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
