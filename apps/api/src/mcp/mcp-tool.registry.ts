// apps/api/src/mcp/mcp-tool.registry.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  MCP_TOOL_METADATA,
  type McpToolContext,
  type McpToolDef,
} from '../common/decorators/tool.decorator';

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

@Injectable()
export class McpToolRegistry implements OnModuleInit {
  private readonly logger = new Logger(McpToolRegistry.name);
  private tools: McpToolDef[] = [];

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit() {
    const providers = this.discovery.getProviders();
    this.tools = providers
      .filter((wrapper) => wrapper.metatype && wrapper.instance)
      .filter((wrapper) => Reflect.getMetadata(MCP_TOOL_METADATA, wrapper.metatype as object))
      .map((wrapper) => wrapper.instance as McpToolDef);

    const names = this.tools.map((t) => t.name).sort();
    const dups = names.filter((n, i) => names.indexOf(n) !== i);
    if (dups.length > 0) {
      throw new Error(`Duplicate MCP tool names: ${dups.join(', ')}`);
    }
    this.logger.log(`Discovered ${this.tools.length} MCP tools: ${names.join(', ')}`);
  }

  bindAll(server: McpServer, ctx: McpToolContext): void {
    for (const tool of this.tools) {
      // O type signature de registerTool gera type-instantiation explosivo;
      // contornamos com cast localizado (mesmo padrão do registry antigo).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server as any).registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (input: any) => {
          const start = Date.now();
          try {
            const data = await tool.execute(input, ctx);
            this.logger.log({
              tool: tool.name,
              userId: ctx.userId,
              durationMs: Date.now() - start,
              success: true,
            });
            return ok(data);
          } catch (err) {
            this.logger.error({
              tool: tool.name,
              userId: ctx.userId,
              durationMs: Date.now() - start,
              success: false,
              error: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        },
      );
    }
  }
}
