import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ZodTypeAny } from 'zod';
import { MCP_TOOL_METADATA, type McpToolDef } from '../../common/decorators/tool.decorator';

/**
 * Guarda do catálogo de tools MCP (issue #94).
 *
 * O catálogo em `docs/MCP.md` divergiu silenciosamente do código: 84 tools
 * registradas contra ~52 documentadas, além de 3 seções órfãs apontando para
 * tools renomeadas. Este spec transforma a reconciliação num invariante — se
 * alguém adiciona, renomeia ou remove uma tool sem tocar na doc, o CI acusa.
 *
 * A descoberta é feita pelo filesystem em vez do `DiscoveryService` do Nest de
 * propósito: instanciar as classes direto dispensa subir o container de DI (e o
 * banco), e ainda assim lê `name`/`description`/`inputSchema` do código real,
 * não de uma lista mantida à mão.
 */

const API_SRC = resolve(__dirname, '../..');
const MCP_DOC = resolve(__dirname, '../../../../../docs/MCP.md');

/** `verb_noun` em snake_case, conforme a convenção da §Catálogo de `docs/MCP.md`. */
const TOOL_NAME_PATTERN = /^[a-z]+(_[a-z]+)+$/;

function findToolFiles(): string[] {
  return readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.tool.ts'))
    .map((entry) => join(API_SRC, entry))
    .sort();
}

/**
 * Instancia a tool sem resolver as dependências. Os construtores das tools só
 * fazem atribuição de campo — `name`, `description` e `inputSchema` não tocam os
 * services, então um instance com deps vazias basta para inspecionar o contrato.
 */
function loadTools(): Array<{ file: string; tool: McpToolDef }> {
  const loaded: Array<{ file: string; tool: McpToolDef }> = [];

  for (const file of findToolFiles()) {
    // Require dinâmico: o caminho vem da varredura do filesystem, então não há
    // como declarar esses imports estaticamente.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file) as Record<string, unknown>;

    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      if (!Reflect.getMetadata(MCP_TOOL_METADATA, exported)) continue;

      const Ctor = exported as new (...args: never[]) => McpToolDef;
      const arity = Ctor.length;
      const deps = Array.from({ length: arity }, () => undefined) as never[];
      loaded.push({ file, tool: new Ctor(...deps) });
    }
  }

  return loaded;
}

const tools = loadTools();
const doc = readFileSync(MCP_DOC, 'utf8');

/** Seções `### \`tool_name\`` da doc — a fonte da verdade do que está documentado. */
const documentedSections = new Set(
  Array.from(doc.matchAll(/^### `([a-z_]+)`/gm), (match) => match[1]),
);

/** Linhas da tabela-resumo `| ... | \`tool_name\` | R |`. */
const summaryTableEntries = new Set(
  Array.from(doc.matchAll(/^\|[^|]*\|\s*`([a-z_]+)`\s*\|/gm), (match) => match[1]),
);

describe('catálogo de tools MCP', () => {
  it('descobre as tools do código', () => {
    // Sanidade: se a descoberta quebrar, os testes abaixo passariam vazios.
    expect(tools.length).toBeGreaterThan(50);
  });

  it('não tem nomes duplicados', () => {
    const names = tools.map(({ tool }) => tool.name);
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
    expect(duplicates).toEqual([]);
  });

  it('segue a convenção verb_noun em todos os nomes', () => {
    const offenders = tools
      .filter(({ tool }) => !TOOL_NAME_PATTERN.test(tool.name))
      .map(({ tool }) => tool.name);
    expect(offenders).toEqual([]);
  });

  it('tem uma seção em docs/MCP.md para cada tool registrada', () => {
    const undocumented = tools
      .map(({ tool }) => tool.name)
      .filter((name) => !documentedSections.has(name))
      .sort();

    expect(undocumented).toEqual([]);
  });

  it('tem uma linha na tabela-resumo para cada tool registrada', () => {
    const missingFromSummary = tools
      .map(({ tool }) => tool.name)
      .filter((name) => !summaryTableEntries.has(name))
      .sort();

    expect(missingFromSummary).toEqual([]);
  });

  it('não tem seções órfãs em docs/MCP.md', () => {
    const registered = new Set(tools.map(({ tool }) => tool.name));
    const orphans = [...documentedSections].filter((name) => !registered.has(name)).sort();

    expect(orphans).toEqual([]);
  });

  it('tem descrição em toda tool', () => {
    const missing = tools
      .filter(({ tool }) => !tool.description || tool.description.trim().length < 20)
      .map(({ tool }) => tool.name)
      .sort();

    expect(missing).toEqual([]);
  });

  it('tem descrição em todo campo de input', () => {
    const missing: string[] = [];

    for (const { tool } of tools) {
      for (const [field, schema] of Object.entries(tool.inputSchema)) {
        const description = (schema as ZodTypeAny).description;
        if (!description || description.trim().length === 0) {
          missing.push(`${tool.name}.${field}`);
        }
      }
    }

    expect(missing.sort()).toEqual([]);
  });
});
