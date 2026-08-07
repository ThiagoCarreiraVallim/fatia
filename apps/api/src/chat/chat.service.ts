import { Injectable, Logger } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { AiUsageService } from '../ai/ai-usage.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AgentChatClient, ErroDeStreamDoAgente, type StreamDoAgente } from './agent-chat.client';
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

/** Unidades acumuladas de **um** modelo dentro de um turno. */
type UnidadesDoModelo = { inputUnits?: number; outputUnits?: number };

/**
 * Soma em que `undefined` **contamina o total**, de propósito.
 *
 * Se qualquer rodada do turno deixou de reportar uma das unidades, o total
 * daquele campo é desconhecido — e não a soma das que vieram. Somar só as
 * presentes devolveria um número menor que o real **com cara de medido**:
 * `estimateAiCost` cobraria por ele com `pricingKnown: true`, e a diferença
 * sumiria. Com `undefined`, o turno cai em custo não medido e conta na
 * tolerância de `unpricedCalls`, que é o comportamento que a #135 pediu.
 */
function somarUnidade(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined || b === undefined ? undefined : a + b;
}

const numeroOuIndefinido = (valor: unknown): number | undefined =>
  typeof valor === 'number' ? valor : undefined;

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

    // **Registrado ANTES de `abrir`, e não depois.** `res.on('close')` não
    // reentrega um evento que já foi emitido, e `abrir` espera até 120 s pelo
    // primeiro byte. Com o registro depois, quem fechasse a aba dentro dessa
    // janela — que é justamente a mais longa do turno — nunca cancelava o
    // upstream: a inferência paga seguia até o fim para ninguém.
    let stream: StreamDoAgente | null = null;
    let clienteFoiEmbora = false;
    destino.aoFechar(() => {
      clienteFoiEmbora = true;
      stream?.cancelar();
    });

    stream = await this.agent.abrir({
      bearer,
      // `null` numa conversa nova: o id só existe depois que o agente aceitou o
      // turno, e o agente não guarda histórico nenhum — ele recebe o que precisa
      // em `messages`.
      conversationId: dto.conversationId ?? null,
      timezone: user.timezone,
      messages: [...anterior, { role: MessageRole.user, content: dto.message }],
    });

    // O `close` que chegou enquanto o agente demorava a responder não volta a
    // ser entregue: cancelar aqui à mão é o que transforma o flag em corte real.
    if (clienteFoiEmbora) stream.cancelar();

    const { conversationId } = await this.conversas.iniciarTurno(
      user.id,
      dto.conversationId,
      dto.message,
    );

    // Primeiro evento nosso: sem ele, o PWA que acabou de começar uma conversa
    // não teria como continuá-la — o id nasce aqui.
    destino.escrever(formatarEventoSse('conversation', { conversationId }));

    const leitor = criarLeitorSse();
    const texto: string[] = [];
    const tools: ToolChamada[] = [];
    /**
     * O gasto do turno, **acumulado por modelo**.
     *
     * Um mapa que soma, e não a última leitura, porque o agente emite mais de um
     * `usage` por turno sempre que há tool: um grafo LangGraph chama o modelo uma
     * vez para decidir a chamada e outra para responder com o resultado dela.
     * Guardar o último sobrescreveria o primeiro, e o custo a menos seria o menor
     * dos problemas — a linha ainda entraria com `model` preenchido, ou seja
     * `pricingKnown: true`, então `unpricedCalls` não contaria, o alerta de
     * anomalia não acenderia e a cota do dia fecharia tarde. É o "liberar em
     * silêncio" que esta camada existe para evitar, entrando pela porta oposta.
     *
     * Somar é a única saída que não depende de o vizinho obedecer: mesmo que a
     * #247 fixe "exatamente um `usage`, no fim", a API não tem como conferir.
     */
    const usoPorModelo = new Map<string, UnidadesDoModelo>();

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
            const acumulado = usoPorModelo.get(dados.model) ?? { inputUnits: 0, outputUnits: 0 };
            usoPorModelo.set(dados.model, {
              inputUnits: somarUnidade(acumulado.inputUnits, numeroOuIndefinido(dados.inputUnits)),
              outputUnits: somarUnidade(
                acumulado.outputUnits,
                numeroOuIndefinido(dados.outputUnits),
              ),
            });
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
      await this.registrarOQuePassou(user.id, conversationId, { texto, tools, usoPorModelo });
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
      usoPorModelo: Map<string, UnidadesDoModelo>;
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
      if (turno.usoPorModelo.size === 0) {
        // `model: null` quando o agente não reportou `usage` nenhum. Vira
        // `pricingKnown: false`, não custo zero — ver `AiUsageService.registrar`.
        await this.uso.registrar(userId, { feature: 'chat', model: null, units: {} });
        return;
      }
      // Uma linha por modelo, e não uma linha por turno: dois modelos têm dois
      // preços na tabela, e uma linha só teria de escolher um deles — que é
      // preço errado gravado como se fosse conhecido.
      for (const [model, units] of turno.usoPorModelo) {
        await this.uso.registrar(userId, { feature: 'chat', model, units });
      }
    } catch (erro) {
      this.logger.error(`Falha ao registrar o custo do chat: ${(erro as Error).name}`);
    }
  }
}
