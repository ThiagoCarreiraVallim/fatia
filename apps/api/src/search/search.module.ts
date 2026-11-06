import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { BraveSearchService } from './brave-search.service';
import { SearchWebTool } from './mcp/search-web.tool';

/**
 * Busca na web do chat hospedado.
 *
 * Módulo sem controller: a capacidade existe **só** pelo MCP, e lá só para o
 * agente da Fatia (`agentOnly`). Uma rota REST daria à tela um jeito de gastar a
 * busca sem passar pelo recorte de tools do chat.
 */
@Module({
  imports: [AiModule],
  providers: [BraveSearchService, SearchWebTool],
  exports: [SearchWebTool],
})
export class SearchModule {}
