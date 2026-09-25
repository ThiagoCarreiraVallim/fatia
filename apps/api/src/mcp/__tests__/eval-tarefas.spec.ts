import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z, type ZodTypeAny } from 'zod';
import { MCP_TOOL_METADATA, type McpToolDef } from '../../common/decorators/tool.decorator';
import {
  INTENT_TOOLS,
  SHARED_ENTITY_TOOLS,
  isSharedWithIntentSurface,
  type IntentToolSpec,
} from '../intent/intent-surface';

/**
 * Guarda do conjunto de tarefas do eval da fronteira de tools
 * (`apps/agent/eval/tarefas-fronteira.jsonl`) contra o catálogo real.
 *
 * Existe porque o conjunto nasceu escrito à mão e errou de três jeitos que só
 * apareceriam depois de medir: `argumentos` com nome de campo que o schema não
 * tem (`calories` no lugar de `kcalPer100g`, `mealType` num `list_meals` que não
 * filtra por tipo); piso 1 em tarefa cuja única tool exige um `exerciseId` que o
 * modelo não tem como saber sem buscar antes; e uma tool de intenção anotada como
 * confirmável compondo uma deletora. Cada um desses faz o número sair errado sem
 * que nada falhe — a tarefa só "fica difícil".
 *
 * O conjunto é congelado antes da primeira medição, e mexer nele muda a impressão
 * digital do ledger. Este spec é o que dá para conferir antes disso.
 */

const API_SRC = resolve(__dirname, '../..');
const REPO_ROOT = resolve(__dirname, '../../../../..');
const TAREFAS = resolve(REPO_ROOT, 'apps/agent/eval/tarefas-fronteira.jsonl');

/** Placeholders de data que o comparador resolve no fuso da conta de avaliação. */
const PLACEHOLDERS: Record<string, string> = {
  '<hoje>': '2026-09-22',
  '<ontem>': '2026-09-21',
  '<terca>': '2026-09-22',
};

/** Estados da conta que o seed de avaliação sabe montar antes de uma tarefa. */
const ESTADOS = new Set(['sessao_ativa']);

interface Argumentos {
  tool: string;
  contem: Record<string, unknown>;
}

interface Tarefa {
  id: string;
  familia: string;
  persona: 'usuario' | 'profissional';
  split: 'dev' | 'eval';
  estado?: string[];
  pedido: string;
  gabarito_a: string[][];
  gabarito_b: string[][];
  passos_min_a: number;
  passos_min_b: number;
  argumentos?: Argumentos;
  argumentos_b?: Argumentos;
  armadilha?: string;
  nota?: string;
}

function loadTools(): McpToolDef[] {
  const loaded: McpToolDef[] = [];
  const files = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.tool.ts'))
    .map((entry) => join(API_SRC, entry));

  for (const file of files) {
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      if (!Reflect.getMetadata(MCP_TOOL_METADATA, exported)) continue;
      const Ctor = exported as new (...args: never[]) => McpToolDef;
      loaded.push(new Ctor(...(Array.from({ length: Ctor.length }) as never[])));
    }
  }
  return loaded;
}

const tarefas: Tarefa[] = readFileSync(TAREFAS, 'utf8')
  .split('\n')
  .filter((linha) => linha.trim() !== '')
  .map((linha) => JSON.parse(linha) as Tarefa);

const entidade = new Map(loadTools().map((tool) => [tool.name, tool]));
const intencao = new Map(INTENT_TOOLS.map((tool) => [tool.name, tool]));

type Contrato = Pick<McpToolDef, 'name' | 'annotations' | 'inputSchema'>;

/** O que o braço B anuncia: as de intenção mais as de entidade que ficam iguais. */
const bracoB = new Map<string, Contrato>([
  ...[...entidade.values()]
    .filter((tool) => isSharedWithIntentSurface(tool))
    .map((tool) => [tool.name, tool] as const),
  ...INTENT_TOOLS.map((tool) => [tool.name, tool] as const),
]);

/** READ_ONLY < CONFIRMABLE < RESTRICTED < destrutiva — a ordem da política de 3 camadas. */
function restricao({ annotations }: Pick<McpToolDef, 'annotations'>): number {
  if (annotations.destructiveHint) return 3;
  if (annotations.readOnlyHint) return 0;
  if (annotations.confirmableHint) return 1;
  return 2;
}

function substituirPlaceholders(valor: unknown): unknown {
  if (typeof valor === 'string') return PLACEHOLDERS[valor] ?? valor;
  if (Array.isArray(valor)) return valor.map(substituirPlaceholders);
  return valor;
}

function exemplo(description: string): unknown {
  const inicio = description.indexOf('Exemplo: {');
  return inicio < 0 ? undefined : JSON.parse(description.slice(inicio + 'Exemplo: '.length));
}

describe('conjunto de tarefas do eval da fronteira', () => {
  it('tem ids únicos, split declarado e o eval com pelo menos 30 tarefas', () => {
    const ids = tarefas.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of tarefas) expect(['dev', 'eval']).toContain(t.split);
    expect(tarefas.filter((t) => t.split === 'eval').length).toBeGreaterThanOrEqual(30);
  });

  it('mantém toda tarefa com armadilha no eval — elas são o instrumento da métrica 6', () => {
    const noDev = tarefas.filter((t) => t.armadilha && t.split !== 'eval').map((t) => t.id);
    expect(noDev).toEqual([]);
  });

  it('só pressupõe estados de conta que o seed sabe montar', () => {
    for (const t of tarefas) for (const e of t.estado ?? []) expect(ESTADOS).toContain(e);
  });

  it.each([
    ['A', 'gabarito_a', entidade],
    ['B', 'gabarito_b', bracoB],
  ] as const)('só cita no gabarito %s tools que o braço anuncia', (_braco, campo, anunciadas) => {
    const inexistentes = tarefas.flatMap((t) =>
      t[campo]
        .flat()
        .filter((nome) => !anunciadas.has(nome))
        .map((nome) => `${t.id}: ${nome}`),
    );
    expect(inexistentes).toEqual([]);
  });

  it.each([
    ['A', 'gabarito_a', 'passos_min_a'],
    ['B', 'gabarito_b', 'passos_min_b'],
  ] as const)('declara o piso %s igual à menor variante do gabarito', (_braco, campo, piso) => {
    const divergentes = tarefas
      .filter((t) => t[piso] !== Math.min(...t[campo].map((variante) => variante.length)))
      .map((t) => `${t.id}: piso ${t[piso]}`);
    expect(divergentes).toEqual([]);
  });

  it('não começa variante do gabarito A por uma tool que exige um id', () => {
    // Um id (`exerciseId`, `sessionId`, `goalId`...) só existe na resposta de outra tool: o pedido
    // de uma pessoa nunca o traz. Variante que começa por ela tem piso subcontado.
    const exigeId = (tool: McpToolDef) =>
      Object.entries(tool.inputSchema as Record<string, ZodTypeAny>).some(
        ([campo, schema]) => /(^id$|Id$)/.test(campo) && !schema.isOptional(),
      );
    const problemas = tarefas.flatMap((t) =>
      t.gabarito_a
        .filter((variante) => variante.length > 0)
        .filter((variante) => {
          const primeira = entidade.get(variante[0]);
          return primeira !== undefined && exigeId(primeira);
        })
        .map((variante) => `${t.id}: ${variante[0]}`),
    );
    expect(problemas).toEqual([]);
  });

  it.each([
    ['A', 'argumentos', 'gabarito_a', entidade],
    ['B', 'argumentos_b', 'gabarito_b', bracoB],
  ] as const)(
    'escreve os argumentos %s com campos e valores que o schema da tool aceita',
    (_braco, campo, gabarito, anunciadas) => {
      const problemas: string[] = [];

      for (const t of tarefas) {
        const argumentos = t[campo];
        if (!argumentos) continue;

        if (!t[gabarito].flat().includes(argumentos.tool)) {
          problemas.push(`${t.id}: ${argumentos.tool} não está no gabarito`);
        }
        const tool = anunciadas.get(argumentos.tool);
        if (!tool) {
          problemas.push(`${t.id}: ${argumentos.tool} não existe no braço`);
          continue;
        }
        const schema = tool.inputSchema as Record<string, ZodTypeAny>;
        for (const [chave, valor] of Object.entries(argumentos.contem)) {
          const campoDoSchema = schema[chave];
          if (!campoDoSchema) {
            problemas.push(`${t.id}: ${argumentos.tool} não tem o campo ${chave}`);
          } else if (!campoDoSchema.safeParse(substituirPlaceholders(valor)).success) {
            problemas.push(`${t.id}: ${argumentos.tool}.${chave} recusa ${JSON.stringify(valor)}`);
          }
        }
      }
      expect(problemas).toEqual([]);
    },
  );
});

describe('superfície de intenção (braço B)', () => {
  it('não reusa nome de tool de entidade', () => {
    expect(INTENT_TOOLS.filter((tool) => entidade.has(tool.name)).map((t) => t.name)).toEqual([]);
    expect(intencao.size).toBe(INTENT_TOOLS.length);
  });

  it('só compõe tools que existem', () => {
    const inexistentes = INTENT_TOOLS.flatMap((tool) =>
      tool.compoe.filter((perna) => !entidade.has(perna)).map((perna) => `${tool.name}: ${perna}`),
    );
    expect(inexistentes).toEqual([]);
  });

  it('anota cada tool de intenção tão restritiva quanto a perna mais restritiva, e nunca destrutiva', () => {
    const problemas = INTENT_TOOLS.flatMap((tool: IntentToolSpec) => {
      const pernas = tool.compoe
        .map((perna) => entidade.get(perna))
        .filter(Boolean) as McpToolDef[];
      const exigida = Math.max(...pernas.map(restricao));
      const declarada = restricao(tool);
      if (declarada === 3) return [`${tool.name}: destrutiva não se redesenha`];
      if (exigida === 3) return [`${tool.name}: compõe uma destrutiva`];
      return declarada === exigida
        ? []
        : [`${tool.name}: declarada ${declarada}, pernas ${exigida}`];
    });
    expect(problemas).toEqual([]);
  });

  it('serve iguais as tools de entidade compartilhadas', () => {
    for (const nome of SHARED_ENTITY_TOOLS) expect(entidade.has(nome)).toBe(true);
  });

  it('só tem tool de intenção que alguma tarefa pede', () => {
    const pedidas = new Set(tarefas.flatMap((t) => t.gabarito_b.flat()));
    expect(INTENT_TOOLS.filter((tool) => !pedidas.has(tool.name)).map((t) => t.name)).toEqual([]);
  });

  it('traz, em toda tool que escreve, um exemplo que o próprio schema aceita', () => {
    const problemas = INTENT_TOOLS.filter((tool) => !tool.annotations.readOnlyHint).flatMap(
      (tool) => {
        const json = exemplo(tool.description);
        if (json === undefined) return [`${tool.name}: sem exemplo`];
        const valido = z.object(tool.inputSchema).strict().safeParse(json).success;
        return valido ? [] : [`${tool.name}: o exemplo não passa no schema`];
      },
    );
    expect(problemas).toEqual([]);
  });
});
