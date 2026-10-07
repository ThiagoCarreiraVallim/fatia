import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpToolContext, McpToolDef } from '../../common/decorators/tool.decorator';
import { PrismaService } from '../../common/prisma.service';
import { GetStepsForDateTool } from '../../progress/mcp/get-steps-for-date.tool';
import { GetStepsHistoryTool } from '../../progress/mcp/get-steps-history.tool';
import { GetWaterForDateTool } from '../../progress/mcp/get-water-for-date.tool';
import { LogStepsTool } from '../../progress/mcp/log-steps.tool';
import { LogWaterTool } from '../../progress/mcp/log-water.tool';
import { LogWeightTool } from '../../progress/mcp/log-weight.tool';
import { StepLogService } from '../../progress/step-log.service';
import { WaterLogService } from '../../progress/water-log.service';
import { WeightLogService } from '../../progress/weight-log.service';
import { ExerciseService } from '../../workout/exercise.service';
import { ExplainFormTool } from '../../workout/mcp/explain-form.tool';
import {
  apagarContaDeAvaliacao,
  garantirCatalogos,
  semearContaDeAvaliacao,
  type ContasDeAvaliacao,
} from './support/conta-de-avaliacao';

/**
 * A saída das tools de entidade que tinham regra no próprio `execute`, gravada **antes** de a
 * regra descer para o service, sobre a conta de avaliação do eval da fronteira.
 *
 * As tools de intenção do braço B compõem estas pernas pelos services. Para isso a regra
 * (`goalReached`, médias, dias batidos, a projeção de `explain_form`) tinha de sair do
 * `execute`, e mover código é exatamente onde um braço A "igual" passa a ser outro sem nada
 * acusar. Este spec é o que acusa: a saída de cada perna tem de ser a mesma de antes, byte a
 * byte depois de normalizar o que é aleatório (uuid, id de catálogo, carimbo do banco).
 *
 * Regravar o golden (`GRAVAR_GOLDEN=1`) é mudar o braço A — só com o código de antes.
 */

const GOLDEN = resolve(__dirname, '__golden__/pernas-com-regra.json');
const ROTULO = 'golden-pernas';
/** Uma quarta-feira, à tarde em Cuiabá. Fixo: o seed e os services leem o mesmo "agora". */
const AGORA = new Date('2026-09-23T19:00:00Z');
const ONTEM = '2026-09-22';
const ANTEONTEM = '2026-09-21';

type Caso = {
  nome: string;
  tool: McpToolDef;
  input: Record<string, unknown>;
  conta: keyof Pick<ContasDeAvaliacao, 'usuarioId' | 'profissionalId'>;
};

/**
 * Troca o que muda a cada execução por um marcador estável. O mesmo valor ganha o mesmo
 * marcador — uma refeição citada duas vezes continua sendo a mesma.
 */
function normalizar(valor: unknown): unknown {
  const marcas = new Map<string, string>();
  const marca = (bruto: unknown) => {
    const chave = String(bruto);
    if (!marcas.has(chave)) marcas.set(chave, `<id:${marcas.size + 1}>`);
    return marcas.get(chave);
  };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const andar = (v: unknown, chave?: string): unknown => {
    if (chave && /^(createdAt|updatedAt)$/.test(chave)) return '<carimbo>';
    if (chave && /(^id$|Id$)/.test(chave) && v !== null && v !== undefined) return marca(v);
    if (typeof v === 'string' && uuid.test(v)) return marca(v);
    if (Array.isArray(v)) return v.map((x) => andar(x));
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, andar(x, k)]));
    }
    return v;
  };
  return andar(JSON.parse(JSON.stringify(valor)));
}

describe('pernas com regra no execute — saída igual à de antes do refactor', () => {
  const prisma = new PrismaService();
  const waters = new WaterLogService(prisma);
  const steps = new StepLogService(prisma);
  const weights = new WeightLogService(prisma);
  const exercises = new ExerciseService(prisma);
  let contas: ContasDeAvaliacao;

  // A ordem importa e é fixa: as leituras antes, as escritas depois, e a releitura depois das
  // escritas — é ela que confere o `goalReached` de um dia que mudou.
  const casos = (): Caso[] => [
    {
      nome: 'agua hoje',
      tool: new GetWaterForDateTool(waters, prisma),
      input: {},
      conta: 'usuarioId',
    },
    {
      nome: 'agua ontem',
      tool: new GetWaterForDateTool(waters, prisma),
      input: { date: ONTEM },
      conta: 'usuarioId',
    },
    {
      nome: 'agua sem meta',
      tool: new GetWaterForDateTool(waters, prisma),
      input: {},
      conta: 'profissionalId',
    },
    {
      nome: 'passos hoje',
      tool: new GetStepsForDateTool(steps, prisma),
      input: {},
      conta: 'usuarioId',
    },
    {
      nome: 'passos anteontem',
      tool: new GetStepsForDateTool(steps, prisma),
      input: { date: ANTEONTEM },
      conta: 'usuarioId',
    },
    {
      nome: 'passos sem meta',
      tool: new GetStepsForDateTool(steps, prisma),
      input: {},
      conta: 'profissionalId',
    },
    {
      nome: 'historico de passos 7',
      tool: new GetStepsHistoryTool(steps, prisma),
      input: { days: 7 },
      conta: 'usuarioId',
    },
    {
      nome: 'historico de passos 30',
      tool: new GetStepsHistoryTool(steps, prisma),
      input: { days: 30 },
      conta: 'usuarioId',
    },
    {
      nome: 'historico de passos sem meta',
      tool: new GetStepsHistoryTool(steps, prisma),
      input: { days: 14 },
      conta: 'profissionalId',
    },
    {
      nome: 'forma do supino',
      tool: new ExplainFormTool(exercises),
      input: { exerciseName: 'supino reto' },
      conta: 'usuarioId',
    },
    {
      nome: 'forma inexistente',
      tool: new ExplainFormTool(exercises),
      input: { exerciseName: 'xyzzy' },
      conta: 'usuarioId',
    },
    {
      nome: 'registra agua hoje',
      tool: new LogWaterTool(waters, prisma),
      input: { ml: 500 },
      conta: 'usuarioId',
    },
    {
      nome: 'registra agua ontem',
      tool: new LogWaterTool(waters, prisma),
      input: { ml: 3000, date: ONTEM },
      conta: 'usuarioId',
    },
    {
      nome: 'registra agua sem meta',
      tool: new LogWaterTool(waters, prisma),
      input: { ml: 250 },
      conta: 'profissionalId',
    },
    {
      nome: 'registra passos ontem',
      tool: new LogStepsTool(steps, prisma),
      input: { steps: 12000, date: ONTEM },
      conta: 'usuarioId',
    },
    {
      nome: 'registra passos hoje',
      tool: new LogStepsTool(steps, prisma),
      input: { steps: 100 },
      conta: 'usuarioId',
    },
    {
      nome: 'registra passos sem meta',
      tool: new LogStepsTool(steps, prisma),
      input: { steps: 5000 },
      conta: 'profissionalId',
    },
    {
      nome: 'registra peso',
      tool: new LogWeightTool(weights),
      input: { weightKg: 77.2 },
      conta: 'usuarioId',
    },
    {
      nome: 'agua ontem depois',
      tool: new GetWaterForDateTool(waters, prisma),
      input: { date: ONTEM },
      conta: 'usuarioId',
    },
    {
      nome: 'passos ontem depois',
      tool: new GetStepsForDateTool(steps, prisma),
      input: { date: ONTEM },
      conta: 'usuarioId',
    },
    {
      nome: 'historico de passos depois',
      tool: new GetStepsHistoryTool(steps, prisma),
      input: { days: 7 },
      conta: 'usuarioId',
    },
  ];

  beforeAll(async () => {
    await garantirCatalogos(prisma);
    contas = semearContaDeAvaliacao({ rotulo: ROTULO, agora: AGORA });
    // Só o relógio de parede: o Prisma e o Jest continuam com timers de verdade.
    jest.useFakeTimers({
      now: AGORA,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
  }, 300_000);

  afterAll(async () => {
    jest.useRealTimers();
    await apagarContaDeAvaliacao(prisma, ROTULO);
    await prisma.$disconnect();
  });

  it('devolve, caso a caso e na mesma ordem, o que o golden gravou', async () => {
    const saidas: Record<string, unknown> = {};
    for (const caso of casos()) {
      const ctx: McpToolContext = { userId: contas[caso.conta], timezone: contas.fuso };
      // O erro também é saída: a mensagem e a classe dele são o que o modelo lê.
      const saida = await caso.tool.execute(caso.input, ctx).catch((err: Error) => ({
        erro: `${err.constructor.name}: ${err.message}`,
      }));
      saidas[caso.nome] = { tool: caso.tool.name, saida };
    }
    const atual = normalizar(saidas);

    if (process.env.GRAVAR_GOLDEN === '1') {
      writeFileSync(GOLDEN, `${JSON.stringify(atual, null, 2)}\n`);
    }
    expect(existsSync(GOLDEN)).toBe(true);
    expect(atual).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
  });
});
