// apps/api/src/mcp/tools/meta/list-my-tokens.tool.ts
import { Injectable } from '@nestjs/common';
import { McpTokenService } from '../../mcp-token.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListMyTokensTool implements McpToolDef {
  constructor(private readonly tokens: McpTokenService) {}
  readonly name = 'list_my_tokens';
  readonly description = 'Lista os tokens MCP ativos do usuário.';
  readonly inputSchema = {} as const;
  execute(_input: unknown, { userId }: McpToolContext) {
    return this.tokens.list(userId);
  }
}
