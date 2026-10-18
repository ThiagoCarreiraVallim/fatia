import { ConflictException, Injectable, OnModuleDestroy } from '@nestjs/common';

/**
 * As respostas do chat em andamento, desacopladas da requisição que as pediu (ADR 035).
 *
 * Antes, a resposta vivia dentro do `POST /chat`: fechar a aba, trocar de tela
 * no app ou a rede piscar cortava o agente, e o turno ficava `stopped` pela
 * metade. Agora o turno corre até o fim do lado do servidor e publica cada
 * evento SSE aqui, numerado. A requisição que o abriu é só a **primeira
 * assinante**; quem volta (F5, outra aba, o app saindo do segundo plano) assina
 * de novo por `GET /chat/conversations/:id/live`, a partir do último número que
 * recebeu, e não perde nada.
 *
 * Parar é explícito (`POST …/stop`), não mais "fechar a conexão".
 *
 * **Memória do processo, uma instância só.** É o que a API roda hoje. Com mais
 * de uma réplica, a reconexão pode cair noutra e responder 204; a troca é por um
 * Redis Stream por turno, sem mudar o protocolo.
 */

/** Um evento SSE completo, já com o terminador `\n\n`. */
export interface ChatRunFrame {
  seq: number;
  text: string;
}

/** Para onde vão os quadros de uma assinatura. */
export interface ChatRunSink {
  write(text: string): void;
  end(): void;
}

/** O teto do que fica guardado para reenvio; acima disso, os mais antigos saem. */
export const RUN_BUFFER_BYTES = 8 * 1024 * 1024;
/** Quanto tempo o turno terminado continua disponível para quem chega atrasado. */
export const RUN_RETENTION_MS = 60_000;
/** Comentário SSE periódico: proxies cortam conexão parada (Traefik, Cloudflare). */
export const HEARTBEAT_MS = 15_000;

export class ChatRun {
  private readonly frames: ChatRunFrame[] = [];
  private readonly sinks = new Set<ChatRunSink>();
  private bytes = 0;
  private seq = 0;
  private finished = false;
  private stopped = false;
  private cancelUpstream: (() => void) | null = null;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(
    readonly userId: string,
    readonly conversationId: string,
  ) {}

  /** Comentário SSE periódico para quem assina; não é guardado nem numerado. */
  startHeartbeat(everyMs: number): void {
    this.heartbeat = setInterval(() => {
      for (const sink of this.sinks) sink.write(': ping\n\n');
    }, everyMs);
    this.heartbeat.unref?.();
  }

  get done(): boolean {
    return this.finished;
  }

  /** O número do último evento publicado. */
  get lastSeq(): number {
    return this.seq;
  }

  /** A pessoa pediu para parar (botão), e não "a conexão caiu". */
  get stopRequested(): boolean {
    return this.stopped;
  }

  /** O que corta o agente. Se o pedido de parar chegou antes, corta na hora. */
  bindUpstream(cancel: () => void): void {
    this.cancelUpstream = cancel;
    if (this.stopped) cancel();
  }

  stop(): void {
    if (this.finished) return;
    this.stopped = true;
    this.cancelUpstream?.();
  }

  /** Numera, guarda e entrega um evento SSE completo a quem estiver assinando. */
  publish(block: string): void {
    if (this.finished) return;
    const seq = ++this.seq;
    const text = block.startsWith(':') ? block : `id: ${seq}\n${block}`;
    this.frames.push({ seq, text });
    this.bytes += text.length;
    while (this.bytes > RUN_BUFFER_BYTES && this.frames.length > 1) {
      this.bytes -= this.frames.shift()!.text.length;
    }
    for (const sink of this.sinks) sink.write(text);
  }

  /**
   * Reenvia o que veio depois de `after` e segue ao vivo; termina junto com o
   * turno. Devolve como sair da assinatura (sair **não** para o turno).
   */
  subscribe(after: number, sink: ChatRunSink): () => void {
    for (const frame of this.frames) if (frame.seq > after) sink.write(frame.text);
    if (this.finished) {
      sink.end();
      return () => undefined;
    }
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const sink of this.sinks) sink.end();
    this.sinks.clear();
  }
}

@Injectable()
export class ChatRunRegistry implements OnModuleDestroy {
  private readonly runs = new Map<string, ChatRun>();
  private readonly timers = new Set<NodeJS.Timeout>();

  /** 409 quando a conversa já está respondendo: dois turnos na mesma thread se atropelam. */
  assertIdle(conversationId: string): void {
    const atual = this.runs.get(conversationId);
    if (atual && !atual.done) {
      throw new ConflictException({
        code: 'CHAT_RUN_IN_PROGRESS',
        message: 'Esta conversa ainda está respondendo. Espere terminar ou pare a resposta.',
      });
    }
  }

  start(userId: string, conversationId: string): ChatRun {
    this.assertIdle(conversationId);
    const run = new ChatRun(userId, conversationId);
    run.startHeartbeat(HEARTBEAT_MS);
    this.runs.set(conversationId, run);
    return run;
  }

  /** O turno que falhou antes do primeiro byte: some sem deixar rastro. */
  discard(run: ChatRun): void {
    run.finish();
    if (this.runs.get(run.conversationId) === run) this.runs.delete(run.conversationId);
  }

  /** Encerra e mantém por `RUN_RETENTION_MS` para quem reconecta logo depois. */
  finish(run: ChatRun): void {
    run.finish();
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.runs.get(run.conversationId) === run) this.runs.delete(run.conversationId);
    }, RUN_RETENTION_MS);
    timer.unref?.();
    this.timers.add(timer);
  }

  /** O turno desta conversa, **só para a dona dela**. */
  find(userId: string, conversationId: string): ChatRun | null {
    const run = this.runs.get(conversationId);
    return run && run.userId === userId ? run : null;
  }

  isRunning(userId: string, conversationId: string): boolean {
    const run = this.find(userId, conversationId);
    return run !== null && !run.done;
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}

/**
 * Corta os bytes do agente em eventos SSE completos.
 *
 * O reenvio é por número de evento; se um evento ficasse dividido entre dois
 * números, quem reconectasse no meio receberia meio evento, e o leitor dele
 * (que começa do zero na conexão nova) o descartaria.
 */
export function createSseFramer(): {
  push(chunk: Uint8Array | string): string[];
  flush(): string[];
} {
  const decoder = new TextDecoder();
  let buffer = '';
  const drain = (): string[] => {
    const blocks: string[] = [];
    buffer = buffer.replace(/\r\n/g, '\n');
    for (let fim = buffer.indexOf('\n\n'); fim !== -1; fim = buffer.indexOf('\n\n')) {
      blocks.push(buffer.slice(0, fim + 2));
      buffer = buffer.slice(fim + 2);
    }
    return blocks;
  };
  return {
    push(chunk) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      return drain();
    },
    flush() {
      buffer += decoder.decode();
      const blocks = drain();
      if (buffer.trim()) blocks.push(`${buffer}\n\n`);
      buffer = '';
      return blocks;
    },
  };
}
