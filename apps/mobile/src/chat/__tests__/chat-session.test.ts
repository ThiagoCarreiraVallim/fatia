import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChatConversation,
  ChatStreamFrame,
  ChatTurnRequest,
  StreamChatInit,
} from '@fatia/api-client';

/** A conversa aberta no app (Fase 9e): o que vai ao servidor e o que a tela vê. */

class Fonte {
  private quadros: ChatStreamFrame[] = [];
  private acordar: (() => void) | null = null;
  private fim = false;
  async *gerar(signal?: AbortSignal): AsyncGenerator<ChatStreamFrame> {
    let i = 0;
    for (;;) {
      if (signal?.aborted) return;
      if (i < this.quadros.length) {
        yield this.quadros[i++];
        continue;
      }
      if (this.fim) return;
      await new Promise<void>((r) => {
        this.acordar = r;
        signal?.addEventListener('abort', () => r(), { once: true });
      });
    }
  }
  emitir(...q: ChatStreamFrame[]) {
    this.quadros.push(...q);
    this.acordar?.();
  }
  fechar() {
    this.fim = true;
    this.acordar?.();
  }
}

const fontes: Fonte[] = [];
const turnos: ChatTurnRequest[] = [];
const lives: { id: string; after?: number }[] = [];
let conversa: ChatConversation | null = null;
const stopMock = vi.fn(async (_id: string) => undefined);
const voteMock = vi.fn(async () => undefined);

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  const nova = (init?: StreamChatInit) => {
    const f = new Fonte();
    fontes.push(f);
    return f.gerar(init?.signal);
  };
  return {
    ...actual,
    streamChat: (corpo: ChatTurnRequest, init?: StreamChatInit) => {
      turnos.push(corpo);
      return nova(init);
    },
    joinChatRun: (id: string, init?: StreamChatInit & { after?: number }) => {
      lives.push({ id, after: init?.after });
      return nova(init);
    },
    stopChatRun: (id: string) => stopMock(id),
    sendChatFeedback: voteMock,
    getConversation: async () => {
      if (!conversa) throw new actual.ApiError('Conversa não encontrada.', 404);
      return conversa;
    },
  };
});

const { ChatSession } = await import('../chat-session');
const respirar = () => new Promise((r) => setTimeout(r, 0));
const fragmento = (id: string, content: string): ChatStreamFrame => ({
  event: 'messages',
  data: [{ type: 'AIMessageChunk', id, content }, {}],
});

let n = 0;
const sessao = () => new ChatSession(() => `id-${++n}`);

beforeEach(() => {
  fontes.length = 0;
  turnos.length = 0;
  lives.length = 0;
  conversa = null;
});

describe('ChatSession', () => {
  it('conversa nova: manda a mensagem com o agente escolhido e desenha a resposta aos pedaços', async () => {
    const s = sessao();
    const id = s.startNew();
    const enviando = s.send({ text: 'bom dia', agentGroupId: null });
    await respirar();

    expect(turnos[0]).toEqual({ conversationId: id, message: 'bom dia', agentGroupId: null });
    expect(s.getSnapshot().thread.messages[0]).toMatchObject({ role: 'user', text: 'bom dia' });

    fontes[0].emitir(
      { ...fragmento('ai-1', 'Bom '), id: 1 },
      { ...fragmento('ai-1', 'dia!'), id: 2 },
    );
    await respirar();
    expect(s.getSnapshot().thread.messages.at(-1)).toMatchObject({ text: 'Bom dia!' });
    expect(s.getSnapshot().thread.running).toBe(true);

    fontes[0].emitir({ event: 'done', data: { status: 'completed' } });
    fontes[0].fechar();
    await enviando;
    expect(s.getSnapshot().thread.running).toBe(false);

    // Segunda mensagem: a conversa já existe, a escolha do agente não vai mais.
    void s.send({ text: 'e agora?', agentGroupId: 'g-1' });
    await respirar();
    expect(turnos[1]).toEqual({ conversationId: id, message: 'e agora?' });
  });

  it('abrir uma conversa que ainda responde acompanha pelo live, sem reenviar nada', async () => {
    conversa = {
      id: 'c1',
      title: 't',
      createdAt: '',
      updatedAt: '',
      running: true,
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'oi',
          tools: null,
          metadata: null,
          runId: null,
          review: null,
          createdAt: '',
        },
      ],
    };
    const s = sessao();
    await s.open('c1');
    await respirar();

    expect(lives).toEqual([{ id: 'c1', after: undefined }]);
    expect(turnos).toHaveLength(0);
    fontes[0].emitir(fragmento('ai-1', 'Olá.'));
    await respirar();
    expect(s.getSnapshot().thread.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('voltar do segundo plano no meio da resposta troca a conexão, a partir do último id', async () => {
    const s = sessao();
    s.startNew();
    void s.send({ text: 'oi' });
    await respirar();
    fontes[0].emitir({ event: 'start', data: {}, id: 1 }, { ...fragmento('ai-1', 'Olá'), id: 2 });
    await respirar();

    s.reconnect();
    await respirar();

    expect(lives).toEqual([{ id: s.getSnapshot().conversationId, after: 2 }]);
    fontes[1].emitir({ ...fragmento('ai-1', ', tudo bem?'), id: 3 });
    // A conexão antiga, se ainda falar, não escreve mais na tela.
    fontes[0].emitir(fragmento('ai-1', ' DUPLICADO'));
    await respirar();
    expect(s.getSnapshot().thread.messages.at(-1)).toMatchObject({ text: 'Olá, tudo bem?' });
  });

  it('parar vai ao servidor e marca a resposta como parada', async () => {
    const s = sessao();
    const id = s.startNew();
    void s.send({ text: 'oi' });
    await respirar();
    fontes[0].emitir(fragmento('ai-1', 'Começando'));
    await respirar();

    await s.stop();

    expect(stopMock).toHaveBeenCalledWith(id);
    expect(s.getSnapshot().thread.running).toBe(false);
    expect(s.getSnapshot().thread.messages.at(-1)).toMatchObject({ stopped: true });
  });

  it('responder uma pausa manda o id dela e o valor', async () => {
    const s = sessao();
    const id = s.startNew();
    void s.send({ text: 'registra 200 g de frango' });
    await respirar();
    fontes[0].emitir(
      {
        event: 'updates',
        data: {
          __interrupt__: [{ id: 'p1', value: { kind: 'confirm', prompt: 'ok?', actions: [] } }],
        },
      },
      { event: 'done', data: { status: 'interrupted' } },
    );
    fontes[0].fechar();
    await respirar();
    expect(s.getSnapshot().thread.interrupt?.id).toBe('p1');

    void s.resume({ approvals: { c1: true } });
    await respirar();
    expect(turnos[1]).toEqual({
      conversationId: id,
      resume: { interruptId: 'p1', value: { approvals: { c1: true } } },
    });
    expect(s.getSnapshot().thread.interrupt).toBeNull();
  });

  it('trocar de conversa no meio da resposta não deixa a anterior escrever na nova', async () => {
    const s = sessao();
    s.startNew();
    void s.send({ text: 'oi' });
    await respirar();
    const outra = s.startNew();
    fontes[0].emitir(fragmento('ai-1', 'da conversa velha'));
    await respirar();

    expect(s.getSnapshot().conversationId).toBe(outra);
    expect(s.getSnapshot().thread.messages).toHaveLength(0);
  });
});
