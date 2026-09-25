import type { DiscoveryService } from '@nestjs/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MCP_TOOL_METADATA, type McpToolDef } from '../../common/decorators/tool.decorator';
import { McpToolRegistry } from '../mcp-tool.registry';
import type { McpMetricsService } from '../../observability/mcp-metrics.service';
import { ListMealsTool } from '../../nutrition/mcp/list-meals.tool';
import { GetTodaySummaryTool } from '../../progress/mcp/get-today-summary.tool';
import { GetWeightProgressTool } from '../../progress/mcp/get-weight-progress.tool';

/**
 * O `structuredContent` que o agente repassa à tela como artefato.
 *
 * O campo que cada formato exige é o mesmo de `CAMPO_OBRIGATORIO` em
 * `apps/agent/.../chat/artefatos.py`: carga sem ele é descartada lá, em
 * silêncio, e o cartão simplesmente não aparece.
 */
const CAMPO_OBRIGATORIO = { report: 'columns', metric: 'value', timeline: 'events' } as const;

type Handler = (input: unknown) => Promise<{
  content: Array<{ text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

function registrar(tool: McpToolDef) {
  class Marcada {}
  Reflect.defineMetadata(MCP_TOOL_METADATA, true, Marcada);
  const discovery = {
    getProviders: () => [{ metatype: Marcada, instance: tool }],
  } as unknown as DiscoveryService;
  const metrics = { record: jest.fn() } as unknown as McpMetricsService;
  const registry = new McpToolRegistry(discovery, metrics);
  registry.onModuleInit();

  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (nome: string, _meta: unknown, handler: Handler) => handlers.set(nome, handler),
  } as unknown as McpServer;
  registry.bindAll(server, { userId: 'u1', timezone: 'America/Sao_Paulo' });
  return handlers.get(tool.name)!;
}

const tool = (parcial: Partial<McpToolDef>): McpToolDef =>
  ({
    name: 'get_coisa',
    title: 'Coisa',
    annotations: { readOnlyHint: true, destructiveHint: false },
    hostedInference: false,
    description: 'Lê a coisa.',
    inputSchema: {},
    execute: async () => ({ total: 3 }),
    ...parcial,
  }) as McpToolDef;

describe('McpToolRegistry — artefato', () => {
  it('publica o artefato em structuredContent, sem mexer no texto que o modelo lê', async () => {
    const handler = registrar(
      tool({
        artifact: (dados) => ({ kind: 'metric', value: (dados as { total: number }).total }),
      }),
    );

    const resultado = await handler({});

    expect(JSON.parse(resultado.content[0].text)).toEqual({ total: 3 });
    expect(resultado.structuredContent).toEqual({ kind: 'metric', value: 3 });
  });

  it('tool sem artefato não ganha structuredContent', async () => {
    const resultado = await registrar(tool({}))({});
    expect(resultado).not.toHaveProperty('structuredContent');
  });

  it('artefato que quebra não derruba a tool', async () => {
    const handler = registrar(
      tool({
        artifact: () => {
          throw new Error('formato novo que ninguém previu');
        },
      }),
    );

    const resultado = await handler({});

    expect(resultado.isError).toBeUndefined();
    expect(JSON.parse(resultado.content[0].text)).toEqual({ total: 3 });
    expect(resultado).not.toHaveProperty('structuredContent');
  });
});

describe('artefatos das tools de leitura', () => {
  const temOCampo = (carga: Record<string, unknown> | null | undefined) => {
    const kind = carga?.kind as keyof typeof CAMPO_OBRIGATORIO;
    expect(Object.keys(CAMPO_OBRIGATORIO)).toContain(kind);
    expect(carga).toHaveProperty(CAMPO_OBRIGATORIO[kind]);
  };

  it('list_meals vira tabela com kcal e proteína somadas por refeição', () => {
    const carga = new ListMealsTool(undefined as never).artifact([
      {
        mealType: 'LUNCH',
        eatenAt: new Date('2026-09-24T15:00:00.000Z'),
        items: [
          { kcal: 200.4, proteinG: 4.2 },
          { kcal: 150.3, proteinG: 30.1 },
        ],
      },
    ]);

    temOCampo(carga);
    expect(carga.rows).toEqual([['LUNCH', '2026-09-24T15:00:00.000Z', 351, 34]]);
  });

  it('lista vazia de refeições ainda é tabela, e não cartão sumido', () => {
    const carga = new ListMealsTool(undefined as never).artifact([]);
    temOCampo(carga);
    expect(carga.rows).toEqual([]);
  });

  it('get_today_summary vira métrica, com meta só quando há meta', () => {
    const hoje = (goals: unknown) =>
      ({
        nutrition: { consumed: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, goals },
      }) as never;
    const semMeta = new GetTodaySummaryTool(undefined as never).artifact(hoje(null));
    const comMeta = new GetTodaySummaryTool(undefined as never).artifact(
      hoje({ kcalMin: 1800, kcalMax: 2200 }),
    );

    temOCampo(semMeta);
    expect(semMeta.value).toBe(0);
    expect(semMeta).not.toHaveProperty('target');
    expect(comMeta.target).toEqual({ min: 1800, max: 2200 });
  });

  it('get_weight_progress vira linha do tempo', () => {
    const carga = new GetWeightProgressTool(undefined as never).artifact(
      {
        totalDeltaKg: -1.2,
        points: [
          { date: '2026-09-01', weightKg: 80 },
          { date: '2026-09-20', weightKg: 78.8 },
        ],
      } as never,
      { days: 30 },
    );

    temOCampo(carga);
    expect(carga.events).toEqual([
      { date: '2026-09-01', value: 80 },
      { date: '2026-09-20', value: 78.8 },
    ]);
  });
});
