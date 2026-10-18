import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AiAccessService } from '../ai/ai-access.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ChatThrottlerGuard } from './chat-throttler.guard';
import { AgentChatClient } from './agent-chat.client';
import { ChatService, type DestinoDoStream } from './chat.service';
import { ChatRunRegistry } from './chat-run.registry';
import { CheckpointPurgeService } from './checkpoint-purge.service';
import { ConversationService } from './conversation.service';
import { MemoryService } from './memory/memory.service';
import { PreviaDaAcaoService } from './previa/previa-da-acao.service';
import { GroupAgentService } from '../sharing/group-agent.service';
import { McpToolRegistry } from '../mcp/mcp-tool.registry';
import {
  ChatActionPreviewDto,
  ListConversationsQueryDto,
  MessageFeedbackDto,
  RenameConversationDto,
  SendChatMessageDto,
} from './dto/chat.dto';

/**
 * A fronteira de autenticação do chat (#249).
 *
 * O PWA chega aqui já autenticado pelo guard global; o Bearer que ele usou é o
 * mesmo que segue para o agente, que por sua vez o usa no `/mcp`. Toda a corrente
 * carrega **uma** identidade, e ela nunca vem do corpo da requisição.
 */

/**
 * Turnos por minuto e por usuário.
 *
 * Doze é mais que o dobro do que uma conversa humana produz — quem escreve,
 * espera a resposta chegar token a token e lê antes de responder não passa de
 * cinco. O que este número corta é o laço, e ele corta nos primeiros segundos.
 */
const TETO_DE_TURNOS = 12;
const TETO_DE_TURNOS_MS = 60_000;
/** Cada cartão pede um resumo, e um F5 pede de novo: folga sobre os turnos. */
const TETO_DE_PREVIAS = 60;

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly conversas: ConversationService,
    private readonly agent: AgentChatClient,
    private readonly checkpoints: CheckpointPurgeService,
    private readonly memorias: MemoryService,
    private readonly uso: AiUsageService,
    private readonly acesso: AiAccessService,
    private readonly previas: PreviaDaAcaoService,
    private readonly runs: ChatRunRegistry,
    private readonly agentes: GroupAgentService,
    private readonly registry: McpToolRegistry,
  ) {}

  /**
   * Nome de tool → título em português. O stream anuncia o mesmo no `catalog`,
   * mas só no turno ao vivo: depois de recarregar, a tela rotularia as tools do
   * histórico pelo nome técnico.
   */
  @Get('tools')
  titulosDasTools() {
    return this.registry.titulos();
  }

  /** O cartão de confirmação em português: o que a escrita pausada vai fazer. */
  @Post('preview')
  @HttpCode(200)
  @UseGuards(ChatThrottlerGuard)
  @Throttle({ default: { ttl: TETO_DE_TURNOS_MS, limit: TETO_DE_PREVIAS } })
  previa(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatActionPreviewDto) {
    return this.previas.previa(user, dto.tool, dto.arguments);
  }

  /**
   * Se a aba de chat deve existir nesta instância.
   *
   * Mesma razão do `photo-recognition` da #139: uma funcionalidade que sempre
   * falha é pior que uma que não aparece. Instância auto-hospedada sem agente
   * continua um produto inteiro.
   *
   * `available` é da instância; `allowed`/`reason` são desta pessoa (ADR 024):
   * no Free a aba aparece com cadeado e leva ao "Meu plano".
   */
  @Get('availability')
  async availability(@CurrentUser() user: CurrentUserPayload) {
    const available = this.agent.configurado();
    const { fotos, ditado } = available
      ? await this.agent.capacidades()
      : { fotos: false, ditado: false };
    const { allowed, reason } = await this.acesso.motivo(user.id, available);
    return { available, photos: fotos, dictation: ditado, allowed, reason };
  }

  /**
   * O ditado do composer. O corpo é o áudio cru (`audio/*`), com parser próprio
   * só nesta rota — ver `corpos-do-chat.ts`.
   */
  @Post('transcribe')
  @UseGuards(ChatThrottlerGuard)
  @Throttle({ default: { ttl: TETO_DE_TURNOS_MS, limit: TETO_DE_TURNOS } })
  @HttpCode(200)
  transcrever(@CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    // Sem `audio/*` o parser da rota não roda e o corpo não é `Buffer`.
    if (!Buffer.isBuffer(req.body)) {
      throw new UnsupportedMediaTypeException('Envie o áudio cru, com Content-Type audio/*.');
    }
    return this.chat.transcrever(user.id, req.body, req.headers['content-type'] ?? '');
  }

  @Get('conversations')
  listConversations(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversas.listar(user.id, query.q);
  }

  /** Os agentes que a pessoa pode escolher numa conversa nova (Fase 7c), e o padrão. */
  @Get('agents')
  agents(@CurrentUser() user: CurrentUserPayload) {
    return this.chat.agents(user.id);
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const conversa = await this.conversas.obterComMensagens(user.id, id);
    return {
      ...conversa,
      agent: await this.agentes.headerFor(user.id, conversa.agentGroupId),
      // Uma resposta ainda correndo no servidor: a tela assina o `live` em vez de
      // mostrar o histórico parado (ADR 035).
      running: this.runs.isRunning(user.id, id),
    };
  }

  /**
   * A resposta em andamento desta conversa, como SSE: reenvia o que veio
   * depois de `after` (ou do `Last-Event-ID`) e segue ao vivo até o fim.
   *
   * 204 quando nada está rodando — inclusive no minuto seguinte ao fim, se o
   * cursor já passou do último evento. Conversa alheia é 404, como em todo o
   * resto do chat.
   */
  @Get('conversations/:id/live')
  async live(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('after') after: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.conversas.assertDaPessoa(user.id, id);
    const run = this.runs.find(user.id, id);
    const desde = parseCursor(after ?? req.headers['last-event-id']);
    if (!run || (run.done && run.lastSeq <= desde)) {
      res.status(204).end();
      return;
    }
    const destino = destinoSse(res);
    destino.escrever(': aberto\n\n');
    const sair = run.subscribe(desde, {
      write: (texto) => destino.escrever(texto),
      end: () => destino.fim(),
    });
    destino.aoFechar(sair);
  }

  /** Para a resposta em andamento. 204 mesmo sem resposta rodando: o efeito pedido já vale. */
  @Post('conversations/:id/stop')
  @HttpCode(204)
  async stop(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.conversas.assertDaPessoa(user.id, id);
    this.chat.stop(user.id, id);
  }

  @Patch('conversations/:id')
  renameConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameConversationDto,
  ) {
    return this.conversas.renomear(user.id, id, dto.title);
  }

  /**
   * Apaga a conversa **e** o estado que o agente guardou dela (ADR 023).
   *
   * Nessa ordem: a conversa sai primeiro porque é ela que prova de quem é o id
   * (`assertDaPessoa`); a purga usa o mesmo par depois. Se a purga falhar, o
   * checkpoint órfão não é alcançável por ninguém — a thread só abre com o dono
   * e uma conversa que já não existe —, mas o erro sobe para ser visto.
   */
  @Delete('conversations/:id')
  @HttpCode(204)
  async deleteConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.conversas.apagar(user.id, id);
    await this.checkpoints.apagarConversa(user.id, id);
  }

  /** Quanto da cota diária de IA desta pessoa já foi — o medidor da tela do chat. */
  @Get('quota')
  quota(@CurrentUser() user: CurrentUserPayload) {
    return this.uso.cotaDoUsuario(user.id);
  }

  /** O que o assistente guardou sobre a pessoa. A mesma lista que `list_memories` devolve. */
  @Get('memories')
  listMemories(@CurrentUser() user: CurrentUserPayload) {
    return this.memorias.listar(user.id);
  }

  @Delete('memories/:id')
  @HttpCode(204)
  async forgetMemory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.memorias.esquecer(user.id, id);
  }

  @Patch('conversations/:id/messages/:messageId/feedback')
  @HttpCode(204)
  async feedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: MessageFeedbackDto,
  ) {
    const runId = await this.conversas.vote(user.id, id, messageId, dto);
    // Espelho no Langfuse, sem esperar: o voto já está gravado aqui.
    if (runId) void this.agent.sendFeedback(runId, dto.review, dto.reasons ?? []);
  }

  /**
   * Um turno de conversa, respondido como `text/event-stream`.
   *
   * `@Res()` (e não o suporte a `Observable` do Nest) porque o repasse aqui é de
   * **bytes**, não de objetos: o que o agente emitiu tem de chegar ao PWA como
   * saiu, sem uma serialização no meio que reescreva o envelope e sem uma fila
   * que junte pedaços. Ver `ChatService.converse`.
   */
  @Post()
  @UseGuards(ChatThrottlerGuard)
  @Throttle({ default: { ttl: TETO_DE_TURNOS_MS, limit: TETO_DE_TURNOS } })
  async enviarMensagem(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SendChatMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const bearer = extrairBearer(req);
    if (!bearer) {
      // Inalcançável com o guard global no lugar; explícito porque um dia alguém
      // marca esta rota como `@Public()` e o agente receberia `Bearer undefined`.
      throw new UnauthorizedException('Missing bearer token');
    }

    await this.chat.converse(user, dto, bearer, destinoSse(res));
  }
}

/** O cursor do `live`: o último evento que o cliente já tem. Inválido é "nenhum". */
function parseCursor(bruto: string | string[] | undefined): number {
  const valor = Number(Array.isArray(bruto) ? bruto[0] : bruto);
  return Number.isInteger(valor) && valor > 0 ? valor : 0;
}

function extrairBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return null;
}

/**
 * O `Response` do express como destino de stream.
 *
 * **O cabeçalho sai no primeiro `escrever`, e não na criação do destino.** É o
 * que preserva a promessa do `ChatService`: enquanto nenhum byte saiu, uma
 * exceção ainda vira 429/503/504 com corpo JSON, que é o que o cliente precisa
 * para distinguir cota estourada de agente fora do ar. Mandando o `200` já na
 * montagem, toda falha viraria um stream vazio.
 *
 * Os cabeçalhos importam tanto quanto o `write`: `no-transform` proíbe
 * intermediário de recomprimir (recomprimir implica juntar), e `X-Accel-Buffering:
 * no` desliga o buffer do nginx, que por padrão segura a resposta em blocos e
 * entregaria o chat inteiro de uma vez — o sintoma exato que a épica manda evitar,
 * e invisível em desenvolvimento porque lá não há proxy reverso.
 *
 * `flushHeaders()` empurra o cabeçalho na hora, sem esperar o corpo encher.
 */
function destinoSse(res: Response): DestinoDoStream {
  let abriu = false;
  const abrir = () => {
    if (abriu) return;
    abriu = true;
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  };

  return {
    escrever(pedaco) {
      // Escrever depois que o cliente sumiu não é erro nosso — é a corrida normal
      // entre o `close` e o pedaço que já estava a caminho.
      if (res.writableEnded || res.destroyed) return;
      abrir();
      res.write(pedaco);
    },
    fim() {
      if (res.writableEnded || res.destroyed) return;
      abrir();
      res.end();
    },
    aoFechar(callback) {
      res.on('close', callback);
    },
  };
}
