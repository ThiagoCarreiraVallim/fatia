import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ZodTypeAny } from 'zod';
import { MCP_TOOL_METADATA, type McpToolDef } from '../../../common/decorators/tool.decorator';
import { CAMPOS, COMPOSTOS, OCULTOS, tipoDoCampo } from '../rotulos';

/**
 * Toda tool que pede confirmação tem cada campo descrito em português.
 *
 * Sem esta guarda, uma tool confirmável nova — ou um campo novo numa antiga —
 * sairia do cartão de confirmação em silêncio: o resumo só mostra o que conhece,
 * e a pessoa confirmaria uma escrita sem ver parte do que ela grava.
 */

const API_SRC = resolve(__dirname, '../../..');

function confirmaveis(): McpToolDef[] {
  const arquivos = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entrada) => entrada.endsWith('.tool.ts'))
    .map((entrada) => join(API_SRC, entrada));
  const tools: McpToolDef[] = [];
  for (const arquivo of arquivos) {
    const modulo = require(arquivo) as Record<string, unknown>;
    for (const exportado of Object.values(modulo)) {
      if (typeof exportado !== 'function' || !Reflect.getMetadata(MCP_TOOL_METADATA, exportado)) {
        continue;
      }
      const Ctor = exportado as new (...args: never[]) => McpToolDef;
      const tool = new Ctor(...(Array.from({ length: Ctor.length }, () => undefined) as never[]));
      if (tool.annotations?.confirmableHint === true) tools.push(tool);
    }
  }
  return tools;
}

/** Os campos de um objeto dentro de uma lista (`items`, `exercises`). */
function camposAninhados(schema: ZodTypeAny): string[] {
  let atual: ZodTypeAny = schema;
  for (let i = 0; i < 5; i += 1) {
    const def = atual._def as { innerType?: ZodTypeAny; type?: ZodTypeAny; schema?: ZodTypeAny };
    const forma = (atual as unknown as { shape?: Record<string, unknown> }).shape;
    if (forma) return Object.keys(forma);
    atual = def.innerType ?? def.type ?? def.schema ?? atual;
  }
  return [];
}

const tools = confirmaveis();

describe('rótulos do cartão de confirmação', () => {
  it('descobre as tools confirmáveis', () => {
    expect(tools.length).toBeGreaterThan(30);
  });

  it('todo campo de toda tool confirmável tem rótulo, é id resolvido ou é oculto de propósito', () => {
    const semRotulo: string[] = [];
    const coberto = (tool: string, campo: string) =>
      campo in CAMPOS || OCULTOS.has(campo) || tipoDoCampo(tool, campo) !== null;

    for (const tool of tools) {
      for (const [campo, schema] of Object.entries(tool.inputSchema)) {
        if (COMPOSTOS.has(campo)) {
          for (const interno of camposAninhados(schema as ZodTypeAny)) {
            if (campo === 'exercises' && interno === 'id') continue;
            if (!coberto(tool.name, interno)) semRotulo.push(`${tool.name}.${campo}[].${interno}`);
          }
          continue;
        }
        if (!coberto(tool.name, campo)) semRotulo.push(`${tool.name}.${campo}`);
      }
    }

    expect(semRotulo).toEqual([]);
  });
});
