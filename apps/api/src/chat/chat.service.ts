import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiUsageService } from '../ai/ai-usage.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AgentChatClient, ErroDeStreamDoAgente, type StreamDoAgente } from './agent-chat.client';
import { ConversationService } from './conversation.service';
import type { SendChatMessageDto } from './dto/chat.dto';
import { type TurnoLido, criarLeitorDoTurno } from './leitor-do-turno';
import { criarLeitorSse, formatarEventoSse } from './sse';

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
   * Conduz um turno inteiro — uma mensagem nova ou a resposta a uma pausa.
   *
   * **A ordem das etapas antes do primeiro byte é a garantia, não um detalhe.**
   * Todas podem falhar com status HTTP de verdade, e só podem enquanto nenhum
   * byte saiu: depois do primeiro `escrever`, o status já é 200.
   *
   * 1. **Conversa alheia recusa** — antes de gastar qualquer coisa.
   * 2. **Cota** — antes de chamar o agente, que é onde o dinheiro sai.
   * 3. **Abre o upstream** — 401/409/503/504 do agente ainda viram status aqui.
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
    if (dto.message !== undefined && dto.resume !== undefined) {
      throw new BadRequestException(
        'Envie message (turno novo) ou resume (resposta a uma pausa), não os dois.',
      );
    }

    const existente = await this.conversas.encontrar(user.id, dto.conversationId);
    if (dto.resume && !existente) throw new NotFoundException('Conversa não encontrada.');

    await this.uso.assertDentroDaCota(user.id);

    const historico =
      existente && dto.message !== undefined
        ? await this.conversas.historicoParaOAgente(user.id, dto.conversationId)
        : [];

    let stream: StreamDoAgente | null = null;
    let clienteFoiEmbora = false;
    destino.aoFechar(() => {
      clienteFoiEmbora = true;
      stream?.cancelar();
    });

    const comum = {
      bearer,
      timezone: user.timezone,
      conversationId: dto.conversationId,
      historico,
    };
    stream = await this.agent.abrir(
      dto.resume
        ? { ...comum, retomada: { interruptId: dto.resume.interruptId, value: dto.resume.value } }
        : { ...comum, mensagem: dto.message as string },
    );

    if (clienteFoiEmbora) stream.cancelar();

    if (existente) await this.conversas.limparPausas(user.id, dto.conversationId);
    if (dto.message !== undefined) {
      await this.conversas.iniciarTurno(user.id, dto.conversationId, dto.message);
      // Sem `await`: o nome é enfeite de lista, e esperar por ele atrasaria o
      // primeiro token da resposta, que é o que a pessoa está olhando.
      if (!existente) void this.nomear(user.id, dto.conversationId, dto.message);
    }

    // Um comentário SSE, que todo leitor ignora, só para o cabeçalho sair agora:
    // daqui em diante nada mais muda de status, e o cliente não precisa esperar o
    // primeiro quadro do agente para saber que a conversa abriu.
    destino.escrever(': aberto\n\n');

    const leitorSse = criarLeitorSse();
    const turno = criarLeitorDoTurno();

    try {
      for await (const pedaco of stream.pedacos()) {
        destino.escrever(pedaco);
        for (const evento of leitorSse.push(pedaco)) turno.absorver(evento);
      }
    } catch (erro) {
      const nomeado =
        erro instanceof ErroDeStreamDoAgente
          ? erro
          : new ErroDeStreamDoAgente(
              'CHAT_INTERNAL_ERROR',
              'Algo deu errado no meio da resposta. Tente enviar de novo.',
            );
      if (!(erro instanceof ErroDeStreamDoAgente)) {
        this.logger.error(`Erro inesperado no turno de chat: ${(erro as Error).name}`);
      }
      destino.escrever(
        formatarEventoSse('error', { code: nomeado.code, message: nomeado.message }),
      );
      // O `done` do agente não vai chegar, e a garantia do fio é que ele é sempre
      // o último evento: sem ele, a tela ficaria girando esperando.
      destino.escrever(formatarEventoSse('done', { status: 'error' }));
    } finally {
      const lido = turno.lido();
      const linha = await this.registrarOQuePassou(user.id, dto.conversationId, lido);
      // Depois do `done` do agente, e antes do fim: é o que liga o id que a tela
      // conhece (o da mensagem do LangChain) à linha do banco, onde o voto grava.
      if (linha && lido.ultimaMensagemId) {
        destino.escrever(
          formatarEventoSse('persisted', {
            messageId: lido.ultimaMensagemId,
            assistantMessageId: linha,
          }),
        );
      }
      destino.fim();
    }
  }

  /**
   * Persiste a resposta e lança o custo no livro-caixa.
   *
   * Erro aqui não derruba o turno: a resposta já foi lida pela pessoa, e um 500
   * depois de 200 não existe. Fica no log — sem o conteúdo, só o nome do erro.
   */
  /** Título pelo agente, com o custo no livro-caixa. Nunca derruba nada. */
  private async nomear(userId: string, conversationId: string, primeira: string): Promise<void> {
    try {
      const gerado = await this.agent.titular(primeira);
      if (!gerado) return;
      if (gerado.titulo) {
        await this.conversas.titularSeProvisorio(userId, conversationId, primeira, gerado.titulo);
      }
      await this.uso.registrar(userId, {
        feature: 'chat_title',
        model: gerado.uso?.model ?? null,
        units: gerado.uso
          ? { inputUnits: gerado.uso.inputUnits, outputUnits: gerado.uso.outputUnits }
          : {},
      });
    } catch (erro) {
      this.logger.warn(`Falha ao nomear a conversa: ${(erro as Error).name}`);
    }
  }

  private async registrarOQuePassou(
    userId: string,
    conversationId: string,
    turno: TurnoLido,
  ): Promise<string | null> {
    let linha: string | null = null;
    try {
      linha = await this.conversas.concluirTurno(userId, conversationId, {
        texto: turno.texto,
        tools: turno.tools,
        status: turno.status,
        pausa: turno.pausa,
        runId: turno.runId,
      });
    } catch (erro) {
      this.logger.error(`Falha ao gravar a resposta do chat: ${(erro as Error).name}`);
    }

    try {
      if (turno.usoPorModelo.size === 0) {
        await this.uso.registrar(userId, { feature: 'chat', model: null, units: {} });
      } else {
        for (const [model, units] of turno.usoPorModelo) {
          await this.uso.registrar(userId, { feature: 'chat', model, units });
        }
      }
    } catch (erro) {
      this.logger.error(`Falha ao registrar o custo do chat: ${(erro as Error).name}`);
    }
    return linha;
  }
}
