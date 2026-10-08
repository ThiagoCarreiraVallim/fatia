import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DiscoveryService } from '@nestjs/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  MCP_TOOL_METADATA,
  type McpSurface,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';
import type { McpMetricsService } from '../../../observability/mcp-metrics.service';
import type { SuperficieDeIntencao } from '../../intent/superficie';
import { McpToolRegistry } from '../../mcp-tool.registry';

/**
 * O `tools/list` que o `/mcp` serve numa superfície, montado em processo pelo
 * `McpToolRegistry` de verdade sobre todas as tools do código.
 *
 * Em processo, e não pela rede, para não depender do Logto; pelo registry e pelo servidor MCP
 * de verdade, e não lendo o contrato, porque é o JSON Schema convertido e anunciado que o
 * modelo lê. A medição contra a API real é a do runner (`run_fronteira medir`), e as duas
 * dão o mesmo `sha256` — é o que `superficie.spec.ts` confere contra o número publicado.
 */

const API_SRC = resolve(__dirname, '../../..');

export function carregarTools(): McpToolDef[] {
  const tools: McpToolDef[] = [];
  const arquivos = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.tool.ts'))
    .sort();
  for (const arquivo of arquivos) {
    const mod = require(join(API_SRC, arquivo)) as Record<string, unknown>;
    for (const exportado of Object.values(mod)) {
      if (typeof exportado !== 'function') continue;
      if (!Reflect.getMetadata(MCP_TOOL_METADATA, exportado)) continue;
      const Ctor = exportado as new (...args: never[]) => McpToolDef;
      tools.push(new Ctor(...(Array.from({ length: Ctor.length }) as never[])));
    }
  }
  return tools;
}

export interface ToolServida {
  name: string;
  title?: string;
  description: string;
  inputSchema: { properties?: Record<string, unknown>; [k: string]: unknown };
  annotations: Record<string, unknown>;
}

/** O registry de verdade, com as tools do código e a superfície de intenção ligada. */
export function registryDeTeste(tools: McpToolDef[] = carregarTools()): McpToolRegistry {
  const discovery = {
    getProviders: () => tools.map((instance) => ({ metatype: instance.constructor, instance })),
  } as unknown as DiscoveryService;
  const metrics = { record: () => undefined } as unknown as McpMetricsService;
  const intencao = { habilitada: () => true } as unknown as SuperficieDeIntencao;
  const registry = new McpToolRegistry(discovery, metrics, intencao);
  registry.onModuleInit();
  return registry;
}

/**
 * O `tools/list` cru. O cliente do SDK valida a resposta e descarta o que a spec não conhece
 * nas anotações — o `confirmableHint` entre eles —, e o agente lê o JSON cru. Por isso o
 * pedido vai com um schema que aceita tudo.
 */
export async function catalogoServido(
  superficie: McpSurface,
  registry: McpToolRegistry = registryDeTeste(),
): Promise<ToolServida[]> {
  const server = new McpServer(
    { name: 'fatia-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registry.bindAll(server, { userId: 'catalogo', timezone: 'America/Sao_Paulo' }, superficie);
  const [lado, outro] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'catalogo-servido', version: '0' });
  await Promise.all([server.connect(lado), client.connect(outro)]);
  try {
    // Cast localizado: o genérico de `request` sobre um schema Zod estoura a instanciação de
    // tipos (TS2589), o mesmo motivo do cast em `mcp-tool.registry.ts`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { tools } = (await (client as any).request(
      { method: 'tools/list', params: {} },
      z.object({ tools: z.array(z.any()) }).passthrough(),
    )) as { tools: unknown[] };
    return tools as ToolServida[];
  } finally {
    await client.close();
    await server.close();
  }
}
