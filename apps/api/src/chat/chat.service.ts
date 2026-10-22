import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AiAccessService } from '../ai/ai-access.service';
import { AgentStreamError } from '../ai/agent.adapter';
import { HostedAiService, type HostedTurn } from '../ai/hosted-ai.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ConversationService } from './conversation.service';
import { MemoryService } from './memory/memory.service';
import { GroupAgentService } from '../sharing/group-agent.service';
import type { ChatPhotoDto, SendChatMessageDto } from './dto/chat.dto';
import { TETO_DA_FOTO_DO_CHAT } from './corpos-do-chat';
import { NaoEhJpegError, removerMetadadosDoJpeg } from '../nutrition/helpers/strip-exif';
import { type TurnSummary, createTurnReader } from './leitor-do-turno';
import { criarLeitorSse, formatarEventoSse } from './sse';
import { ChatRunRegistry, createSseFramer } from './chat-run.registry';
import { NotificationService, type Notice } from '../notifications/notification.service';

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

const ENCODER = new TextEncoder();

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
    private readonly hostedAi: HostedAiService,
    private readonly memorias: MemoryService,
    private readonly acesso: AiAccessService,
    private readonly agentes: GroupAgentService,
    private readonly runs: ChatRunRegistry,
    private readonly avisos: NotificationService,
  ) {}

  /** Os agentes que a pessoa pode escolher numa conversa nova, e o padrão. */
  async agents(userId: string) {
    return this.agentes.listForChat(userId, await this.acesso.seatGroupOf(userId));
  }

  /**
   * De qual comunidade é o agente desta conversa. Gravado quando ela nasce:
   * ausente é o padrão (a comunidade do assento), `null` é o assistente da
   * Fatia, e um id fora das opções é 404 antes de qualquer gasto.
   */
  private async agentGroupOf(
    userId: string,
    existente: { agentGroupId: string | null } | null,
    escolhido: string | null | undefined,
    seatGroupId: string | null,
  ): Promise<string | null> {
    if (existente) return existente.agentGroupId;
    if (escolhido === null) return null;
    if (escolhido === undefined) {
      return (await this.agentes.listForChat(userId, seatGroupId)).defaultGroupId;
    }
    await this.agentes.assertSelectable(userId, escolhido);
    return escolhido;
  }

  /**
   * O ditado do composer (#141). Plano, cota e custo ficam no `HostedAiService`.
   *
   * O texto volta para o campo de mensagem e **não** vira turno: quem decide
   * mandar é a pessoa, depois de ler. Nada do áudio é gravado ou logado.
   */
  async transcribe(userId: string, audio: Buffer, contentType: string): Promise<{ text: string }> {
    if (audio.length === 0) throw new BadRequestException('O áudio veio vazio.');
    return this.hostedAi.transcribe(userId, audio, contentType);
  }

  /**
   * Conduz um turno inteiro — uma mensagem nova ou a resposta a uma pausa.
   *
   * **A ordem das etapas antes do primeiro byte é a garantia, não um detalhe.**
   * Todas podem falhar com status HTTP de verdade, e só podem enquanto nenhum
   * byte saiu: depois do primeiro `escrever`, o status já é 200.
   *
   * 1. **Conversa alheia recusa** — antes de gastar qualquer coisa.
   * 2. **Plano e cota** — antes de chamar o agente, que é onde o dinheiro sai.
   *    Free recebe 402 aqui (ADR 024).
   * 3. **Abre o upstream** — 401/409/503/504 do agente ainda viram status aqui.
   * 4. **Só então persiste** a mensagem da pessoa. Persistir antes deixaria uma
   *    conversa órfã, com a pergunta e nenhuma resposta, toda vez que o agente
   *    estivesse fora do ar.
   */
  async converse(
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
    if (dto.resume && dto.photos?.length) {
      throw new BadRequestException('Foto só acompanha uma mensagem nova.');
    }
    const fotos = fotosDoTurno(dto.photos ?? []);

    const existente = await this.conversas.encontrar(user.id, dto.conversationId);
    if (dto.resume && !existente) throw new NotFoundException('Conversa não encontrada.');

    // Reservada já aqui: um segundo `POST` na mesma conversa recebe 409 em vez
    // de abrir outro turno na mesma thread do agente.
    const run = this.runs.start(user.id, dto.conversationId);
    let hosted: HostedTurn;
    let agentGroupId: string | null = null;
    try {
      // Plano e cota rodam no `openTurn`, antes deste callback e do agente.
      hosted = await this.hostedAi.openTurn(user.id, async (seatGroupId) => {
        agentGroupId = await this.agentGroupOf(user.id, existente, dto.agentGroupId, seatGroupId);
        // Conferida a cada turno: saiu da comunidade, ou o dono desligou o agente,
        // e a mesma conversa segue com o assistente da Fatia.
        const persona = await this.agentes.personaFor(user.id, agentGroupId);

        const history =
          existente && dto.message !== undefined
            ? await this.conversas.historicoParaOAgente(user.id, dto.conversationId)
            : [];

        const common = {
          bearer,
          timezone: user.timezone,
          conversationId: dto.conversationId,
          history,
          memories: (await this.memorias.listar(user.id)).map(({ id, content }) => ({
            id,
            content,
          })),
          ...(persona ? { persona } : {}),
        };
        return dto.resume
          ? { ...common, resume: { interruptId: dto.resume.interruptId, value: dto.resume.value } }
          : {
              ...common,
              message: dto.message as string,
              ...(fotos.length ? { photos: fotos } : {}),
            };
      });
    } catch (erro) {
      // Nada saiu ainda: o turno nem existiu, e a conversa fica livre.
      this.runs.discard(run);
      throw erro;
    }
    const stream = hosted.stream;
    // Parar antes de o agente responder corta assim que o upstream existe.
    run.bindUpstream(() => stream.cancel());

    if (existente) await this.conversas.clearPauses(user.id, dto.conversationId);
    if (dto.message !== undefined) {
      await this.conversas.iniciarTurno(
        user.id,
        dto.conversationId,
        dto.message,
        fotos.length,
        agentGroupId,
      );
      // Sem `await`: o nome é enfeite de lista, e esperar por ele atrasaria o
      // primeiro token da resposta, que é o que a pessoa está olhando.
      if (!existente) void this.nameConversation(user.id, dto.conversationId, dto.message, hosted);
    }

    // Um comentário SSE, que todo leitor ignora, só para o cabeçalho sair agora:
    // daqui em diante nada mais muda de status, e o cliente não precisa esperar o
    // primeiro quadro do agente para saber que a conversa abriu.
    destino.escrever(': aberto\n\n');

    // Quem pediu é só a primeira assinante. Ir embora tira a assinatura e **não**
    // para o turno: a resposta termina, é gravada, e quem voltar a encontra.
    const sairDaAssinatura = run.subscribe(0, {
      write: (texto) => destino.escrever(texto),
      end: () => destino.fim(),
    });
    destino.aoFechar(sairDaAssinatura);

    const framer = createSseFramer();
    const leitorSse = criarLeitorSse();
    const turno = createTurnReader();
    const publicar = (bloco: string) => {
      // Escreve primeiro, examina depois — ver o comentário do topo.
      run.publish(bloco);
      for (const evento of leitorSse.push(ENCODER.encode(bloco))) turno.absorb(evento);
    };

    try {
      for await (const pedaco of stream.chunks()) {
        for (const bloco of framer.push(pedaco)) publicar(bloco);
      }
      for (const bloco of framer.flush()) publicar(bloco);
      // Só no fio, e não no leitor: o `stopped` do banco sai de
      // `markStoppedWhenRequested`, que precisa ver que o agente não fechou.
      if (run.stopRequested && !turno.read().sawDone) {
        run.publish(formatarEventoSse('done', { status: 'stopped' }));
      }
    } catch (erro) {
      if (run.stopRequested) {
        run.publish(formatarEventoSse('done', { status: 'stopped' }));
      } else {
        const nomeado =
          erro instanceof AgentStreamError
            ? erro
            : new AgentStreamError(
                'CHAT_INTERNAL_ERROR',
                'Algo deu errado no meio da resposta. Tente enviar de novo.',
              );
        if (!(erro instanceof AgentStreamError)) {
          this.logger.error(`Erro inesperado no turno de chat: ${(erro as Error).name}`);
        }
        publicar(formatarEventoSse('error', { code: nomeado.code, message: nomeado.message }));
        // O `done` do agente não vai chegar, e a garantia do fio é que ele é sempre
        // o último evento: sem ele, a tela ficaria girando esperando.
        publicar(formatarEventoSse('done', { status: 'error' }));
      }
    } finally {
      const summary = markStoppedWhenRequested(turno.read(), run.stopRequested);
      const linha = await this.recordTurn(user.id, dto.conversationId, summary, hosted);
      // Ninguém ouvindo no fim: a pessoa saiu do app (ou da tela) antes de a
      // resposta chegar. O aviso diz só que ela está pronta — nada do conteúdo.
      if (run.listeners === 0 && !run.stopRequested) {
        const notice = chatReadyNotice(dto.conversationId, summary.status);
        if (notice) this.avisos.notify([user.id], notice);
      }
      // Depois do `done` do agente, e antes do fim: é o que liga o id que a tela
      // conhece (o da mensagem do LangChain) à linha do banco, onde o voto grava.
      if (linha && summary.ultimaMensagemId) {
        run.publish(
          formatarEventoSse('persisted', {
            messageId: summary.ultimaMensagemId,
            assistantMessageId: linha,
          }),
        );
      }
      this.runs.finish(run);
    }
  }

  /** Para a resposta em andamento desta conversa. `false` quando não há nenhuma. */
  stop(userId: string, conversationId: string): boolean {
    const run = this.runs.find(userId, conversationId);
    if (!run || run.done) return false;
    run.stop();
    return true;
  }

  /** Título pelo agente, com o custo no livro-caixa do turno. Nunca derruba nada. */
  private async nameConversation(
    userId: string,
    conversationId: string,
    first: string,
    hosted: HostedTurn,
  ): Promise<void> {
    try {
      const title = await hosted.title(first);
      if (title) await this.conversas.titularSeProvisorio(userId, conversationId, first, title);
    } catch (erro) {
      this.logger.warn(`Falha ao nomear a conversa: ${(erro as Error).name}`);
    }
  }

  /**
   * Persiste a resposta e lança o custo no livro-caixa.
   *
   * Erro aqui não derruba o turno: a resposta já foi lida pela pessoa, e um 500
   * depois de 200 não existe. Fica no log — sem o conteúdo, só o nome do erro.
   */
  private async recordTurn(
    userId: string,
    conversationId: string,
    turno: TurnSummary,
    hosted: HostedTurn,
  ): Promise<string | null> {
    let linha: string | null = null;
    try {
      linha = await this.conversas.completeTurn(userId, conversationId, {
        texto: turno.texto,
        tools: turno.tools,
        status: turno.status,
        pausa: turno.pausa,
        runId: turno.runId,
        ...(turno.durationMs !== undefined ? { durationMs: turno.durationMs } : {}),
        ...(turno.ttftMs !== undefined ? { ttftMs: turno.ttftMs } : {}),
        ...sumTurnUsage(turno.usoPorModelo),
        toolCalls: turno.toolCalls,
        toolResults: turno.toolResults,
        artifacts: turno.artifacts,
      });
    } catch (erro) {
      this.logger.error(`Falha ao gravar a resposta do chat: ${(erro as Error).name}`);
    }
    // Sempre, inclusive quando o stream quebrou: o dinheiro já saiu.
    await hosted.finish(turno.usoPorModelo);
    return linha;
  }
}

/**
 * O turno que a pessoa parou é `stopped`, e não `error`, com o que já tinha chegado.
 *
 * Só quando o `done` **não** chegou: um turno que terminou do lado do agente —
 * inclusive com erro do provedor — antes do pedido de parar continua como estava.
 * Fechar a aba ou a rede cair **não** param mais o turno (ADR 035).
 */
export function markStoppedWhenRequested(
  summary: TurnSummary,
  stopRequested: boolean,
): TurnSummary {
  if (!stopRequested || summary.sawDone) return summary;
  return { ...summary, status: 'stopped' };
}

/**
 * O consumo do turno somado entre os modelos, para a tela — ou nada, se alguma
 * parte não foi medida. Mesma regra do `somarUnidade`: um total parcial com cara
 * de medido é pior que a ausência.
 */
export function sumTurnUsage(usoPorModelo: TurnSummary['usoPorModelo']): {
  usage?: { inputUnits: number; outputUnits: number };
} {
  if (usoPorModelo.size === 0) return {};
  let inputUnits = 0;
  let outputUnits = 0;
  for (const unidades of usoPorModelo.values()) {
    if (unidades.inputUnits === undefined || unidades.outputUnits === undefined) return {};
    inputUnits += unidades.inputUnits;
    outputUnits += unidades.outputUnits;
  }
  return { usage: { inputUnits, outputUnits } };
}

/**
 * As fotos do turno sem metadados, **de novo**.
 *
 * O PWA já recodifica a foto no aparelho, o que tira o EXIF antes de ela sair
 * (ADR 020). Esta segunda passada é para o cliente que não fez isso — versão
 * antiga, `curl` de quem tem token —, pelo mesmo motivo de `strip-exif.ts`: a
 * garantia não pode depender de quem chama.
 */
export function fotosDoTurno(fotos: ChatPhotoDto[]): { mediaType: 'image/jpeg'; data: string }[] {
  return fotos.map((foto) => {
    const bytes = Buffer.from(foto.data, 'base64');
    if (bytes.length === 0) throw new BadRequestException('A foto veio vazia.');
    if (bytes.length > TETO_DA_FOTO_DO_CHAT) {
      throw new PayloadTooLargeException(
        `A foto tem ${bytes.length} bytes e o limite é ${TETO_DA_FOTO_DO_CHAT}. Reduza a resolução.`,
      );
    }
    try {
      return { mediaType: 'image/jpeg', data: removerMetadadosDoJpeg(bytes).toString('base64') };
    } catch (erro) {
      if (erro instanceof NaoEhJpegError)
        throw new BadRequestException('A foto precisa ser um JPEG.');
      throw erro;
    }
  });
}

/**
 * O aviso de resposta pronta (Fase 9e). Texto fixo, sem nada da conversa: ele
 * aparece na tela bloqueada, e o chat é dado de saúde em prosa. Erro não avisa —
 * quem volta vê o erro na conversa.
 */
export function chatReadyNotice(
  conversationId: string,
  status: TurnSummary['status'],
): Notice | null {
  if (status !== 'completed' && status !== 'interrupted') return null;
  return {
    kind: 'CHAT',
    title: 'Fatia',
    body:
      status === 'interrupted'
        ? 'O assistente precisa da sua confirmação para continuar.'
        : 'Sua resposta está pronta.',
    url: `/chat/${conversationId}`,
  };
}
