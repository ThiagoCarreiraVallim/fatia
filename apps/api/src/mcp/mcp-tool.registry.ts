// apps/api/src/mcp/mcp-tool.registry.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  MCP_TOOL_METADATA,
  type McpToolContext,
  type McpToolDef,
} from '../common/decorators/tool.decorator';
import { formatToolError } from './mcp-error';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

const fail = (text: string): ToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
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
        {
          title: tool.title,
          description: tool.description,
          annotations: { title: tool.title, ...tool.annotations },
          inputSchema: tool.inputSchema,
        },
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
            const { category, text } = formatToolError(err);
            this.logger.error({
              tool: tool.name,
              userId: ctx.userId,
              durationMs: Date.now() - start,
              success: false,
              category,
              error: err instanceof Error ? err.message : String(err),
            });
            // Erro de execução volta como resultado `isError`, não como erro de
            // protocolo: o Claude precisa ler a categoria e a dica para se
            // recuperar sozinho. INTERNAL é a exceção — não há o que corrigir do
            // lado do cliente, então propagamos.
            if (category === 'INTERNAL') throw err;
            return fail(text);
          }
        },
      );
    }
  }
}
