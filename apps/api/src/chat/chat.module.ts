import { Module } from '@nestjs/common';
import { AiUsageService } from '../ai/ai-usage.service';
import { AgentChatClient } from './agent-chat.client';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatThrottlerGuard } from './chat-throttler.guard';
import { CheckpointPurgeService } from './checkpoint-purge.service';
import { ConversationService } from './conversation.service';
import { ForgetMemoryTool } from './memory/mcp/forget-memory.tool';
import { ListMemoriesTool } from './memory/mcp/list-memories.tool';
import { SaveMemoryTool } from './memory/mcp/save-memory.tool';
import { MemoryService } from './memory/memory.service';
import { PreviaDaAcaoService } from './previa/previa-da-acao.service';
import { McpModule } from '../mcp/mcp.module';

/**
 * Chat com a IA hospedada (#249).
 *
 * "Conversar com o chat" não é tool MCP: o Claude do próprio usuário já conversa
 * com ele, e expor o chat como tool seria o produto chamando a si mesmo, gastando
 * a inferência que a Fatia paga para responder a um modelo que o usuário já paga.
 * As tools daqui são as de memória, que o chat hospedado e o Claude do usuário
 * usam igual.
 *
 * Importa o `McpModule` pelo registry: o resumo da ação no cartão de confirmação
 * valida os argumentos com o schema da própria tool (`previa/`).
 */
@Module({
  imports: [McpModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ConversationService,
    AgentChatClient,
    ChatThrottlerGuard,
    AiUsageService,
    CheckpointPurgeService,
    MemoryService,
    SaveMemoryTool,
    ForgetMemoryTool,
    ListMemoriesTool,
    PreviaDaAcaoService,
  ],
  exports: [ConversationService, CheckpointPurgeService],
})
export class ChatModule {}
