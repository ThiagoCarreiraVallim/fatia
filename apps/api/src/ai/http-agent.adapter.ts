import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  type HttpException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentAdapter,
  AgentStreamError,
  type AgentCapabilities,
  type AgentMealRecognition,
  type AgentRecognizedItem,
  type AgentStream,
  type AgentTitle,
  type AgentTranscription,
  type AgentUsage,
  type TurnInput,
} from './agent.adapter';

/**
 * O único cliente HTTP do `apps/agent` (#249, #139, #141).
 *
 * Antes eram dois: o do chat e o `fetch` próprio do reconhecimento por foto, cada
 * um com a sua base, o seu header, a sua tradução de erro e o seu `/capabilities`.
 * A correção de socket caído (uma nova tentativa quando a conexão do pool morreu
 * antes da resposta) chegou só ao do chat. Aqui ela vale para toda chamada.
 *
 * ## O contrato do `/chat`
 *
 * ```json
 * { "conversationId": "…", "timezone": "America/Sao_Paulo",
 *   "history": [{ "role": "user" | "assistant", "content": "..." }],
 *   "memories": [{ "id": "…", "content": "..." }],
 *   "message": "o que eu comi ontem?",
 *   "photos": [{ "mediaType": "image/jpeg", "data": "<base64 sem EXIF>" }] }
 * ```
 *
 * ou `"resume": { "interruptId": "…", "value": … }` no lugar de `message` e
 * `photos`. O agente declara `extra: "forbid"`: campo a mais aqui vira 422 lá, e
 * foi exatamente assim que todo turno já voltou recusado (#249).
 *
 * O que volta é `text/event-stream` no vocabulário nativo do LangGraph, mais os
 * eventos próprios (`usage`, `plan`, `artifact`, `error`, `done`…). O contrato
 * completo está em `apps/agent/.../chat/events.py`.
 *
 * ## O Bearer
 *
 * O `/chat` é a única chamada que manda o **token do usuário** ao agente (ADR
 * 021): é com ele que o agente chama o `/mcp`. Foto, título e ditado vão sem
 * identidade nenhuma. Por isso **nenhum log deste arquivo carrega header, corpo
 * ou resposta** — só status, `code` e nome do erro. Há teste fixando.
 */

/**
 * Quanto tempo esperar **o primeiro byte** do chat. Um chat com tool call pensa
 * antes de falar, e a inferência local da casa já passou de 100 s numa tarefa de
 * visão.
 */
const OPEN_TIMEOUT_MS = 120_000;

/**
 * Silêncio tolerado **entre pedaços**, depois que o stream começou.
 *
 * Ociosidade, e não duração total: um teto de duração cortaria a resposta longa
 * que está chegando normalmente — que é justamente a que mais custou.
 */
const IDLE_TIMEOUT_MS = 90_000;

/** O título não segura nada: quem espera é uma linha da lista de conversas. */
const TITLE_TIMEOUT_MS = 20_000;

/** O voto é espelho; ninguém espera por ele. */
const FEEDBACK_TIMEOUT_MS = 5_000;

/** Ditado curto; quem espera é a pessoa olhando para o campo de mensagem. */
const TRANSCRIPTION_TIMEOUT_MS = 60_000;

/**
 * Visão em CPU local leva de 20 a 60 s, e o gemma local já passou de 100 s com
 * uma foto de 342×268. Um timeout curto aqui vira "a IA falhou" com a inferência
 * paga do mesmo jeito. Sobrescrito por `AGENT_TIMEOUT_MS`.
 */
const PHOTO_TIMEOUT_MS = 180_000;

const CAPABILITIES_TIMEOUT_MS = 3_000;
/** O agente só muda de capacidade num restart; perguntar a cada tela seria ruído. */
const CAPABILITIES_TTL_MS = 60_000;

/** As funções que falham para a pessoa, cada uma com o seu sujeito e a sua saída. */
type Feature = 'chat' | 'photo' | 'dictation';

const FEATURE_TEXT: Record<Feature, { subject: string; fallback: string }> = {
  chat: {
    subject: 'O chat com IA',
    fallback: 'O resto do app continua funcionando — o registro manual não depende de IA.',
  },
  photo: {
    subject: 'O reconhecimento por foto',
    fallback: 'Registre a refeição manualmente enquanto isso.',
  },
  dictation: { subject: 'O ditado', fallback: 'Digite a mensagem enquanto isso.' },
};

/**
 * Recusas de formato que o agente devolve só com status (`HTTPException` do
 * FastAPI, sem `code`): dizem o que a pessoa pode corrigir.
 */
const FORMAT_ERRORS: Partial<Record<Feature, Record<number, () => HttpException>>> = {
  dictation: {
    400: () => new BadRequestException('O áudio veio vazio.'),
    413: () => new PayloadTooLargeException('O áudio é longo demais. Grave um trecho mais curto.'),
    415: () => new UnsupportedMediaTypeException('Este formato de áudio não é aceito.'),
  },
  photo: {
    400: () => new BadRequestException('A imagem não pôde ser lida.'),
    413: () => new PayloadTooLargeException('A foto é grande demais. Reduza a resolução.'),
    415: () => new UnsupportedMediaTypeException('Este formato de imagem não é aceito.'),
  },
};

/**
 * `code` do agente → exceção do Nest. **Pelo `code`, nunca pela prosa**: o
 * código é contrato estável do `apps/agent`; a mensagem em português muda numa
 * revisão de texto.
 */
const BY_CODE: Record<string, (feature: Feature) => HttpException> = {
  // O 401 do `/mcp` é o token **da pessoa** (expirou): 401 aqui também, que é o
  // que faz o cliente renovar a sessão. O da chave compartilhada (abaixo, por
  // status) é configuração **nossa**: 503.
  MCP_UNAUTHENTICATED: () => sessionExpired(),
  MCP_UNAUTHORIZED: () => sessionExpired(),
  // A pausa que o cliente tentou responder não é a que a conversa espera — outra
  // aba respondeu antes, ou a página ficou aberta sobre um estado velho.
  CHAT_RESUME_MISMATCH: () => staleResume('CHAT_RESUME_MISMATCH'),
  CHAT_NOTHING_TO_RESUME: () => staleResume('CHAT_NOTHING_TO_RESUME'),
  AI_PROVIDER_NOT_CONFIGURED: (f) =>
    new ServiceUnavailableException(
      `${FEATURE_TEXT[f].subject} não está configurado nesta instância. ${FEATURE_TEXT[f].fallback}`,
    ),
  AI_PROVIDER_TIMEOUT: (f) =>
    new GatewayTimeoutException(
      `O modelo não respondeu a tempo. Tente de novo. ${FEATURE_TEXT[f].fallback}`,
    ),
  AI_RESPONSE_UNPARSEABLE: (f) => unparseable(f),
  AI_RESPONSE_TRUNCATED: (f) => unparseable(f),
};

function sessionExpired(): HttpException {
  return new UnauthorizedException({
    code: 'AI_UNAUTHORIZED',
    message: 'Sua sessão expirou. Entre de novo para continuar a conversa.',
  });
}

function staleResume(code: string): HttpException {
  return new ConflictException({
    code,
    message:
      'Esta conversa mudou desde que a pergunta apareceu. Recarregue a conversa para ver ' +
      'o que ela espera agora.',
  });
}

function unparseable(feature: Feature): HttpException {
  return new BadGatewayException(
    `Não consegui entender o que o modelo devolveu. ${FEATURE_TEXT[feature].fallback}`,
  );
}

@Injectable()
export class HttpAgentAdapter extends AgentAdapter {
  private readonly logger = new Logger(HttpAgentAdapter.name);

  private cachedCapabilities: { value: AgentCapabilities; until: number } | null = null;

  constructor(private readonly config: ConfigService) {
    super();
  }

  configured(): boolean {
    return this.base() !== null;
  }

  async capabilities(now = Date.now()): Promise<AgentCapabilities> {
    if (this.cachedCapabilities && this.cachedCapabilities.until > now) {
      return this.cachedCapabilities.value;
    }
    const base = this.base();
    let value: AgentCapabilities = { vision: false, transcription: false };
    if (base) {
      try {
        const http = await fetch(`${base}/capabilities`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(CAPABILITIES_TIMEOUT_MS),
        });
        if (http.ok) {
          const body = (await http.json()) as {
            capabilities?: { vision?: unknown; transcription?: unknown };
          };
          // Não basta o agente estar no ar: sem `AI_MODEL_VISION` ele sobe
          // saudável e recusa toda inferência. Mostrar o botão nesse estado leva a
          // pessoa a tirar uma foto para receber um erro.
          const usable = (model: unknown) => typeof model === 'string' && model.length > 0;
          value = {
            vision: usable(body.capabilities?.vision),
            transcription: usable(body.capabilities?.transcription),
          };
        }
      } catch (error) {
        this.logger.warn(`Capacidades do agente indisponíveis: ${(error as Error).name}`);
      }
    }
    this.cachedCapabilities = { value, until: now + CAPABILITIES_TTL_MS };
    return value;
  }

  async openTurn(input: TurnInput): Promise<AgentStream> {
    const base = this.requireBase('chat');
    const aborter = new AbortController();
    const openTimer = setTimeout(() => aborter.abort(), OPEN_TIMEOUT_MS);
    const body = JSON.stringify({
      conversationId: input.conversationId,
      timezone: input.timezone,
      history: input.history.map((m) => ({ role: m.role, content: m.content })),
      memories: input.memories ?? [],
      ...(input.persona ? { persona: input.persona } : {}),
      ...(input.resume
        ? { resume: input.resume }
        : {
            message: input.message,
            ...(input.photos?.length ? { photos: input.photos } : {}),
          }),
    });

    let http: Response;
    try {
      http = await this.send('chat', `${base}/chat`, {
        method: 'POST',
        headers: {
          ...this.keyHeader(),
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          // O Bearer do usuário, intacto. É com ele que o agente chama o `/mcp`.
          Authorization: `Bearer ${input.bearer}`,
        },
        body,
        signal: aborter.signal,
      });
    } finally {
      clearTimeout(openTimer);
    }
    if (!http.body) {
      throw new BadGatewayException('O chat com IA devolveu uma resposta vazia.');
    }
    return this.wrap(http.body, aborter);
  }

  async transcribe(audio: Buffer, contentType: string): Promise<AgentTranscription> {
    const base = this.requireBase('dictation');
    const http = await this.send('dictation', `${base}/transcribe`, {
      method: 'POST',
      headers: { ...this.keyHeader(), 'Content-Type': contentType },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
    });
    const body = (await http.json()) as { text?: unknown; usage?: unknown };
    return {
      text: typeof body.text === 'string' ? body.text : '',
      usage: readUsage(body.usage),
    };
  }

  async title(text: string): Promise<AgentTitle | null> {
    const base = this.base();
    if (!base) return null;
    try {
      const http = await this.send('chat', `${base}/title`, {
        method: 'POST',
        headers: { ...this.keyHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
      });
      const body = (await http.json()) as { title?: unknown; usage?: unknown };
      return {
        title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null,
        usage: readUsage(body.usage),
      };
    } catch (error) {
      this.logger.warn(`Título de conversa não gerado: ${(error as Error).name}`);
      return null;
    }
  }

  async recognizeMeal(jpeg: Buffer): Promise<AgentMealRecognition> {
    const base = this.requireBase('photo');
    const timeout = Number(this.config.get<string>('AGENT_TIMEOUT_MS', '')) || PHOTO_TIMEOUT_MS;
    const http = await this.send('photo', `${base}/recognize-meal`, {
      method: 'POST',
      headers: {
        ...this.keyHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // Só a foto e o formato. **Nada do usuário viaja** — nem id, nem token,
      // nem o dia da refeição. Há teste fixando isso.
      body: JSON.stringify({ image_base64: jpeg.toString('base64'), media_type: 'image/jpeg' }),
      signal: AbortSignal.timeout(timeout),
    });

    const body = (await http.json().catch(() => null)) as {
      items?: unknown;
      note?: unknown;
      usage?: unknown;
    } | null;
    if (!Array.isArray(body?.items)) {
      throw new BadGatewayException(
        `O reconhecimento devolveu uma resposta inesperada. ${FEATURE_TEXT.photo.fallback}`,
      );
    }
    return {
      items: body.items as AgentRecognizedItem[],
      note: typeof body.note === 'string' ? body.note : null,
      usage: readUsage(body.usage),
    };
  }

  async sendFeedback(
    runId: string,
    review: 'like' | 'dislike' | null,
    reasons: string[],
  ): Promise<void> {
    const base = this.base();
    if (!base) return;
    try {
      await this.send('chat', `${base}/feedback`, {
        method: 'POST',
        headers: { ...this.keyHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, review, reasons }),
        signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`Voto no Langfuse não enviado: ${(error as Error).name}`);
    }
  }

  /**
   * O `fetch`, com **uma** nova tentativa quando o socket caiu antes de qualquer
   * cabeçalho — o agente reiniciando (recusa) ou uma conexão do pool que o outro
   * lado fechou por ociosidade. Nos dois casos a chamada não começou lá, e
   * repetir não paga inferência duas vezes.
   *
   * Falha de rede e status ruim saem já traduzidos para exceção do Nest.
   */
  private async send(feature: Feature, url: string, init: RequestInit): Promise<Response> {
    let http: Response;
    try {
      try {
        http = await fetch(url, init);
      } catch (error) {
        if (!isSocketFailure(error)) throw error;
        this.logger.warn('Conexão com o agente caiu antes da resposta; nova tentativa.');
        http = await fetch(url, init);
      }
    } catch (error) {
      const cause = error as Error;
      // Só o nome do erro. Nada do corpo: é o que a pessoa escreveu ou fotografou.
      this.logger.warn(`Agente inacessível: ${cause.name}`);
      const text = FEATURE_TEXT[feature];
      if (cause.name === 'TimeoutError' || cause.name === 'AbortError') {
        throw new GatewayTimeoutException(
          `${text.subject} demorou demais para responder. Tente de novo.`,
        );
      }
      throw new ServiceUnavailableException(
        `${text.subject} está fora do ar no momento. ${text.fallback}`,
      );
    }
    if (!http.ok) throw await this.translateError(feature, http);
    return http;
  }

  private async translateError(feature: Feature, http: Response): Promise<HttpException> {
    const body = (await http.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    const code = body?.error?.code ?? '';
    this.logger.warn(`Agente respondeu ${http.status} (${code || 'sem code'})`);

    const byCode = BY_CODE[code];
    if (byCode) return byCode(feature);
    // 401/403 sem o `code` do `/mcp` é a chave compartilhada (`AGENT_KEY_REJECTED`
    // ou a camada de credencial antes do handler): configuração **nossa**. Caindo
    // no genérico, virava "o modelo falhou" e mandava quem opera procurar no lugar
    // errado. Os dois lados precisam concordar sobre `AGENT_API_KEY`.
    if (http.status === 401 || http.status === 403) {
      return new ServiceUnavailableException(
        `${FEATURE_TEXT[feature].subject} está mal configurado nesta instância: a API não ` +
          `conseguiu se autenticar no agente. ${FEATURE_TEXT[feature].fallback}`,
      );
    }
    const format = FORMAT_ERRORS[feature]?.[http.status];
    if (format) return format();
    return new BadGatewayException(
      `${FEATURE_TEXT[feature].subject} falhou. Tente de novo em instantes. ` +
        FEATURE_TEXT[feature].fallback,
    );
  }

  /**
   * Empacota o corpo num gerador com relógio de ociosidade próprio.
   *
   * O `AbortController` é o **mesmo** do `fetch`: abortá-lo mata a conexão TCP
   * com o agente, e não só a leitura deste lado.
   */
  private wrap(body: ReadableStream<Uint8Array>, aborter: AbortController): AgentStream {
    const logger = this.logger;
    return {
      cancel: () => aborter.abort(),
      async *chunks() {
        const reader = body.getReader();
        let idle = setTimeout(() => aborter.abort(), IDLE_TIMEOUT_MS);
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            clearTimeout(idle);
            idle = setTimeout(() => aborter.abort(), IDLE_TIMEOUT_MS);
            if (value) yield value;
          }
        } catch (error) {
          logger.warn(`Stream do agente de chat interrompido: ${(error as Error).name}`);
          throw new AgentStreamError(
            'AGENT_STREAM_INTERRUPTED',
            'A resposta foi interrompida antes de terminar. Tente enviar de novo.',
          );
        } finally {
          clearTimeout(idle);
          // `cancel` e não `releaseLock`: o objetivo é soltar a conexão, e um
          // leitor liberado sobre um corpo pela metade mantém o socket aberto.
          await reader.cancel().catch(() => undefined);
        }
      },
    };
  }

  private base(): string | null {
    const raw = this.config.get<string>('AGENT_BASE_URL', '').trim();
    return raw ? raw.replace(/\/+$/, '') : null;
  }

  private requireBase(feature: Feature): string {
    const base = this.base();
    if (!base) {
      throw new ServiceUnavailableException(
        `${FEATURE_TEXT[feature].subject} não está configurado nesta instância. ` +
          FEATURE_TEXT[feature].fallback,
      );
    }
    return base;
  }

  private keyHeader(): Record<string, string> {
    const key = this.config.get<string>('AGENT_API_KEY', '').trim();
    return key ? { 'X-Fatia-Agent-Key': key } : {};
  }
}

/**
 * O `usage` das rotas auxiliares (`/title`, `/transcribe`, `/recognize-meal`).
 *
 * Sem `model`, é `null`: custo não medido. Unidade que não é número fica
 * `undefined`, e não `0` — ausência e zero são coisas diferentes na cota.
 */
function readUsage(raw: unknown): AgentUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const usage = raw as { model?: unknown; inputUnits?: unknown; outputUnits?: unknown };
  if (typeof usage.model !== 'string' || !usage.model) return null;
  return {
    model: usage.model,
    ...(typeof usage.inputUnits === 'number' ? { inputUnits: usage.inputUnits } : {}),
    ...(typeof usage.outputUnits === 'number' ? { outputUnits: usage.outputUnits } : {}),
  };
}

/** Códigos de socket do undici/Node que significam "nada chegou do outro lado". */
const SOCKET_FAILURES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
]);

/**
 * O `fetch` do Node lança `TypeError('fetch failed')` com o motivo em `cause`.
 * Timeout e abort ficam de fora: já gastaram o relógio.
 */
export function isSocketFailure(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === 'TimeoutError' || error.name === 'AbortError') {
    return false;
  }
  const cause = (error as { cause?: { code?: unknown; message?: unknown } }).cause;
  if (cause && typeof cause.code === 'string' && SOCKET_FAILURES.has(cause.code)) return true;
  return typeof cause?.message === 'string' && cause.message.includes('other side closed');
}
