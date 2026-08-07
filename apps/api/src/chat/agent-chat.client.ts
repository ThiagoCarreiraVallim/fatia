import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MensagemDoHistorico } from './conversation.service';

/**
 * Cliente do `POST /chat` do `apps/agent` (#248), do lado do NestJS (#249).
 *
 * ## O contrato, que é a razão de este arquivo existir separado
 *
 * As três camadas da épica #247 são construídas em paralelo, então o que viaja
 * entre elas está escrito **aqui** e no corpo da PR, e não descoberto por cada
 * uma. O que vai:
 *
 * ```json
 * { "conversation_id": "..." | null, "timezone": "America/Sao_Paulo",
 *   "messages": [{ "role": "user" | "assistant", "content": "..." }] }
 * ```
 *
 * O histórico vai junto porque **o agente não guarda nada** — quem persiste é a
 * API, que é quem tem banco (ADR 015); `conversation_id` é só correlação, e vem
 * `null` no primeiro turno de uma conversa nova. O que volta é
 * `text/event-stream`, e o `data` de cada evento é um objeto JSON:
 *
 * | evento  | `data`                                            |
 * | ------- | ------------------------------------------------- |
 * | `token` | `{ "text": "..." }` — pedaço da resposta           |
 * | `tool`  | `{ "name": "log_meal", ... }`                     |
 * | `usage` | `{ "model": "...", "inputUnits": n, "outputUnits": n }` |
 * | `error` | `{ "code": "...", "message": "..." }`             |
 * | `done`  | `{}`                                              |
 *
 * O `usage` é o que faz a cota da #135 funcionar: sem ele, o turno entra no
 * livro-caixa como **custo não medido** (`pricingKnown: false`), não como
 * grátis. Ou seja, se o agente parar de emitir, a cota fecha pela tolerância em
 * vez de liberar para sempre em silêncio.
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
  /** `null` quando a conversa ainda não existe — ver `ChatService.conversar`. */
  conversationId: string | null;
  timezone: string;
  messages: MensagemDoHistorico[];
};

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

@Injectable()
export class AgentChatClient {
  private readonly logger = new Logger(AgentChatClient.name);

  constructor(private readonly config: ConfigService) {}

  /** `true` quando esta instância tem agente configurado para conversar. */
  configurado(): boolean {
    return this.base() !== null;
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
          conversation_id: entrada.conversationId,
          timezone: entrada.timezone,
          messages: entrada.messages.map((m) => ({ role: m.role, content: m.content })),
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

    // 401/403 aqui é **configuração**, não o Bearer do usuário: quem barra por
    // token de usuário é o `/mcp`, e isso chega como evento dentro do stream. O
    // que falha antes do stream é o segredo compartilhado entre API e agente.
    if (http.status === 401 || http.status === 403) {
      return new ServiceUnavailableException(
        'O chat com IA está mal configurado nesta instância: a API não conseguiu se ' +
          'autenticar no agente.',
      );
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
