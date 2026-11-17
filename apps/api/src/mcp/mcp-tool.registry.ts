// apps/api/src/mcp/mcp-tool.registry.ts
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  MCP_TOOL_METADATA,
  type ChatAppOnly,
  type ChatCardFormat,
  type McpSurface,
  type McpToolContext,
  type McpToolDef,
} from '../common/decorators/tool.decorator';
import { servidaNa, SuperficieDeIntencao } from './intent/superficie';
import { formatToolError } from './mcp-error';
import { genericList, genericTable } from './generic-card';
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
function artefatoDe(
  tool: McpToolDef,
  data: unknown,
  input: unknown,
): Record<string, unknown> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (tool.artifact) return tool.artifact(data, input as any);
    // A Tabela é o formato padrão (#384): quem não monta o próprio cartão ganha o genérico. A
    // Lista também tem genérico; os outros formatos só existem com produtor próprio.
    if (tool.card === 'report') return genericTable(data) as Record<string, unknown> | null;
    if (tool.card === 'list') return genericList(data) as Record<string, unknown> | null;
    return null;
  } catch {
    return null;
  }
}

/** Como uma tool aparece na conversa (#384, prancha IA-Ferramentas). */
export interface ChatToolCatalogEntry {
  title: string;
  /** `read` responde na hora; `confirm` pede o sim; `app_only` a IA nunca faz e leva à tela. */
  kind: 'read' | 'confirm' | 'app_only';
  card?: ChatCardFormat;
  appOnly?: ChatAppOnly;
}

/**
 * Quem executa a gravação automática (ADR 039, #385): o `AutoWriteService` do chat, que se
 * registra aqui ao subir. Pela inversão, e não por import, porque o chat já importa este módulo.
 */
export interface McpAutoWriter {
  run(
    tool: McpToolDef,
    input: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<{ data: unknown; artifact: Record<string, unknown> }>;
  /** O que a chamada `toolCallId` gravou; erro se não gravou. Nunca executa (#385). */
  lookup(
    userId: string,
    conversationId: string,
    toolCallId: string,
  ): Promise<{ data: unknown; artifact: Record<string, unknown> }>;
}

const fail = (text: string): ToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

@Injectable()
export class McpToolRegistry implements OnModuleInit {
  private readonly logger = new Logger(McpToolRegistry.name);
  private tools: McpToolDef[] = [];
  private autoWriter: McpAutoWriter | null = null;

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

  /** Registra quem executa a gravação automática. Ver `McpAutoWriter`. */
  useAutoWriter(writer: McpAutoWriter): void {
    this.autoWriter = writer;
  }

  /** As tools de entidade: o catálogo que o chat hospedado alcança. */
  entidades(): McpToolDef[] {
    return this.tools.filter((tool) => servidaNa(tool, 'entidade'));
  }

  /** Nome → título em português, o mesmo que o `tools/list` de entidade anuncia. */
  titulos(): Record<string, string> {
    return Object.fromEntries(
      this.tools.filter((tool) => servidaNa(tool, 'entidade')).map((t) => [t.name, t.title]),
    );
  }

  /**
   * O catálogo do chat hospedado: classe, cartão e tela de cada tool de entidade. A classe sai
   * das mesmas anotações de que o agente deriva as três camadas (`tool_policy.py`), e não de
   * uma lista à parte. Leitura sem `card` é Tabela, o padrão.
   */
  catalogoDoChat(): Record<string, ChatToolCatalogEntry> {
    const entradas = this.tools
      .filter((tool) => servidaNa(tool, 'entidade'))
      .map((tool): [string, ChatToolCatalogEntry] => {
        const a = tool.annotations;
        if (a.readOnlyHint === true) {
          return [tool.name, { title: tool.title, kind: 'read', card: tool.card }];
        }
        if (a.confirmableHint === true) {
          return [tool.name, { title: tool.title, kind: 'confirm', card: tool.card }];
        }
        return [
          tool.name,
          {
            title: tool.title,
            kind: 'app_only',
            ...(tool.appOnly ? { appOnly: tool.appOnly } : {}),
          },
        ];
      });
    return Object.fromEntries(entradas);
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
            // Gravação automática (ADR 039): só pelo `AutoWriteService`, que confere o modo, os
            // limites e tira o retrato. Sem ele registrado, recusa — nunca grava sem o Desfazer.
            if (ctx.autoWrite) {
              if (!this.autoWriter) throw new Error('Gravação automática sem executor registrado.');
              // A consulta do agente que perdeu a resposta num timeout: só lê, nunca grava de novo.
              const auto = ctx.autoWrite.lookup
                ? await this.autoWriter.lookup(
                    ctx.userId,
                    ctx.autoWrite.conversationId,
                    ctx.autoWrite.toolCallId,
                  )
                : await this.autoWriter.run(tool, input, ctx);
              this.metrics.record({
                tool: tool.name,
                durationMs: Date.now() - start,
                success: true,
              });
              return ok(auto.data, auto.artifact);
            }
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
