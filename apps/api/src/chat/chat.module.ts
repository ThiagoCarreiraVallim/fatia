import { Module } from '@nestjs/common';
import { AiUsageService } from '../ai/ai-usage.service';
import { AgentChatClient } from './agent-chat.client';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatThrottlerGuard } from './chat-throttler.guard';
import { ConversationService } from './conversation.service';

/**
 * Chat com a IA hospedada (#249).
 *
 * Sem tool MCP: o Claude do próprio usuário já conversa com ele: o que falta e
 * esta épica entrega é o caminho hospedado, para quem não tem Claude. Expor
 * "conversar com o chat" como tool do MCP seria o produto chamando a si mesmo, e
 * gastando a inferência que a Fatia paga para responder a um modelo que o usuário
 * já está pagando.
 */
@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    ConversationService,
    AgentChatClient,
    ChatThrottlerGuard,
    AiUsageService,
  ],
  exports: [ConversationService],
})
export class ChatModule {}
