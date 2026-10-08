// apps/api/src/mcp/mcp-tool.registry.ts
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  MCP_TOOL_METADATA,
  type McpSurface,
  type McpToolContext,
  type McpToolDef,
} from '../common/decorators/tool.decorator';
import { servidaNa, SuperficieDeIntencao } from './intent/superficie';
import { formatToolError } from './mcp-error';
import { McpMetricsService } from '../observability/mcp-metrics.service';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const ok = (data: unknown, artefato?: Record<string, unknown> | null): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  ...(artefato ? { structuredContent: artefato } : {}),
});

/**
 * O artefato é enfeite de tela: um defeito nele não pode derrubar a tool, cujo
 * texto é o que o modelo lê para responder.
 */
function artefatoDe(tool: McpToolDef, data: unknown, input: unknown) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tool.artifact?.(data, input as any) ?? null;
  } catch {
    return null;
  }
}

const fail = (text: string): ToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

@Injectable()
export class McpToolRegistry implements OnModuleInit {
  private readonly logger = new Logger(McpToolRegistry.name);
  private tools: McpToolDef[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metrics: McpMetricsService,
    // Opcional: sem ela, a superfície de intenção está desligada — é o que vale para quem
    // monta o registry à mão, como os specs.
    @Optional() private readonly intencao?: SuperficieDeIntencao,
  ) {}

  /** A superfície de intenção pode ser servida nesta instância? Ver `SuperficieDeIntencao`. */
  intencaoHabilitada(): boolean {
    return this.intencao?.habilitada() ?? false;
  }

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

  /**
   * Só a superfície de entidade: é a que o chat hospedado e a prévia da ação usam. Uma tool
   * de intenção nunca é o que o produto executa.
   */
  buscar(nome: string): McpToolDef | undefined {
    return this.tools.find((tool) => tool.name === nome && servidaNa(tool, 'entidade'));
  }

  /** Nome → título em português, o mesmo que o `tools/list` de entidade anuncia. */
  titulos(): Record<string, string> {
    return Object.fromEntries(
      this.tools.filter((tool) => servidaNa(tool, 'entidade')).map((t) => [t.name, t.title]),
    );
  }

  /**
   * Registra no servidor da requisição as tools da `superficie` pedida. É o mesmo ponto em
   * que só entra o que a pessoa pode chamar: tool fora do recorte não existe para o modelo.
   */
  bindAll(server: McpServer, ctx: McpToolContext, superficie: McpSurface = 'entidade'): void {
    if (superficie === 'intencao' && !this.intencaoHabilitada()) {
      throw new Error('Superfície de intenção pedida com MCP_SUPERFICIE_INTENCAO desligada.');
    }
    for (const tool of this.tools.filter((t) => servidaNa(t, superficie))) {
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
            const durationMs = Date.now() - start;
            this.logger.log({ tool: tool.name, userId: ctx.userId, durationMs, success: true });
            // A métrica repete o log de propósito, sem o `userId`: ela é o que sobrevive semanas
            // agregada, e rótulo por usuário explodiria a cardinalidade do Prometheus.
            this.metrics.record({ tool: tool.name, durationMs, success: true });
            return ok(data, artefatoDe(tool, data, input));
          } catch (err) {
            const { category, text } = formatToolError(err);
            const durationMs = Date.now() - start;
            this.logger.error({
              tool: tool.name,
              userId: ctx.userId,
              durationMs,
              success: false,
              category,
              error: err instanceof Error ? err.message : String(err),
            });
            this.metrics.record({
              tool: tool.name,
              durationMs,
              success: false,
              errorCategory: category,
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
