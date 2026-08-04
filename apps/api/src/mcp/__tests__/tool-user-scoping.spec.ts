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

/**
 * Nomes de campo que denunciam identidade de usuário vinda de fora.
 *
 * A lista cresceu com o B2B (#153). O desenho de grupo/vínculo cria a tentação
 * de uma tool `get_student_progress({ student_id })` — que passaria no regex
 * antigo, porque "student" não é "user". Sob a ADR 014 a identidade do aluno
 * **nunca** entra por input: o que entra é `membership_id`, um UUID que só
 * resolve para quem tem vínculo ativo, e a resolução acontece dentro do
 * `ProfessionalAccessService`. Este regex só pode crescer.
 */
const FORBIDDEN_FIELD =
  /^(user_?id|owner_?id|created_?by_?user_?id|logto_?sub|sub|student_?id|subject_?id|subject_?user_?id|athlete_?id|patient_?id|client_?user_?id|professional_?id|on_?behalf_?of|act_?as|acting_?as|impersonate)$/i;

/** Campo pelo qual a identidade de um titular PODE ser referenciada. */
const DELEGATED_FIELD = /^membership_?id$/i;

interface LoadedTool {
  def: McpToolDef;
  file: string;
}

function loadTools(): LoadedTool[] {
  const files = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.tool.ts'))
    .map((entry) => join(API_SRC, entry))
    .sort();

  const tools: LoadedTool[] = [];
  for (const file of files) {
    // Require dinâmico: o caminho vem da varredura do filesystem.

    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      if (!Reflect.getMetadata(MCP_TOOL_METADATA, exported)) continue;
      const Ctor = exported as new (...args: never[]) => McpToolDef;
      const deps = Array.from({ length: Ctor.length }, () => undefined) as never[];
      tools.push({ def: new Ctor(...deps), file });
    }
  }
  return tools;
}

const loaded = loadTools();
const tools = loaded.map((entry) => entry.def);

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

  it('leitura delegada entra por membership_id, é só-leitura e passa pela porta única', () => {
    // A ADR 014 tem duas direções e só uma delas é leitura cruzada:
    //
    // - profissional → aluno é **oferta + aceite**, e o aceite materializa cópia
    //   sob o `userId` do aluno. Não existe escrita em nome de outro, então uma
    //   tool delegada que não seja `readOnlyHint: true` está errada por
    //   construção.
    // - aluno → profissional é leitura, autorizada por `ProfessionalLink` e
    //   resolvida SÓ pelo `ProfessionalAccessService`. Uma tool que aceite
    //   `membership_id` e resolva o aluno por conta própria recria o furo.
    //
    // A allowlist nasceu vazia (#153 entregou só o modelo) e ganhou a primeira
    // entrada na #157, com o painel do profissional. Ampliar exige diff visível
    // — é o mesmo espírito de `PUBLIC_CATALOG_TOOLS`.
    const DELEGATED_READ_TOOLS: string[] = ['get_student_progress'];

    const declaram = loaded.filter(({ def }) =>
      Object.keys(def.inputSchema).some((field) => DELEGATED_FIELD.test(field)),
    );

    expect(declaram.map(({ def }) => def.name).sort()).toEqual([...DELEGATED_READ_TOOLS].sort());

    for (const { def, file } of declaram) {
      expect([def.name, def.annotations.readOnlyHint]).toEqual([def.name, true]);
      // Mesmo espírito do check de `@Param('userId')` nos controllers: a
      // garantia é estrutural, lida do fonte, não da intenção de quem escreveu.
      expect([def.name, readFileSync(file, 'utf8').includes('ProfessionalAccessService')]).toEqual([
        def.name,
        true,
      ]);
    }
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
