import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MCP_TOOL_METADATA, type McpToolDef } from '../../common/decorators/tool.decorator';

/**
 * Guarda de escopo por usuário na superfície MCP (issue #92).
 *
 * A regra do projeto é que `userId` vem SEMPRE do contexto (resolvido pelo
 * `JwtAuthGuard` a partir do token) e NUNCA do input da tool — aceitar por input
 * permitiria a um usuário autenticado pedir dados de outro. Este spec transforma
 * essa regra num invariante estrutural: é a única violação que um teste de
 * comportamento poderia não pegar, porque a tool "funcionaria" perfeitamente.
 *
 * O isolamento de comportamento (user-A não lê dado de user-B) é coberto pelos
 * specs de service — ver `docs/THREAT_MODEL.md` para a matriz completa.
 */

const API_SRC = resolve(__dirname, '../..');

/** Nomes de campo que denunciam identidade de usuário vinda de fora. */
const FORBIDDEN_FIELD = /^(user_?id|owner_?id|created_?by_?user_?id|logto_?sub|sub)$/i;

function loadTools(): McpToolDef[] {
  const files = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.tool.ts'))
    .map((entry) => join(API_SRC, entry))
    .sort();

  const tools: McpToolDef[] = [];
  for (const file of files) {
    // Require dinâmico: o caminho vem da varredura do filesystem.
     
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      if (!Reflect.getMetadata(MCP_TOOL_METADATA, exported)) continue;
      const Ctor = exported as new (...args: never[]) => McpToolDef;
      const deps = Array.from({ length: Ctor.length }, () => undefined) as never[];
      tools.push(new Ctor(...deps));
    }
  }
  return tools;
}

const tools = loadTools();

describe('escopo por usuário nas tools MCP', () => {
  it('descobre as tools do código', () => {
    expect(tools.length).toBeGreaterThan(50);
  });

  it('nenhuma tool aceita identidade de usuário por input', () => {
    const offenders: string[] = [];

    for (const tool of tools) {
      for (const field of Object.keys(tool.inputSchema)) {
        if (FORBIDDEN_FIELD.test(field)) offenders.push(`${tool.name}.${field}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('só as tools de catálogo público dispensam o contexto de usuário', () => {
    // `execute(input, ctx)` — aridade 2 significa que a tool lê o contexto e,
    // portanto, escopa por usuário. Dispensar o contexto só é legítimo para
    // tools que leem catálogo compartilhado sem dono no schema.
    //
    // A lista é explícita de propósito: ampliar exige um diff visível, e quem
    // revisar precisa confirmar que o modelo lido realmente não tem `userId`.
    const PUBLIC_CATALOG_TOOLS = [
      // FoodGroup não tem coluna de dono — é taxonomia compartilhada da TACO.
      'list_food_groups',
    ];

    const withoutContext = tools
      .filter((tool) => tool.execute.length < 2)
      .map((tool) => tool.name)
      .sort();

    expect(withoutContext).toEqual([...PUBLIC_CATALOG_TOOLS].sort());
  });
});

describe('escopo por usuário nos controllers REST', () => {
  const controllers = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.controller.ts'))
    .map((entry) => join(API_SRC, entry));

  it('encontra os controllers', () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  it('nenhum controller aceita userId por rota, query ou body', () => {
    const offenders: string[] = [];

    for (const file of controllers) {
      const source = readFileSync(file, 'utf8');
      // @Param('userId') / @Query('userId') / @Body('userId') e variantes.
      const matches = source.matchAll(/@(?:Param|Query|Body)\(\s*['"`](user_?id|owner_?id)['"`]/gi);
      for (const match of matches) {
        offenders.push(`${file.replace(API_SRC, 'src')}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
