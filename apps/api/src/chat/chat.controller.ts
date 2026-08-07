import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ChatThrottlerGuard } from './chat-throttler.guard';
import { AgentChatClient } from './agent-chat.client';
import { ChatService, type DestinoDoStream } from './chat.service';
import { ConversationService } from './conversation.service';
import { SendChatMessageDto } from './dto/chat.dto';

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

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly conversas: ConversationService,
    private readonly agent: AgentChatClient,
  ) {}

  /**
   * Se a aba de chat deve existir nesta instância.
   *
   * Mesma razão do `photo-recognition` da #139: uma funcionalidade que sempre
   * falha é pior que uma que não aparece. Instância auto-hospedada sem agente
   * continua um produto inteiro.
   */
  @Get('availability')
  availability() {
    return { available: this.agent.configurado() };
  }

  @Get('conversations')
  listConversations(@CurrentUser() user: CurrentUserPayload) {
    return this.conversas.listar(user.id);
  }

  @Get('conversations/:id')
  getConversation(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversas.obterComMensagens(user.id, id);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  async deleteConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.conversas.apagar(user.id, id);
  }

  /**
   * Um turno de conversa, respondido como `text/event-stream`.
   *
   * `@Res()` (e não o suporte a `Observable` do Nest) porque o repasse aqui é de
   * **bytes**, não de objetos: o que o agente emitiu tem de chegar ao PWA como
   * saiu, sem uma serialização no meio que reescreva o envelope e sem uma fila
   * que junte pedaços. Ver `ChatService.conversar`.
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

    await this.chat.conversar(user, dto, bearer, destinoSse(res));
  }
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
