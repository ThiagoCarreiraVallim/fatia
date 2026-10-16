import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ForgetMemoryTool } from '../../chat/memory/mcp/forget-memory.tool';
import { ListMemoriesTool } from '../../chat/memory/mcp/list-memories.tool';
import { SaveMemoryTool } from '../../chat/memory/mcp/save-memory.tool';
import { MemoryService } from '../../chat/memory/memory.service';
import { CommonModule } from '../../common/common.module';
import type { McpSurface } from '../../common/decorators/tool.decorator';
import { PrismaService } from '../../common/prisma.service';
import { SharingModule } from '../../sharing/sharing.module';
import { McpModule } from '../mcp.module';
import { McpToolRegistry } from '../mcp-tool.registry';
import { catalogoServido } from './support/catalogo-servido';
import {
  apagarContaDeAvaliacao,
  garantirCatalogos,
  semearContaDeAvaliacao,
} from './support/conta-de-avaliacao';
import { fixarRelogio } from './support/modulo-de-tools';

/**
 * O exemplo de cada description, chamado como o agente o chamaria — `tools/call` no servidor
 * MCP de verdade, com o schema servido validando a entrada — contra o seed da conta de
 * avaliação, nas duas superfícies.
 *
 * O `tool-catalog.spec.ts` confere que o exemplo passa no schema; isto confere que ele
 * funciona. O exemplo do `record_meal` passava no schema e a tool recusava a refeição inteira,
 * porque nenhum dos dois nomes casava com o catálogo — e o modelo copia o exemplo.
 *
 * Exemplo que aponta um registro por id ou slug (um uuid, um `id`/`…Id` numérico, um `slug`)
 * não tem como conhecer o seed: ele pode receber a resposta do domínio sobre aquele registro —
 * não existe, é do catálogo e não se edita —, mas não erro de validação nem `INTERNAL`. Os
 * outros têm que dar certo.
 */

const LABEL = 'exemplos';
/** Uma quarta-feira, à tarde em Cuiabá — o mesmo agora do spec de equivalência. */
const NOW = new Date('2026-09-23T19:00:00Z');

const EXAMPLE_PREFIX = /Exemplo(?: \(([^)]*)\))?: (?=\{)/g;

interface Example {
  tool: string;
  label?: string;
  args: Record<string, unknown>;
}

/** Os exemplos de uma description; o JSON é lido até a chave que fecha o primeiro `{`. */
function examplesOf(tool: string, description: string): Example[] {
  return [...description.matchAll(EXAMPLE_PREFIX)].map((match) => {
    const start = match.index + match[0].length;
    let depth = 0;
    let inString = false;
    for (let i = start; i < description.length; i++) {
      const char = description[i];
      if (inString) {
        if (char === '\\') i++;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        return {
          tool,
          label: match[1],
          args: JSON.parse(description.slice(start, i + 1)) as Record<string, unknown>,
        };
      }
    }
    throw new Error(`${tool}: exemplo sem fim`);
  });
}

/** As tools cujo exemplo só faz sentido com um treino em andamento, como a description diz. */
const NEEDS_ACTIVE_SESSION = new Set(['finish_workout', 'record_sets']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Erro de validação do schema, do SDK, ou falha sem categoria de domínio. */
const MALFORMED = /^\[INTERNAL\]|-32602|Input validation error/;

/** O exemplo aponta um registro que só existe na conta de quem escreveu a description. */
function pointsAtRecord(value: unknown, key = ''): boolean {
  if (typeof value === 'string' && UUID.test(value)) return true;
  if (typeof value === 'number' && /(^id$|Id$)/.test(key)) return true;
  if (typeof value === 'string' && key === 'slug') return true;
  if (Array.isArray(value)) return value.some((v) => pointsAtRecord(v));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => pointsAtRecord(v, k));
  }
  return false;
}

describe('o exemplo de cada description funciona contra o seed da conta de avaliação', () => {
  const prisma = new PrismaService();
  let module: TestingModule;
  const examples: Record<McpSurface, Example[]> = { entidade: [], intencao: [] };

  beforeAll(async () => {
    process.env.MCP_SUPERFICIE_INTENCAO = '1';
    await garantirCatalogos(prisma);
    for (const surface of ['entidade', 'intencao'] as const) {
      examples[surface] = (await catalogoServido(surface)).flatMap((tool) =>
        examplesOf(tool.name, tool.description),
      );
    }
    // O registry de verdade, descobrindo as tools no container: o mesmo `bindAll` do `/mcp`.
    // As de memória vêm sem o `ChatModule`, que traria o agente junto.
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }]),
        CommonModule,
        SharingModule,
        McpModule,
      ],
      providers: [MemoryService, SaveMemoryTool, ForgetMemoryTool, ListMemoriesTool],
    }).compile();
    await module.init();
    fixarRelogio(NOW);
  }, 300_000);

  afterAll(async () => {
    jest.useRealTimers();
    delete process.env.MCP_SUPERFICIE_INTENCAO;
    await apagarContaDeAvaliacao(prisma, LABEL);
    await module.close();
    await prisma.$disconnect();
  });

  it('acha exemplos nas duas superfícies, incluindo o do record_meal', () => {
    expect(examples.entidade.length).toBeGreaterThan(40);
    expect(examples.intencao.map((e) => e.tool)).toContain('record_meal');
  });

  /** Um seed novo e um servidor MCP ligado a ele, na superfície pedida. */
  async function connect(surface: McpSurface, states: string[]) {
    const accounts = semearContaDeAvaliacao({ rotulo: LABEL, agora: NOW, estados: states });
    const server = new McpServer(
      { name: 'fatia-mcp', version: '0' },
      { capabilities: { tools: {} } },
    );
    module
      .get(McpToolRegistry)
      .bindAll(server, { userId: accounts.usuarioId, timezone: accounts.fuso }, surface);
    const [side, other] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'exemplos', version: '0' });
    await Promise.all([server.connect(side), client.connect(other)]);
    return {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  /** `undefined` se o exemplo funcionou; senão, o motivo. */
  async function run(client: Client, example: Example): Promise<string | undefined> {
    let text: string;
    try {
      const result = (await client.callTool({
        name: example.tool,
        arguments: example.args,
      })) as { isError?: boolean; content: Array<{ text?: string }> };
      if (!result.isError) return undefined;
      text = result.content.map((c) => c.text ?? '').join(' ');
    } catch (err) {
      text = err instanceof Error ? err.message : String(err);
    }
    if (pointsAtRecord(example.args) && !MALFORMED.test(text)) return undefined;
    const name = example.label ? `${example.tool} (${example.label})` : example.tool;
    return `${name}: ${text.split('\n')[0]}`;
  }

  it('o record_meal casa os nomes do exemplo, e "ovo" é ovo de galinha', async () => {
    const { client, close } = await connect('intencao', []);
    try {
      const result = (await client.callTool({
        name: 'record_meal',
        arguments: {
          mealType: 'BREAKFAST',
          items: [
            { food: 'ovo cozido', grams: 100 },
            { food: 'café', grams: 150 },
            { food: 'ovo', grams: 50 },
          ],
        },
      })) as { content: Array<{ text: string }> };
      const { matches } = JSON.parse(result.content[0].text) as {
        matches: Array<{ matched: { name: string } | null }>;
      };
      expect(matches.map((m) => m.matched?.name)).toEqual([
        'Ovo, de galinha, inteiro, cozido/10minutos',
        'Café, infusão 10%',
        'Ovo, de galinha, inteiro, cru',
      ]);
    } finally {
      await close();
    }
  }, 120_000);

  it.each(['entidade', 'intencao'] as const)(
    'na superfície de %s',
    async (surface) => {
      const failures: string[] = [];
      const shared = await connect(surface, []);
      try {
        for (const example of examples[surface]) {
          if (NEEDS_ACTIVE_SESSION.has(example.tool)) continue;
          const failure = await run(shared.client, example);
          if (failure) failures.push(failure);
        }
      } finally {
        await shared.close();
      }
      for (const example of examples[surface]) {
        if (!NEEDS_ACTIVE_SESSION.has(example.tool)) continue;
        const own = await connect(surface, ['sessao_ativa']);
        try {
          const failure = await run(own.client, example);
          if (failure) failures.push(failure);
        } finally {
          await own.close();
        }
      }
      expect(failures).toEqual([]);
    },
    300_000,
  );
});
