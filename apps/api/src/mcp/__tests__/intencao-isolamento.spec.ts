import type { TestingModule } from '@nestjs/testing';
import type { McpToolContext, McpToolDef } from '../../common/decorators/tool.decorator';
import { PrismaService } from '../../common/prisma.service';
import { INTENT_TOOLS } from '../intent/intent-surface';
import { EditWorkoutPlanTool } from '../intent/tools/edit-workout-plan.tool';
import { FindMealsTool } from '../intent/tools/find-meals.tool';
import { FinishWorkoutTool } from '../intent/tools/finish-workout.tool';
import { FixMealTool } from '../intent/tools/fix-meal.tool';
import { GetDayOverviewTool } from '../intent/tools/get-day-overview.tool';
import { GetExerciseInsightTool } from '../intent/tools/get-exercise-insight.tool';
import { GetGoalsOverviewTool } from '../intent/tools/get-goals-overview.tool';
import { GetPeriodOverviewTool } from '../intent/tools/get-period-overview.tool';
import { GetSharingOverviewTool } from '../intent/tools/get-sharing-overview.tool';
import { GetStudentOverviewTool } from '../intent/tools/get-student-overview.tool';
import { MarkGoalDoneTool } from '../intent/tools/mark-goal-done.tool';
import { RecordMealTool } from '../intent/tools/record-meal.tool';
import { RecordMeasurementTool } from '../intent/tools/record-measurement.tool';
import { RecordSetsTool } from '../intent/tools/record-sets.tool';
import { ShareMyDataTool } from '../intent/tools/share-my-data.tool';
import { StartWorkoutTool } from '../intent/tools/start-workout.tool';
import { StopSharingTool } from '../intent/tools/stop-sharing.tool';
import { UpdateMyTargetsTool } from '../intent/tools/update-my-targets.tool';
import {
  apagarContaDeAvaliacao,
  garantirCatalogos,
  semearContaDeAvaliacao,
  type ContasDeAvaliacao,
} from './support/conta-de-avaliacao';
import {
  executor,
  fixarRelogio,
  montarModuloDeTools,
  type Executar,
} from './support/modulo-de-tools';

/**
 * Isolamento por usuário em toda tool de intenção, contra Postgres real.
 *
 * As tools de intenção não recebem id: resolvem plano, meta, refeição, profissional e aluno
 * **pelo nome** — e as duas contas abaixo são o mesmo seed, com os mesmos nomes. É o pior
 * caso para quem resolve nome: "o plano Peito", "o Carlos", "a Ana" existem nas duas. Cada
 * tool roda como a conta B, e o spec exige que a resposta não carregue nenhum id da conta A e
 * que nada da conta A mude.
 */

/** Fixo, como nos outros specs da conta de avaliação: o seed e os services leem o mesmo agora. */
const AGORA = new Date('2026-09-23T19:00:00Z');
const ROTULO_A = 'isolamento-a';
const ROTULO_B = 'isolamento-b';

type Caso = {
  tool: abstract new (...args: never[]) => McpToolDef;
  input: Record<string, unknown>;
  persona: 'usuario' | 'profissional';
};

/** Uma chamada por tool de intenção, mirando nomes que existem nas duas contas. */
const CASOS: Caso[] = [
  { tool: GetDayOverviewTool, input: { day: 'yesterday' }, persona: 'usuario' },
  { tool: GetPeriodOverviewTool, input: { period: 'last_30_days' }, persona: 'usuario' },
  { tool: FindMealsTool, input: { food: 'feijão' }, persona: 'usuario' },
  { tool: GetExerciseInsightTool, input: { exercise: 'supino reto' }, persona: 'usuario' },
  { tool: GetGoalsOverviewTool, input: {}, persona: 'usuario' },
  { tool: GetSharingOverviewTool, input: {}, persona: 'usuario' },
  {
    tool: GetStudentOverviewTool,
    input: { student: 'Ana', scope: 'WORKOUT' },
    persona: 'profissional',
  },
  {
    tool: RecordMealTool,
    input: { mealType: 'SNACK', items: [{ food: 'banana prata', grams: 100 }] },
    persona: 'usuario',
  },
  {
    tool: FixMealTool,
    input: { day: 'today', mealType: 'LUNCH', item: 'feijão', grams: 150 },
    persona: 'usuario',
  },
  { tool: UpdateMyTargetsTool, input: { proteinMinG: 190 }, persona: 'usuario' },
  { tool: RecordMeasurementTool, input: { kind: 'water_ml', value: 300 }, persona: 'usuario' },
  {
    tool: RecordSetsTool,
    input: { exercise: 'supino reto', sets: 2, reps: 8, weightKg: 70 },
    persona: 'usuario',
  },
  { tool: FinishWorkoutTool, input: {}, persona: 'usuario' },
  { tool: StartWorkoutTool, input: { plan: 'peito' }, persona: 'usuario' },
  {
    tool: EditWorkoutPlanTool,
    input: { plan: 'perna', add: [{ exercise: 'leg press' }] },
    persona: 'usuario',
  },
  { tool: MarkGoalDoneTool, input: { goal: 'correr 5 km' }, persona: 'usuario' },
  {
    tool: ShareMyDataTool,
    input: { professional: 'Carlos', scopes: ['NUTRITION'] },
    persona: 'usuario',
  },
  { tool: StopSharingTool, input: { professional: 'Carlos' }, persona: 'usuario' },
];

describe('isolamento por usuário nas tools de intenção', () => {
  const prisma = new PrismaService();
  let modulo: TestingModule;
  let $: Executar;
  let a: ContasDeAvaliacao;
  let b: ContasDeAvaliacao;

  /** Tudo o que pertence às três pessoas da conta A, como o banco guarda. */
  async function fotoDaContaA() {
    const ids = [a.usuarioId, a.profissionalId, a.alunaId];
    const deles = { userId: { in: ids } };
    return {
      users: await prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }),
      meals: await prisma.meal.findMany({
        where: deles,
        include: { items: true },
        orderBy: { id: 'asc' },
      }),
      water: await prisma.waterLog.findMany({ where: deles, orderBy: { id: 'asc' } }),
      steps: await prisma.stepLog.findMany({ where: deles, orderBy: { id: 'asc' } }),
      weight: await prisma.weightLog.findMany({ where: deles, orderBy: { id: 'asc' } }),
      plans: await prisma.workoutPlan.findMany({
        where: deles,
        include: { exercises: true },
        orderBy: { id: 'asc' },
      }),
      sessions: await prisma.workoutSession.findMany({
        where: deles,
        include: { sets: true },
        orderBy: { id: 'asc' },
      }),
      goals: await prisma.goal.findMany({ where: deles, orderBy: { id: 'asc' } }),
      userGoals: await prisma.userGoals.findMany({ where: deles }),
      targets: await prisma.nutrientTarget.findMany({ where: deles, orderBy: { id: 'asc' } }),
      links: await prisma.professionalLink.findMany({
        where: { OR: [{ subjectUserId: { in: ids } }, { professionalId: { in: ids } }] },
        orderBy: { id: 'asc' },
      }),
      memberships: await prisma.groupMembership.findMany({ where: deles, orderBy: { id: 'asc' } }),
    };
  }

  function idsEm(valor: unknown): Set<string> {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    return new Set(JSON.stringify(valor).match(uuid) ?? []);
  }

  beforeAll(async () => {
    await garantirCatalogos(prisma);
    modulo = await montarModuloDeTools();
    $ = executor(modulo);
    a = semearContaDeAvaliacao({ rotulo: ROTULO_A, agora: AGORA, estados: ['sessao_ativa'] });
    b = semearContaDeAvaliacao({ rotulo: ROTULO_B, agora: AGORA, estados: ['sessao_ativa'] });
    fixarRelogio(AGORA);
  }, 300_000);

  afterAll(async () => {
    jest.useRealTimers();
    await apagarContaDeAvaliacao(prisma, ROTULO_A);
    await apagarContaDeAvaliacao(prisma, ROTULO_B);
    await modulo.close();
    await prisma.$disconnect();
  });

  it('cobre todas as tools de intenção', () => {
    const cobertas = new Set(
      CASOS.map((c) => modulo.get<McpToolDef>(c.tool, { strict: false }).name),
    );
    expect([...cobertas].sort()).toEqual(INTENT_TOOLS.map((t) => t.name).sort());
  });

  it('resolve nome só entre os dados de quem chama: nada da conta A sai nem muda', async () => {
    const antes = await fotoDaContaA();
    const deA = idsEm(antes);
    expect(deA.size).toBeGreaterThan(50);

    const vazamentos: string[] = [];
    for (const caso of CASOS) {
      const ctx: McpToolContext = {
        userId: caso.persona === 'usuario' ? b.usuarioId : b.profissionalId,
        timezone: b.fuso,
      };
      const saida = await $(caso.tool, caso.input, ctx);
      const nome = modulo.get<McpToolDef>(caso.tool, { strict: false }).name;
      const deles = [...idsEm(saida)].filter((id) => deA.has(id));
      if (deles.length > 0) vazamentos.push(`${nome}: ${deles.join(', ')}`);
    }

    expect(vazamentos).toEqual([]);
    expect(await fotoDaContaA()).toEqual(antes);
  }, 120_000);
});
