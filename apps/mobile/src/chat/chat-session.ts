import {
  EMPTY_CHAT_THREAD,
  PHOTO_ONLY_QUESTION,
  ApiError,
  appendUserMessage,
  applyChatFrame,
  getConversation,
  joinChatRun,
  sendChatFeedback,
  stopChatRun,
  streamChat,
  threadFromHistory,
  type ChatAgentHeader,
  type ChatPhoto,
  type ChatResumeValue,
  type ChatStreamFrame,
  type ChatThreadState,
} from '@fatia/api-client';

/**
 * A conversa aberta no app, fora do React (Fase 9e).
 *
 * Mora no layout do app, acima das abas, e não na tela da conversa: trocar de
 * aba não pode cortar a resposta (ADR 035). O estado da tela sai daqui por
 * `subscribe`/`getSnapshot` (`useSyncExternalStore`), e o que chega do servidor
 * passa por `applyChatFrame`, a mesma função testada no api-client.
 *
 * Classe sem React Native de propósito: é a parte que precisa de teste, e o
 * harness do app só roda lógica pura.
 */

export interface ChatSessionSnapshot {
  conversationId: string | null;
  thread: ChatThreadState;
  /** O agente da conversa (cabeçalho). `null` é o assistente da Fatia. */
  agent: ChatAgentHeader | null;
  /** A conversa ainda não existe no servidor: a escolha do agente vale. */
  isNew: boolean;
  loading: boolean;
  loadError: unknown;
}

type Listener = () => void;

const VAZIO: ChatSessionSnapshot = {
  conversationId: null,
  thread: EMPTY_CHAT_THREAD,
  agent: null,
  isNew: true,
  loading: false,
  loadError: null,
};

export class ChatSession {
  private snapshot: ChatSessionSnapshot = VAZIO;
  private readonly listeners = new Set<Listener>();
  private controller: AbortController | null = null;
  /** Ao fim de cada turno: a lista, a cota e as memórias mudam juntas. */
  private onTurnEnd: (() => void) | null = null;

  constructor(private readonly newId: () => string) {}

  setTurnEndListener(listener: (() => void) | null): void {
    this.onTurnEnd = listener;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ChatSessionSnapshot => this.snapshot;

  private set(parcial: Partial<ChatSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...parcial };
    for (const l of this.listeners) l();
  }

  private setThread(update: (t: ChatThreadState) => ChatThreadState): void {
    this.set({ thread: update(this.snapshot.thread) });
  }

  /**
   * Abre uma conversa. A mesma que já está aberta não recarrega — é o que deixa
   * a resposta seguir chegando quando a pessoa volta à tela. Outra conversa
   * desliga a assinatura da anterior (no servidor ela continua, ADR 035).
   */
  async open(conversationId: string): Promise<void> {
    if (this.snapshot.conversationId === conversationId) return;
    this.detach();
    this.set({ ...VAZIO, conversationId, loading: true });
    try {
      const conversa = await getConversation(conversationId);
      if (this.snapshot.conversationId !== conversationId) return;
      this.set({
        thread: threadFromHistory(conversa.messages),
        agent: conversa.agent ?? null,
        isNew: false,
        loading: false,
      });
      if (conversa.running) void this.follow(joinChatRun(conversationId, this.signal()));
    } catch (erro) {
      if (this.snapshot.conversationId !== conversationId) return;
      // Conversa que ainda não existe no servidor é a nova, e não erro.
      if (erro instanceof ApiError && erro.isNotFound) this.set({ loading: false, isNew: true });
      else this.set({ loading: false, loadError: erro });
    }
  }

  /** Uma conversa nova, com id gerado aqui: é com ele que ela nasce no servidor. */
  startNew(): string {
    this.detach();
    const id = this.newId();
    this.set({ ...VAZIO, conversationId: id });
    return id;
  }

  /** Recarrega do servidor a conversa aberta (puxar para atualizar, erro de carga). */
  async reload(): Promise<void> {
    const id = this.snapshot.conversationId;
    if (!id) return;
    this.set({ conversationId: null });
    await this.open(id);
  }

  async send(input: {
    text: string;
    photos?: ChatPhoto[];
    /** Só na conversa nova: `undefined` é o padrão, `null` o assistente da Fatia. */
    agentGroupId?: string | null;
  }): Promise<void> {
    const conversationId = this.snapshot.conversationId;
    if (!conversationId || this.snapshot.thread.running) return;
    const fotos = input.photos ?? [];
    const texto = input.text.trim() || (fotos.length ? PHOTO_ONLY_QUESTION : '');
    if (!texto) return;
    this.setThread((t) =>
      appendUserMessage(t, { id: `local-${this.newId()}`, text: texto, photos: fotos.length }),
    );
    const novo = this.snapshot.isNew;
    this.set({ isNew: false });
    await this.follow(
      streamChat(
        {
          conversationId,
          message: texto,
          ...(fotos.length ? { photos: fotos } : {}),
          ...(novo && input.agentGroupId !== undefined ? { agentGroupId: input.agentGroupId } : {}),
        },
        this.signal(),
      ),
    );
  }

  /** A resposta a uma pausa: o `id` dela prova a qual pausa a resposta responde. */
  async resume(value: ChatResumeValue): Promise<void> {
    const conversationId = this.snapshot.conversationId;
    const pausa = this.snapshot.thread.interrupt;
    if (!conversationId || !pausa || this.snapshot.thread.running) return;
    this.setThread((t) => ({ ...t, interrupt: null, running: true, error: null }));
    await this.follow(
      streamChat({ conversationId, resume: { interruptId: pausa.id, value } }, this.signal()),
    );
  }

  /** Parar é no servidor; a conexão daqui fecha junto. */
  async stop(): Promise<void> {
    const conversationId = this.snapshot.conversationId;
    if (!conversationId || !this.snapshot.thread.running) return;
    this.detach();
    this.setThread((t) => applyChatFrame(t, { event: 'done', data: { status: 'stopped' } }));
    try {
      await stopChatRun(conversationId);
    } catch {
      // Sem rede: o servidor termina a resposta, e ela aparece ao reabrir.
    }
  }

  /**
   * O app voltou do segundo plano. O sistema pode ter congelado a conexão sem
   * avisar ninguém; se uma resposta estava chegando, troca a conexão por uma
   * nova a partir do último evento recebido.
   */
  reconnect(): void {
    const conversationId = this.snapshot.conversationId;
    if (!conversationId || !this.snapshot.thread.running) return;
    this.detach();
    void this.follow(
      joinChatRun(conversationId, { ...this.signal(), after: this.snapshot.thread.lastSeq }),
    );
  }

  /** O 👍/👎 vai para a linha do banco da resposta. */
  async vote(rowId: string, review: 'like' | 'dislike'): Promise<void> {
    const conversationId = this.snapshot.conversationId;
    if (!conversationId) return;
    this.setThread((t) => ({
      ...t,
      messages: t.messages.map((m) =>
        m.role === 'assistant' && m.rowId === rowId ? { ...m, review } : m,
      ),
    }));
    await sendChatFeedback(conversationId, rowId, { review });
  }

  private signal(): { signal: AbortSignal } {
    this.controller = new AbortController();
    return { signal: this.controller.signal };
  }

  private detach(): void {
    this.controller?.abort();
    this.controller = null;
  }

  private async follow(frames: AsyncGenerator<ChatStreamFrame>): Promise<void> {
    const conversationId = this.snapshot.conversationId;
    const controller = this.controller;
    let recebeu = false;
    try {
      for await (const frame of frames) {
        // Trocou de conversa (ou reconectou) no meio: este fio não é mais o dela.
        if (this.snapshot.conversationId !== conversationId || this.controller !== controller) {
          return;
        }
        recebeu = true;
        this.setThread((t) => applyChatFrame(t, frame));
      }
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        // O fio acabou sem `done` (reconexão que achou o turno já encerrado):
        // a tela não pode ficar "respondendo" para sempre.
        if (this.snapshot.thread.running && this.snapshot.conversationId === conversationId) {
          if (!recebeu) void this.reload();
          else this.setThread((t) => ({ ...t, running: false }));
        }
        this.onTurnEnd?.();
      }
    }
  }
}
