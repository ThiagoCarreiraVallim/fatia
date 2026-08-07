import { Injectable, Logger } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { AiUsageService } from '../ai/ai-usage.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AgentChatClient, ErroDeStreamDoAgente } from './agent-chat.client';
import { ConversationService, type ToolChamada } from './conversation.service';
import type { SendChatMessageDto } from './dto/chat.dto';
import { criarLeitorSse, dadosDoEvento, formatarEventoSse } from './sse';

/**
 * O turno de conversa: cota, persistência e **repasse do SSE sem bufferizar**.
 *
 * A propriedade que este arquivo existe para garantir é a do meio do desenho da
 * #247: cada pedaço que chega do agente é escrito no cliente **antes** de ser
 * examinado. Se a API acumulasse para "processar no fim", o streaming das outras
 * duas camadas viraria enfeite — a pessoa esperaria a resposta inteira olhando
 * para uma tela parada, que é indistinguível de travado. Por isso o laço abaixo
 * escreve primeiro e só depois alimenta o leitor de SSE, e por isso existe teste
 * que falha se a ordem inverter.
 *
 * O que a API entende do que passou serve para três coisas, e nenhuma delas
 * atrasa o byte: o texto a persistir, quais tools foram chamadas e o `usage` que
 * alimenta a cota.
 *
 * **Nada do que a pessoa escreveu, nem o Bearer, entra em log** — nem aqui nem no
 * cliente do agente. O corpo do chat é o dado mais íntimo do produto: ele carrega
 * em prosa o que as outras telas guardam em número.
 */

/** Um destino de bytes. Existe para o turno ser testável sem socket. */
export interface DestinoDoStream {
  escrever(pedaco: Uint8Array | string): void;
  fim(): void;
  /** Cliente foi embora (aba fechada, rede caiu). */
  aoFechar(callback: () => void): void;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversas: ConversationService,
    private readonly agent: AgentChatClient,
    private readonly uso: AiUsageService,
  ) {}

  /**
   * Conduz um turno inteiro.
   *
   * **A ordem das quatro primeiras etapas é a garantia, não um detalhe.** Todas
   * elas podem falhar com status HTTP de verdade, e só podem enquanto nenhum byte
   * saiu: depois do primeiro `escrever`, o status já é 200 e o que resta é um
   * evento `error` dentro do stream.
   *
   * 1. **Conversa alheia recusa** — antes de gastar qualquer coisa.
   * 2. **Cota** — antes de chamar o agente, que é onde o dinheiro sai.
   * 3. **Abre o upstream** — 503/504 do agente ainda viram 503/504 aqui.
   * 4. **Só então persiste** a mensagem da pessoa. Persistir antes deixaria uma
   *    conversa órfã, com a pergunta e nenhuma resposta, toda vez que o agente
   *    estivesse fora do ar.
   */
  async conversar(
    user: CurrentUserPayload,
    dto: SendChatMessageDto,
    bearer: string,
    destino: DestinoDoStream,
  ): Promise<void> {
    const anterior = dto.conversationId
      ? await this.conversas.historicoParaOAgente(user.id, dto.conversationId)
      : [];

    await this.uso.assertDentroDaCota(user.id);

    const stream = await this.agent.abrir({
      bearer,
      // `null` numa conversa nova: o id só existe depois que o agente aceitou o
      // turno, e o agente não guarda histórico nenhum — ele recebe o que precisa
      // em `messages`.
      conversationId: dto.conversationId ?? null,
      timezone: user.timezone,
      messages: [...anterior, { role: MessageRole.user, content: dto.message }],
    });

    const { conversationId } = await this.conversas.iniciarTurno(
      user.id,
      dto.conversationId,
      dto.message,
    );

    destino.aoFechar(() => stream.cancelar());

    // Primeiro evento nosso: sem ele, o PWA que acabou de começar uma conversa
    // não teria como continuá-la — o id nasce aqui.
    destino.escrever(formatarEventoSse('conversation', { conversationId }));

    const leitor = criarLeitorSse();
    const texto: string[] = [];
    const tools: ToolChamada[] = [];
    let usage: { model: string; inputUnits?: number; outputUnits?: number } | null = null;

    try {
      for await (const pedaco of stream.pedacos()) {
        // Escreve ANTES de examinar. Ver o comentário do topo do arquivo.
        destino.escrever(pedaco);

        for (const evento of leitor.push(pedaco)) {
          const dados = dadosDoEvento(evento);
          if (!dados) continue;

          if (evento.event === 'token' && typeof dados.text === 'string') {
            texto.push(dados.text);
          } else if (evento.event === 'tool' && typeof dados.name === 'string') {
            const nome = dados.name;
            // O agente emite o começo e o fim da mesma chamada; o histórico
            // guarda a chamada, não os dois avisos sobre ela.
            if (!tools.some((t) => t.name === nome)) tools.push({ name: nome });
          } else if (evento.event === 'usage' && typeof dados.model === 'string') {
            usage = {
              model: dados.model,
              inputUnits: typeof dados.inputUnits === 'number' ? dados.inputUnits : undefined,
              outputUnits: typeof dados.outputUnits === 'number' ? dados.outputUnits : undefined,
            };
          }
        }
      }
    } catch (erro) {
      // **Nada é relançado depois do primeiro byte**, nem erro inesperado. O 200
      // já saiu: relançar faria o filtro de exceção do Nest tentar escrever um
      // corpo de erro numa resposta cujo cabeçalho já foi, e o cliente receberia
      // um stream que simplesmente para, sem nada que a interface saiba mostrar.
      // O que dá para fazer é o que está aqui — dizer no protocolo do stream.
      const nomeado =
        erro instanceof ErroDeStreamDoAgente
          ? erro
          : new ErroDeStreamDoAgente(
              'CHAT_INTERNAL_ERROR',
              'Algo deu errado no meio da resposta. Tente enviar de novo.',
            );
      if (!(erro instanceof ErroDeStreamDoAgente)) {
        // Só o nome da classe: a mensagem de um erro inesperado pode carregar
        // trecho do que trafegava, e o que trafega aqui é a conversa.
        this.logger.error(`Erro inesperado no turno de chat: ${(erro as Error).name}`);
      }
      destino.escrever(
        formatarEventoSse('error', { code: nomeado.code, message: nomeado.message }),
      );
    } finally {
      // Fora do `try` de cima porque vale para os dois caminhos, e **em especial**
      // para o que deu errado: o texto parcial já está na tela da pessoa, e o
      // custo já saiu do caixa mesmo que a resposta não tenha terminado.
      await this.registrarOQuePassou(user.id, conversationId, { texto, tools, usage });
      destino.fim();
    }
  }

  /**
   * Persiste a resposta e lança o custo no livro-caixa.
   *
   * Erro aqui não derruba o turno: a resposta já foi lida pela pessoa, e um 500
   * depois de 200 não existe. Fica no log — sem o conteúdo, só o nome do erro.
   */
  private async registrarOQuePassou(
    userId: string,
    conversationId: string,
    turno: {
      texto: string[];
      tools: ToolChamada[];
      usage: { model: string; inputUnits?: number; outputUnits?: number } | null;
    },
  ): Promise<void> {
    try {
      await this.conversas.concluirTurno(userId, conversationId, {
        texto: turno.texto.join(''),
        tools: turno.tools,
      });
    } catch (erro) {
      this.logger.error(`Falha ao gravar a resposta do chat: ${(erro as Error).name}`);
    }

    try {
      // `model: null` quando o agente não reportou `usage`. Vira
      // `pricingKnown: false`, não custo zero — ver `AiUsageService.registrar`.
      await this.uso.registrar(userId, {
        feature: 'chat',
        model: turno.usage?.model ?? null,
        units: {
          inputUnits: turno.usage?.inputUnits,
          outputUnits: turno.usage?.outputUnits,
        },
      });
    } catch (erro) {
      this.logger.error(`Falha ao registrar o custo do chat: ${(erro as Error).name}`);
    }
  }
}
