import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MensagemDoHistorico } from './conversation.service';

/**
 * Cliente do `apps/agent` para o chat, do lado do NestJS (#249, ADR 023).
 *
 * ## O contrato
 *
 * O que vai no `POST /chat` — um turno novo **ou** a resposta a uma pausa:
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
 * **A mensagem de agora vai separada do histórico** porque as regras de tamanho
 * são opostas: a de agora é recusada acima de 4 000 caracteres (a pessoa está
 * olhando para o campo), a do histórico é **cortada** em silêncio — recusá-la
 * mataria a conversa por uma resposta longa do próprio modelo.
 *
 * O histórico só é lido pelo agente numa thread fria; numa quente, o estado no
 * checkpointer é a verdade (ADR 023). As fotos vivem só naquele turno.
 *
 * O que volta é `text/event-stream` no vocabulário nativo do LangGraph —
 * `messages`, `updates`, `messages/complete` — mais os eventos próprios
 * (`start`, `catalog`, `usage`, `plan`, `artifact`, `context`, `validation`,
 * `error`, `done`). O contrato completo está em `apps/agent/.../chat/events.py`.
 * Esta camada **repassa os bytes e observa** (`leitor-do-turno.ts`): grava o
 * que a tela mostra depois de um F5 e soma o `usage` da cota da #135.
 *
 * ## O Bearer
 *
 * Esta é a única chamada do produto que manda o **token do usuário** para o
 * agente, e a inversão está registrada na épica #247: é assim que o agente
 * alcança dado pelo `/mcp` com a identidade de quem está agindo, mantendo o
 * isolamento com um dono só. A consequência é que o token passa por aqui — e por
 * isso **nenhum log deste arquivo carrega o header, o corpo ou a resposta.**
 * Todas as mensagens de log abaixo são status e nome de erro. Há teste fixando.
 */

/** Erro depois que o cabeçalho já foi para o cliente — não vira mais status HTTP. */
export class ErroDeStreamDoAgente extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ErroDeStreamDoAgente';
  }
}

export interface StreamDoAgente {
  /** Os bytes crus do agente, na ordem em que chegam. */
  pedacos(): AsyncGenerator<Uint8Array>;
  /** Corta o upstream. Chamado quando o cliente vai embora — inferência custa. */
  cancelar(): void;
}

export type EntradaDoTurno = {
  bearer: string;
  /** O fuso do perfil. Vira a data de hoje no prompt do agente. */
  timezone: string;
  /** A conversa. O agente monta a thread com ela e com o dono que o token diz. */
  conversationId: string;
  /** O que já foi dito, em ordem cronológica. O agente só lê numa thread fria. */
  historico: MensagemDoHistorico[];
  /** O que a pessoa pediu para o assistente lembrar. Entra cercado no prompt. */
  memorias?: { id: string; content: string }[];
} & (
  | {
      mensagem: string;
      retomada?: undefined;
      /** Já sem metadados — ver `ChatService.fotosDoTurno`. */
      fotos?: { mediaType: 'image/jpeg'; data: string }[];
    }
  | {
      mensagem?: undefined;
      /**
       * A resposta a uma pausa, repassada **sem interpretação**: esta camada não
       * sabe o que `log_meal` faz nem tem por que saber. Quem confere a pausa e
       * executa o que foi aprovado é o agente (ADR 023).
       */
      retomada: { interruptId: string; value: unknown };
    }
);

/**
 * Quanto tempo esperar **o primeiro byte**. Um chat com tool call pensa antes de
 * falar, e a inferência local da casa já passou de 100 s numa tarefa de visão.
 */
const TIMEOUT_DE_ABERTURA_MS = 120_000;

/**
 * Silêncio tolerado **entre pedaços**, depois que o stream começou.
 *
 * Ociosidade, e não duração total: um teto de duração cortaria a resposta longa
 * que está chegando normalmente — que é justamente a que mais custou. O que
 * precisa morrer é a conexão que parou de falar, e é ela que este relógio pega.
 */
const TIMEOUT_DE_OCIOSIDADE_MS = 90_000;

/** O título não segura nada: quem espera é uma linha da lista de conversas. */
const TIMEOUT_DO_TITULO_MS = 20_000;

/** Ditado curto; quem espera é a pessoa olhando para o campo de mensagem. */
const TIMEOUT_DA_TRANSCRICAO_MS = 60_000;

const TIMEOUT_DAS_CAPACIDADES_MS = 3_000;
/** O agente só muda de capacidade num restart; perguntar a cada tela seria ruído. */
const VALIDADE_DAS_CAPACIDADES_MS = 60_000;

/** O que o chat desta instância sabe fazer além de texto. */
export type CapacidadesDoChat = { fotos: boolean; ditado: boolean };

export type TranscricaoDoAgente = {
  texto: string;
  /** Segundos de áudio. `undefined` quando o provedor não mediu. */
  uso: { model: string; inputUnits?: number };
};

export type TituloDoAgente = {
  titulo: string | null;
  /** `null` quando o agente não mediu — vira custo não medido no livro-caixa. */
  uso: { model: string; inputUnits?: number; outputUnits?: number } | null;
};

@Injectable()
export class AgentChatClient {
  private readonly logger = new Logger(AgentChatClient.name);

  private capacidadesEmCache: { valor: CapacidadesDoChat; ate: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  /** `true` quando esta instância tem agente configurado para conversar. */
  configurado(): boolean {
    return this.base() !== null;
  }

  /**
   * Foto e ditado, pelo que o `/capabilities` do agente anuncia como usável.
   *
   * O agente sobe saudável sem `AI_MODEL_VISION` ou `AI_MODEL_TRANSCRIPTION` e
   * recusa a chamada — mostrar o botão nesse estado seria pedir uma foto para
   * devolver um erro. **Nunca lança:** agente fora do ar é "sem foto e sem voz".
   */
  async capacidades(agora = Date.now()): Promise<CapacidadesDoChat> {
    if (this.capacidadesEmCache && this.capacidadesEmCache.ate > agora) {
      return this.capacidadesEmCache.valor;
    }
    const base = this.base();
    let valor: CapacidadesDoChat = { fotos: false, ditado: false };
    if (base) {
      try {
        const http = await fetch(`${base}/capabilities`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_DAS_CAPACIDADES_MS),
        });
        if (http.ok) {
          const corpo = (await http.json()) as {
            capabilities?: { vision?: unknown; transcription?: unknown };
          };
          const usavel = (modelo: unknown) => typeof modelo === 'string' && modelo.length > 0;
          valor = {
            fotos: usavel(corpo.capabilities?.vision),
            ditado: usavel(corpo.capabilities?.transcription),
          };
        }
      } catch (erro) {
        this.logger.warn(`Capacidades do agente indisponíveis: ${(erro as Error).name}`);
      }
    }
    this.capacidadesEmCache = { valor, ate: agora + VALIDADE_DAS_CAPACIDADES_MS };
    return valor;
  }

  /**
   * Áudio → texto (#141). Sem Bearer, como o título: transcrever não alcança
   * dado nenhum. O áudio não é logado, gravado nem guardado (ADR 020).
   */
  async transcrever(audio: Buffer, contentType: string): Promise<TranscricaoDoAgente> {
    const base = this.base();
    if (!base) {
      throw new ServiceUnavailableException('O ditado não está configurado nesta instância.');
    }
    const chave = this.config.get<string>('AGENT_API_KEY', '').trim();
    let http: Response;
    try {
      http = await fetch(`${base}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          ...(chave ? { 'X-Fatia-Agent-Key': chave } : {}),
        },
        body: new Uint8Array(audio),
        signal: AbortSignal.timeout(TIMEOUT_DA_TRANSCRICAO_MS),
      });
    } catch (erro) {
      const causa = erro as Error;
      this.logger.warn(`Transcrição inacessível: ${causa.name}`);
      if (causa.name === 'TimeoutError' || causa.name === 'AbortError') {
        throw new GatewayTimeoutException('A transcrição demorou demais. Tente de novo.');
      }
      throw new ServiceUnavailableException('O ditado está fora do ar no momento.');
    }

    // Os 4xx do próprio `/transcribe` dizem o que a pessoa pode corrigir; o
    // resto é o mesmo vocabulário do chat.
    if (http.status === 400) throw new BadRequestException('O áudio veio vazio.');
    if (http.status === 413) {
      throw new PayloadTooLargeException('O áudio é longo demais. Grave um trecho mais curto.');
    }
    if (http.status === 415) {
      throw new UnsupportedMediaTypeException('Este formato de áudio não é aceito.');
    }
    if (!http.ok) throw await this.traduzirErro(http);

    const corpo = (await http.json()) as {
      text?: unknown;
      usage?: { model?: unknown; inputUnits?: unknown };
    };
    return {
      texto: typeof corpo.text === 'string' ? corpo.text : '',
      uso: {
        model: typeof corpo.usage?.model === 'string' ? corpo.usage.model : '',
        inputUnits:
          typeof corpo.usage?.inputUnits === 'number' ? corpo.usage.inputUnits : undefined,
      },
    };
  }

  /**
   * Abre o stream. **Tudo que pode falhar com status HTTP falha aqui** — antes de
   * o controller escrever um byte na resposta. Depois do primeiro `write` não
   * existe mais 503: existe um evento `error` dentro de um 200.
   */
  async abrir(entrada: EntradaDoTurno): Promise<StreamDoAgente> {
    const base = this.base();
    if (!base) {
      throw new ServiceUnavailableException(
        'O chat com IA não está configurado nesta instância. Todo o resto do app ' +
          'continua funcionando — o registro manual não depende de IA.',
      );
    }

    const chave = this.config.get<string>('AGENT_API_KEY', '').trim();
    const abortador = new AbortController();
    const relogioDeAbertura = setTimeout(() => abortador.abort(), TIMEOUT_DE_ABERTURA_MS);

    let http: Response;
    try {
      http = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          // O Bearer do usuário, intacto. É com ele que o agente chama o `/mcp`.
          Authorization: `Bearer ${entrada.bearer}`,
          ...(chave ? { 'X-Fatia-Agent-Key': chave } : {}),
        },
        body: JSON.stringify({
          conversationId: entrada.conversationId,
          timezone: entrada.timezone,
          history: entrada.historico.map((m) => ({ role: m.role, content: m.content })),
          memories: entrada.memorias ?? [],
          ...(entrada.retomada
            ? { resume: entrada.retomada }
            : {
                message: entrada.mensagem,
                ...(entrada.fotos?.length ? { photos: entrada.fotos } : {}),
              }),
        }),
        signal: abortador.signal,
      });
    } catch (erro) {
      clearTimeout(relogioDeAbertura);
      const causa = erro as Error;
      // Só nome e classe do erro. Nada do corpo: é o que a pessoa escreveu.
      this.logger.warn(`Agente de chat inacessível: ${causa.name}`);
      if (causa.name === 'TimeoutError' || causa.name === 'AbortError') {
        throw new GatewayTimeoutException('O chat demorou demais para responder. Tente de novo.');
      }
      throw new ServiceUnavailableException(
        'O chat com IA está fora do ar no momento. O resto do app continua funcionando.',
      );
    }
    clearTimeout(relogioDeAbertura);

    if (!http.ok) throw await this.traduzirErro(http);
    if (!http.body) {
      throw new BadGatewayException('O chat com IA devolveu uma resposta vazia.');
    }

    return this.envolver(http.body, abortador);
  }

  /**
   * Empacota o corpo num gerador com relógio de ociosidade próprio.
   *
   * O `AbortController` é o **mesmo** do `fetch`: abortá-lo mata a conexão TCP
   * com o agente, e não só a leitura deste lado. É o que impede que o cliente
   * fechar a aba deixe uma inferência paga rodando até o fim.
   */
  private envolver(corpo: ReadableStream<Uint8Array>, abortador: AbortController): StreamDoAgente {
    const logger = this.logger;
    return {
      cancelar: () => abortador.abort(),
      async *pedacos() {
        const leitor = corpo.getReader();
        let ocioso = setTimeout(() => abortador.abort(), TIMEOUT_DE_OCIOSIDADE_MS);
        try {
          for (;;) {
            const { done, value } = await leitor.read();
            if (done) return;
            clearTimeout(ocioso);
            ocioso = setTimeout(() => abortador.abort(), TIMEOUT_DE_OCIOSIDADE_MS);
            if (value) yield value;
          }
        } catch (erro) {
          const causa = erro as Error;
          logger.warn(`Stream do agente de chat interrompido: ${causa.name}`);
          throw new ErroDeStreamDoAgente(
            'AGENT_STREAM_INTERRUPTED',
            'A resposta foi interrompida antes de terminar. Tente enviar de novo.',
          );
        } finally {
          clearTimeout(ocioso);
          // `cancel` e não `releaseLock`: o objetivo é soltar a conexão, e um
          // leitor liberado sobre um corpo pela metade mantém o socket aberto.
          await leitor.cancel().catch(() => undefined);
        }
      },
    };
  }

  /**
   * O nome da conversa, gerado pelo agente a partir da primeira mensagem.
   *
   * **Nunca lança.** Um título é enfeite de lista: qualquer falha devolve
   * `null` e a conversa fica com o recorte da primeira mensagem que já tem.
   * Sem Bearer — nomear um texto não alcança dado da pessoa.
   */
  async titular(texto: string): Promise<TituloDoAgente | null> {
    const base = this.base();
    if (!base) return null;
    const chave = this.config.get<string>('AGENT_API_KEY', '').trim();
    try {
      const http = await fetch(`${base}/title`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(chave ? { 'X-Fatia-Agent-Key': chave } : {}),
        },
        body: JSON.stringify({ text: texto }),
        signal: AbortSignal.timeout(TIMEOUT_DO_TITULO_MS),
      });
      if (!http.ok) {
        this.logger.warn(`Título de conversa: o agente respondeu ${http.status}`);
        return null;
      }
      const corpo = (await http.json()) as {
        title?: unknown;
        usage?: { model?: unknown; inputUnits?: unknown; outputUnits?: unknown } | null;
      };
      const usage = corpo.usage;
      return {
        titulo: typeof corpo.title === 'string' && corpo.title.trim() ? corpo.title.trim() : null,
        uso:
          usage && typeof usage.model === 'string'
            ? {
                model: usage.model,
                inputUnits: typeof usage.inputUnits === 'number' ? usage.inputUnits : undefined,
                outputUnits: typeof usage.outputUnits === 'number' ? usage.outputUnits : undefined,
              }
            : null,
      };
    } catch (erro) {
      this.logger.warn(`Título de conversa não gerado: ${(erro as Error).name}`);
      return null;
    }
  }

  private base(): string | null {
    const bruto = this.config.get<string>('AGENT_BASE_URL', '').trim();
    return bruto ? bruto.replace(/\/+$/, '') : null;
  }

  /**
   * Erro do agente → exceção do Nest, **pelo `code`** e nunca pela prosa: o
   * código é contrato estável do `apps/agent`; a mensagem em português muda numa
   * revisão de texto.
   */
  private async traduzirErro(http: Response): Promise<Error> {
    const corpo = (await http.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const code = corpo?.error?.code ?? '';
    this.logger.warn(`Agente de chat respondeu ${http.status} (${code || 'sem code'})`);

    // O `code` separa os dois 401 que o agente devolve, e eles pedem correções
    // opostas. O do `/mcp` é o token **da pessoa** (expirou): 401 aqui também, que
    // é o que faz o PWA renovar a sessão. O da chave compartilhada é configuração
    // **nossa**: 503, porque quem está conversando não tem o que fazer. Tratar os
    // dois como 503 — como era — fazia um token vencido parecer instância quebrada.
    if (code === 'MCP_UNAUTHENTICATED' || code === 'MCP_UNAUTHORIZED') {
      return new UnauthorizedException({
        code: 'AI_UNAUTHORIZED',
        message: 'Sua sessão expirou. Entre de novo para continuar a conversa.',
      });
    }
    if (http.status === 401 || http.status === 403) {
      return new ServiceUnavailableException(
        'O chat com IA está mal configurado nesta instância: a API não conseguiu se ' +
          'autenticar no agente.',
      );
    }
    // A pausa que o PWA tentou responder não é a que a conversa espera — outra
    // aba respondeu antes, ou a página ficou aberta sobre um estado velho.
    if (code === 'CHAT_RESUME_MISMATCH' || code === 'CHAT_NOTHING_TO_RESUME') {
      return new ConflictException({
        code,
        message:
          'Esta conversa mudou desde que a pergunta apareceu. Recarregue a conversa para ver ' +
          'o que ela espera agora.',
      });
    }

    switch (code) {
      case 'AI_PROVIDER_NOT_CONFIGURED':
        return new ServiceUnavailableException(
          'O chat com IA não está configurado nesta instância.',
        );
      case 'AI_PROVIDER_TIMEOUT':
        return new GatewayTimeoutException('O modelo não respondeu a tempo. Tente de novo.');
      default:
        return new BadGatewayException('O chat com IA falhou. Tente de novo em instantes.');
    }
  }
}
