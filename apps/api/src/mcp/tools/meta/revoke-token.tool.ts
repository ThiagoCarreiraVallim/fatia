// apps/api/src/mcp/tools/meta/revoke-token.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTokenService } from '../../mcp-token.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../tool.decorator';

@Injectable()
@McpTool()
export class RevokeTokenTool implements McpToolDef {
  constructor(private readonly tokens: McpTokenService) {}
  readonly name = 'revoke_token';
  readonly description = 'Revoga um token MCP do usuário.';
  readonly inputSchema = { id: z.string().uuid() } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.tokens.revoke(userId, id);
    return { revoked: id };
  }
}
