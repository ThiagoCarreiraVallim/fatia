import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
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

/**
 * Formato do exemplo de invocação, fixado na §Convenções de `docs/MCP.md`:
 * `Exemplo: {json}` no fim da description, com rótulo opcional entre parênteses
 * quando a tool aceita mais de uma forma de chamada (`log_set` força × cardio).
 */
const EXAMPLE_PREFIX = /Exemplo(?: \([^)]*\))?: (?=\{)/g;

/**
 * Recorta o JSON de cada exemplo contando chaves balanceadas a partir do `{`
 * que segue o prefixo. Um `/Exemplo: (\{.*\})/` erraria nos dois casos que
 * existem hoje: description com dois exemplos e exemplo com objeto aninhado.
 * As aspas são acompanhadas porque `}` dentro de string não fecha nada.
 */
function extractExamples(description: string): string[] {
  const found: string[] = [];

  for (const match of description.matchAll(EXAMPLE_PREFIX)) {
    if (match.index === undefined) continue;
    const start = match.index + match[0].length;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < description.length; i++) {
      const char = description[i];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = !inString;
      } else if (!inString && char === '{') {
        depth++;
      } else if (!inString && char === '}') {
        depth--;
        if (depth === 0) {
          found.push(description.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return found;
}

/**
 * Versão estrita do schema em TODA a árvore. O `.strict()` do Zod é raso, e o
 * campo renomeado dentro de `items[]` do `log_meal` é justamente o caso em que
 * o exemplo apodrece sem ninguém notar. Remontar o array perde restrições como
 * `.min(1)` — por isso esta cópia serve só para achar chave desconhecida, e o
 * parse do contrato completo continua sendo feito no schema original.
 */
function deepStrict(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, ZodTypeAny>;
    const strictShape = Object.fromEntries(
      Object.entries(shape).map(([field, inner]) => [field, deepStrict(inner)]),
    );
    return z.object(strictShape).strict();
  }
  if (schema instanceof z.ZodArray) return z.array(deepStrict(schema.element as ZodTypeAny));
  if (schema instanceof z.ZodOptional) return deepStrict(schema.unwrap() as ZodTypeAny).optional();
  if (schema instanceof z.ZodNullable) return deepStrict(schema.unwrap() as ZodTypeAny).nullable();
  // `z.record` fica de fora de propósito: `nutrients` aceita chave livre.
  return schema;
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

  // --- Anotações MCP (issue #169) ---
  //
  // Requisito 2 da submissão ao diretório: toda tool precisa de `title` e do
  // hint aplicável. O passo "Tools" do portal recusa quem não tem, e são 87
  // tools — a chance de alguém adicionar a 88ª sem anotar é alta.

  it('tem title legível em toda tool', () => {
    const missing = tools
      .filter(({ tool }) => !tool.title || tool.title.trim().length < 3)
      .map(({ tool }) => tool.name)
      .sort();

    expect(missing).toEqual([]);
  });

  it('não repete o name como title', () => {
    // `delete_set` como título de exibição não ajuda ninguém — é o que o
    // catálogo já mostra. O title existe para ser lido por humano.
    const lazy = tools
      .filter(({ tool }) => tool.title?.trim().toLowerCase() === tool.name.replace(/_/g, ' '))
      .map(({ tool }) => tool.name)
      .sort();

    expect(lazy).toEqual([]);
  });

  it('não emite $ref no JSON Schema de nenhuma tool', () => {
    // Reusar a MESMA instância de schema Zod em dois campos do mesmo input faz o
    // conversor deduplicar por identidade e emitir `$ref` no segundo:
    //
    //   primaryMuscles:   { type: 'array', items: {...} }
    //   secondaryMuscles: { $ref: '#/properties/primaryMuscles' }
    //
    // É JSON Schema válido, mas cliente que não resolve `$ref` — o portal de
    // submissão do diretório, entre outros — enxerga o campo SEM TIPO. A
    // correção é usar fábrica em vez de constante compartilhada.
    const offenders: string[] = [];

    for (const { tool } of tools) {
      // Cast localizado: `z.object` sobre o shape genérico estoura a
      // instanciação de tipos (TS2589), mesmo motivo do cast em
      // `mcp-tool.registry.ts`. Aqui só interessa a forma serializada.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const object = z.object(tool.inputSchema as any) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = zodToJsonSchema(object, { $refStrategy: 'root' }) as any;
      if (JSON.stringify(schema).includes('$ref')) offenders.push(tool.name);
    }

    expect(offenders.sort()).toEqual([]);
  });

  it('declara o hint coerente com o prefixo do nome', () => {
    const READ = /^(get|list|search|explain|export)_/;
    const DESTRUCTIVE = /^delete_/;
    // Desfaz o vínculo e perde séries/reps configuradas naquele exercício.
    const ALSO_DESTRUCTIVE = new Set(['remove_exercise_from_plan']);

    const wrong: string[] = [];

    for (const { tool } of tools) {
      const a = tool.annotations ?? {};

      // Os dois hints têm de estar PRESENTES em toda tool: o validador do
      // portal exige `readOnlyHint` inclusive nas de escrita, onde é `false`.
      if (typeof a.readOnlyHint !== 'boolean' || typeof a.destructiveHint !== 'boolean') {
        wrong.push(`${tool.name}: readOnlyHint e destructiveHint precisam ser declarados`);
        continue;
      }

      if (READ.test(tool.name)) {
        if (a.readOnlyHint !== true) wrong.push(`${tool.name}: esperado readOnlyHint`);
        continue;
      }

      if (a.readOnlyHint === true) {
        wrong.push(`${tool.name}: marcada readOnlyHint mas o nome indica escrita`);
        continue;
      }

      const shouldBeDestructive = DESTRUCTIVE.test(tool.name) || ALSO_DESTRUCTIVE.has(tool.name);

      // `destructiveHint` tem default TRUE na spec quando readOnlyHint é falso.
      // Escrita comum precisa declarar `false` explicitamente, senão o Claude
      // pede confirmação a cada refeição registrada — e o silêncio aqui é
      // indistinguível de esquecimento.
      if (a.destructiveHint !== shouldBeDestructive) {
        wrong.push(`${tool.name}: esperado destructiveHint=${shouldBeDestructive}`);
      }
    }

    expect(wrong.sort()).toEqual([]);
  });

  // --- Exemplos de invocação (issue #111) ---
  //
  // Toda tool de escrita termina a description com uma chamada concreta. O que
  // dá valor ao exemplo não é ele existir, é continuar verdadeiro: exemplo que
  // não passaria na validação induz o modelo ao erro, e nesse caso é PIOR que
  // exemplo nenhum. Por isso o guarda faz o parse de verdade contra o schema,
  // em vez de um `description.includes('Exemplo')`.

  const writeTools = tools.filter(({ tool }) => tool.annotations?.readOnlyHint === false);

  it('tem exemplo de invocação em toda tool de escrita', () => {
    const missing = writeTools
      .filter(({ tool }) => extractExamples(tool.description).length === 0)
      .map(({ tool }) => tool.name)
      .sort();

    expect(missing).toEqual([]);
  });

  it('tem exemplo em JSON válido', () => {
    // Separado do caso acima de propósito: "não tem exemplo" e "tem exemplo
    // quebrado" são erros diferentes, e a mensagem tem de dizer qual é. A causa
    // mais provável aqui é template literal multilinha, que injeta `\n` e
    // indentação no meio do JSON.
    const broken: string[] = [];

    for (const { tool } of tools) {
      for (const example of extractExamples(tool.description)) {
        try {
          JSON.parse(example);
        } catch (err) {
          broken.push(`${tool.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    expect(broken.sort()).toEqual([]);
  });

  it('tem exemplo que valida contra o inputSchema da própria tool', () => {
    const invalid: string[] = [];

    for (const { tool } of tools) {
      const examples = extractExamples(tool.description);
      if (examples.length === 0) continue;

      // Cast localizado: `z.object` sobre o shape genérico estoura a
      // instanciação de tipos (TS2589), mesmo motivo do cast do caso de `$ref`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const object = z.object(tool.inputSchema as any) as any;
      const contract = object.strict() as ZodTypeAny;
      const keysOnly = deepStrict(object as ZodTypeAny);

      for (const raw of examples) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue; // já reportado pelo caso do JSON válido
        }

        // Duas passadas: o schema original valida tipo, enum, obrigatório e
        // min/max; a cópia estrita pega chave que não existe mais, em qualquer
        // nível. Renomear um campo e esquecer o exemplo cai na segunda.
        for (const [rule, schema] of [
          ['contrato', contract],
          ['chave desconhecida', keysOnly],
        ] as const) {
          const result = schema.safeParse(parsed);
          if (result.success) continue;
          const issue = result.error.issues[0];
          invalid.push(
            `${tool.name} (${rule}): ${issue.path.join('.') || '(raiz)'} — ${issue.message}`,
          );
        }
      }
    }

    expect(invalid.sort()).toEqual([]);
  });

  it('não exige exemplo em tool somente-leitura', () => {
    // Guarda do guarda. Generalizar a exigência para as 87 tools custa token em
    // toda sessão sem ganho equivalente: input de tool de leitura é curto e
    // raramente ambíguo. Se um dia toda tool de leitura ganhar exemplo, este
    // caso cai — e a decisão volta à mesa em vez de acontecer por inércia.
    const readOnlyWithoutExample = tools.filter(
      ({ tool }) =>
        tool.annotations?.readOnlyHint === true && extractExamples(tool.description).length === 0,
    );

    expect(readOnlyWithoutExample.length).toBeGreaterThan(0);
  });
});
