import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MCP_TOOL_METADATA, type McpToolDef } from '../../common/decorators/tool.decorator';

/**
 * Classificação de toda tool MCP quanto a **identidade** (issue #156).
 *
 * "Toda tool revisada contra a matriz" só vale como revisão pontual: envelhece
 * na primeira tool nova. Aqui a revisão é permanente e feita pelo filesystem,
 * igual a `tool-catalog.spec.ts`.
 *
 * Três classes, e toda tool cai em exatamente uma:
 *
 * - **`self`** — age sobre quem chamou. É a esmagadora maioria, e o alvo é o
 *   `ctx.userId`.
 * - **`delegated`** — lê o dado de OUTRA pessoa. Declara `membershipId` e só
 *   existe passando por `ProfessionalAccessService`. Allowlist vazia hoje.
 * - **`consent`** — o titular aponta OUTRA pessoa como destinatária de uma
 *   permissão sobre o próprio dado (`professionalMembershipId`). Não lê nada de
 *   ninguém, então não passa pela porta de leitura — mas também não pode ser
 *   tratada como `self` pura, porque carrega no input a associação de um
 *   terceiro, e é o `ConsentService` que amarra essa associação ao grupo do
 *   titular.
 *
 * **O que este spec NÃO repete:** `tool-user-scoping.spec.ts` já reprova campo
 * de identidade no input (`user_id`, `student_id`, `on_behalf_of`…) e já exige
 * `readOnlyHint` + porta única nas delegadas. O que só existe aqui é a terceira
 * classe — que nasceu com a #155 e passaria despercebida pelo regex ancorado de
 * lá — e a trava de administração de grupo abaixo.
 */

const API_SRC = resolve(__dirname, '../..');

/** Referência à associação de OUTRA pessoa, em qualquer grafia usada no repo. */
const MEMBERSHIP_FIELD = /membership_?id$/i;
/** Só a associação do titular sendo lida — o campo da leitura delegada. */
const DELEGATED_FIELD = /^membership_?id$/i;

interface LoadedTool {
  def: McpToolDef;
  file: string;
  source: string;
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
      tools.push({ def: new Ctor(...deps), file, source: readFileSync(file, 'utf8') });
    }
  }
  return tools;
}

const tools = loadTools();

const campos = (tool: LoadedTool) => Object.keys(tool.def.inputSchema);
const delegadas = tools.filter((tool) => campos(tool).some((f) => DELEGATED_FIELD.test(f)));
const consentimento = tools.filter(
  (tool) =>
    campos(tool).some((f) => MEMBERSHIP_FIELD.test(f) && !DELEGATED_FIELD.test(f)) &&
    !delegadas.includes(tool),
);

describe('classificação de identidade das tools MCP', () => {
  it('descobre as tools do código', () => {
    expect(tools.length).toBeGreaterThan(50);
  });

  it('toda tool cai em exatamente uma classe', () => {
    const ambiguas = tools
      .filter((tool) => delegadas.includes(tool) && consentimento.includes(tool))
      .map((tool) => tool.def.name);

    expect(ambiguas).toEqual([]);
  });

  it('leitura delegada só existe na allowlist, e passa pela porta única', () => {
    /**
     * Tools autorizadas a LER dado de outra pessoa. Vazia, e é assim que tem de
     * ser: a #157 e a #159 vão querer o painel do profissional, e é ali que a
     * lista cresce — com diff visível e justificativa na PR, nunca por uma tool
     * nova que "só recebe um id".
     */
    const DELEGATED_READ_TOOLS: string[] = [];

    expect(delegadas.map((tool) => tool.def.name).sort()).toEqual([...DELEGATED_READ_TOOLS].sort());

    for (const tool of delegadas) {
      // Não existe escrita em nome de outro: o caminho de escrita é oferta +
      // aceite, e o aceite roda sob o `userId` do próprio aluno (ADR 014).
      expect([tool.def.name, tool.def.annotations.readOnlyHint]).toEqual([tool.def.name, true]);
      expect([tool.def.name, tool.source.includes('ProfessionalAccessService')]).toEqual([
        tool.def.name,
        true,
      ]);
    }
  });

  it('tool de consentimento aponta terceiro só pela associação, e valida no ConsentService', () => {
    /**
     * Tools em que o titular nomeia OUTRA pessoa para receber (ou perder) uma
     * permissão sobre o dado dele. O regex de `tool-user-scoping.spec.ts` é
     * ancorado — `professionalMembershipId` não casa com `^membership_?id$` nem
     * com `^professional_?id$` —, então sem este caso a classe inteira ficaria
     * sem guarda nenhum.
     */
    const CONSENT_TOOLS = ['grant_data_sharing'];

    expect(consentimento.map((tool) => tool.def.name).sort()).toEqual([...CONSENT_TOOLS].sort());

    for (const tool of consentimento) {
      // Quem amarra a associação do terceiro ao grupo do titular é o
      // `ConsentService`. Uma tool que resolvesse o profissional por conta
      // própria recriaria o furo do #204 do outro lado do vínculo.
      expect([tool.def.name, tool.source.includes('ConsentService')]).toEqual([
        tool.def.name,
        true,
      ]);
      // E o alvo é sempre uma associação, nunca um `userId`: um campo
      // `professionalUserId` casaria com o regex de terceiro e passaria aqui, mas
      // morre em `tool-user-scoping.spec.ts` — as duas travas se cobrem.
      expect([tool.def.name, campos(tool).filter((f) => MEMBERSHIP_FIELD.test(f))]).toEqual([
        tool.def.name,
        ['professionalMembershipId'],
      ]);
    }
  });

  it('nenhuma tool administra grupo', () => {
    // A decisão está escrita em `sharing.controller.ts` e em
    // `docs/MCP_TOOL_SURFACE.md`: criar grupo, aprovar entrada e remover membro
    // são REST do painel do dono, e nenhuma tool passa a poder colocar alguém
    // dentro de um grupo nem promover ninguém a `PROFESSIONAL`. Até aqui isso
    // era só prosa — e prosa não reprova a tool que alguém adicionar amanhã.
    //
    // `\.create\(` sozinho não serve — metade do catálogo cria alguma coisa. O
    // recorte é criar **grupo**: só reprova quem importa o `GroupService`.
    const offenders = tools
      .filter(
        (tool) =>
          /\.(?:approve|removeMember)\(/.test(tool.source) ||
          (tool.source.includes('GroupService') && /\.create\(/.test(tool.source)),
      )
      .map((tool) => tool.def.name);

    expect(offenders).toEqual([]);
  });

  it('toda tool self resolve o alvo pelo contexto, e não pela porta de leitura', () => {
    // O espelho do caso das delegadas: uma tool que chamasse `assertReadable`
    // sem declarar a associação lida estaria lendo dado de outra pessoa por um
    // caminho que nenhuma allowlist governa.
    const self = tools.filter((tool) => !delegadas.includes(tool) && !consentimento.includes(tool));

    // Sanidade: se a classificação quebrar, o filtro abaixo passaria vazio.
    expect(self.length).toBeGreaterThan(50);

    const offenders = self
      .filter((tool) => tool.source.includes('ProfessionalAccessService'))
      .map((tool) => tool.def.name);

    expect(offenders).toEqual([]);
  });
});
