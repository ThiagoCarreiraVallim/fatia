/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { DailyAdherenceService } from '../../nutrition/daily-adherence.service';
import { MealService } from '../../nutrition/meal.service';
import { MealTemplateService } from '../../nutrition/meal-template.service';
import { NutritionPlanService } from '../../nutrition/nutrition-plan.service';
import { UserGoalsService } from '../../nutrition/user-goals.service';
import type { NotificationService } from '../../notifications/notification.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { AccountService } from '../../users/account.service';
import { AccessAuditService } from '../access-audit.service';
import { ContentService } from '../content.service';
import { NutritionCopyService } from '../nutrition-copy.service';
import { PlanMaterializerService } from '../plan-materializer.service';
import { PlanOfferService } from '../plan-offer.service';
import { PlanSendService } from '../plan-send.service';
import { ProfessionalAccessService } from '../professional-access.service';
import { SharedWithService } from '../shared-with.service';
import { OnboardingService } from '../../nutrition/onboarding.service';
import { PreviaDaAcaoService } from '../../chat/previa/previa-da-acao.service';
import type { McpToolRegistry } from '../../mcp/mcp-tool.registry';
import { todayInTz } from '../../progress/helpers/date-tz';

describe('revisão da #465: plano alimentar', () => {
  const prisma = new PrismaService();
  const notifications = { notify: jest.fn() } as unknown as NotificationService;
  const workoutPlans = new WorkoutPlanService(prisma);
  const materializer = new PlanMaterializerService(prisma, new ExerciseService(prisma));
  const meals = new MealService(prisma);
  const content = new ContentService(
    prisma,
    workoutPlans,
    new MealTemplateService(prisma, meals),
    new UserGoalsService(prisma),
    materializer,
    new MediaService(prisma, new MemoryObjectStore()),
  );
  const offers = new PlanOfferService(prisma, materializer, notifications, workoutPlans);
  const nutritionPlans = new NutritionPlanService(
    prisma,
    meals,
    new DailyAdherenceService(prisma),
    new SharedWithService(prisma),
  );
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const send = new PlanSendService(prisma, offers, nutritionPlans, notifications, access);
  const copies = new NutritionCopyService(prisma, nutritionPlans, access, notifications);
  void AccountService;
  void SharedWithService;

  const TZ = 'America/Sao_Paulo';
  const stamp = `rev465-${Date.now()}`;
  const created: string[] = [];
  const foodIds: number[] = [];
  const u: Record<string, string> = {};
  const m: Record<string, string> = {};
  const f: Record<string, number> = {};
  let n = 0;
  let g = '';

  async function person(k: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: k, timezone: TZ },
    });
    created.push(user.id);
    u[k] = user.id;
    return user.id;
  }
  /** Aluno novo, ativo, com vínculo de Alimentação com a Helena e o Carlos. */
  async function student(k: string) {
    await person(k);
    m[k] = (
      await prisma.groupMembership.create({
        data: { groupId: g, userId: u[k]!, role: 'MEMBER', status: 'ACTIVE' },
      })
    ).id;
    await prisma.professionalLink.createMany({
      data: [
        { subjectUserId: u[k]!, professionalId: u.helena!, groupId: g, scopes: ['NUTRITION'] },
        { subjectUserId: u[k]!, professionalId: u.carlos!, groupId: g, scopes: ['NUTRITION'] },
      ],
    });
    await prisma.userGoals.create({
      data: {
        userId: u[k]!,
        kcalMin: 1748,
        kcalMax: 1932,
        proteinMinG: 126,
        proteinMaxG: 154,
        carbsMinG: 171,
        carbsMaxG: 209,
        fatMinG: 52,
        fatMaxG: 64,
      },
    });
  }
  async function food(k: string, per100: [number, number, number, number]) {
    const [kcal, p, c, gord] = per100;
    const food = await prisma.food.create({
      data: {
        name: `${k} ${stamp}`,
        searchName: `${k} ${stamp}`.toLowerCase(),
        source: 'TACO',
        kcalPer100g: kcal,
        proteinPer100g: p,
        carbsPer100g: c,
        fatPer100g: gord,
      },
    });
    foodIds.push(food.id);
    f[k] = food.id;
  }
  const item = (foodId: number, grams: number) => ({
    foodId,
    groupId: null,
    foodName: 'x',
    grams,
    kcal: 1,
    proteinG: 1,
    carbsG: 1,
    fatG: 1,
    nutrients: null,
    portionLabel: null,
    portionQuantity: null,
  });
  /** Um modelo v1 (Fase 7), com faixas que o author escreveu. */
  async function v1Template(
    title: string,
    goals: Record<string, number>,
    foodId: number,
    author = u.helena!,
  ) {
    return (
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: g,
          authorId: author,
          kind: 'NUTRITION',
          title: title,
          snapshotVersion: 1,
          snapshot: {
            version: 1,
            goals,
            meals: [{ name: 'Café', mealType: 'BREAKFAST', items: [item(foodId, 100)] }],
          },
        },
      })
    ).id;
  }
  const doc = (fatG = 60, adjust = true) => ({
    targets: { kcal: 2000, proteinG: 150, carbsG: 210, fatG },
    adjustToStudent: adjust,
    meals: [
      {
        key: 'almoco',
        name: 'Almoço',
        time: '12:30',
        mealType: 'LUNCH',
        options: [{ items: [{ key: 'arroz', foodId: f.arroz!, grams: 100 }] }],
      },
    ],
    groups: [],
  });

  beforeAll(async () => {
    await prisma.$connect();
    for (const k of ['bruno', 'helena', 'carlos']) await person(k);
    g = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Academia', slug: `${stamp}-g`, ownerId: u.bruno! },
      })
    ).id;
    await prisma.groupMembership.createMany({
      data: [
        { groupId: g, userId: u.bruno!, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g, userId: u.helena!, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: g, userId: u.carlos!, role: 'PROFESSIONAL', status: 'ACTIVE' },
      ],
    });
    await food('arroz', [128, 2.5, 28, 0.2]);
    await food('frango', [159, 32, 0, 2.5]);
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: g } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.food.deleteMany({ where: { id: { in: foodIds } } });
    await prisma.$disconnect();
  });

  const ranges = (p: Record<string, unknown>) => ({
    kcalMin: p.kcalMin,
    kcalMax: p.kcalMax,
    proteinMinG: p.proteinMinG,
    proteinMaxG: p.proteinMaxG,
    carbsMinG: p.carbsMinG,
    carbsMaxG: p.carbsMaxG,
    fatMinG: p.fatMinG,
    fatMaxG: p.fatMaxG,
  });

  it('F1a: salvar a cópia sem mexer nas metas não muda as faixas do aluno', async () => {
    await student('ana');
    const t = await content.createNutritionTemplate(u.helena!, g, {
      title: 'T1',
      document: doc(25, false),
    });
    const r = await send.send(u.helena!, g, { templateId: t.id, membershipIds: [m.ana!] });
    const v1 = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: r.results[0]!.id } });
    await nutritionPlans.accept(u.ana!, v1.id);
    const c = await copies.get(u.helena!, g, m.ana!, v1.id);
    // Nada mudou no documento: só salvar (ex.: ajustar "o que mudou").
    const s = await copies.save(u.helena!, g, m.ana!, v1.id, {
      document: c.document,
      baseVersionId: c.version.id,
    });
    const v2 = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: s.planId } });
    expect(ranges(v2)).toEqual(ranges(v1));
  });

  it('F1b: cópia de plano enviado de modelo v1 perde as faixas do autor ao salvar sem mexer', async () => {
    await student('bia');
    const goals = {
      kcalMin: 1800,
      kcalMax: 2200,
      proteinMinG: 120,
      proteinMaxG: 180,
      carbsMinG: 200,
      carbsMaxG: 260,
      fatMinG: 50,
      fatMaxG: 70,
    };
    const tid = await v1Template('V1 faixas', goals, f.arroz!);
    const r = await send.send(u.helena!, g, { templateId: tid, membershipIds: [m.bia!] });
    const v1 = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: r.results[0]!.id } });
    expect(ranges(v1)).toEqual(goals);
    const c = await copies.get(u.helena!, g, m.bia!, v1.id);
    const s = await copies.save(u.helena!, g, m.bia!, v1.id, {
      document: c.document,
      baseVersionId: c.version.id,
    });
    const v2 = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: s.planId } });
    expect(ranges(v2)).toEqual(goals);
  });

  it('F2: modelo v1 aberto no editor e salvo (só o título) não muda as faixas que se enviam', async () => {
    await student('cris');
    const goals = {
      kcalMin: 1800,
      kcalMax: 2200,
      proteinMinG: 120,
      proteinMaxG: 180,
      carbsMinG: 200,
      carbsMaxG: 260,
      fatMinG: 50,
      fatMaxG: 70,
    };
    const tid = await v1Template('V1 editor', goals, f.arroz!);
    const view = await content.getTemplateForTeam(u.helena!, g, tid);
    // O que a tela do editor manda ao salvar: título + document inteiro.
    const d = view.nutritionDocument!;
    await content.updateTemplate(u.helena!, g, tid, {
      title: 'V1 editor (renomeado)',
      document: {
        targets: d.targets,
        adjustToStudent: d.adjustToStudent,
        meals: d.meals.map((x: any) => ({
          ...x,
          options: x.options.map((o: any) => ({
            items: o.items.map((i: any) => ({
              key: i.key,
              groupKey: i.groupKey,
              foodId: i.foodId!,
              grams: i.grams,
            })),
          })),
        })),
        groups: [],
      },
    });
    const r = await send.send(u.helena!, g, { templateId: tid, membershipIds: [m.cris!] });
    const p = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: r.results[0]!.id } });
    expect(ranges(p)).toEqual(goals);
  });

  it('F3: a sugestão de metas da equipe no onboarding enxerga modelo v2 publicado', async () => {
    await student('duda');
    const t = await content.createNutritionTemplate(u.helena!, g, {
      title: 'V2 pub',
      document: doc(),
    });
    await prisma.groupPlanTemplate.update({
      where: { id: t.id },
      data: { publishedAt: new Date() },
    });
    const ob = new OnboardingService(prisma);
    const prog = await ob.getProgress(u.duda!);
    expect(prog.teamSuggestion).not.toBeNull();
  });

  it('F4: a prévia do adopt_group_plan mostra a troca de metas para modelo v2', async () => {
    const t = await prisma.groupPlanTemplate.findFirstOrThrow({
      where: { groupId: g, title: 'V2 pub' },
    });
    const previews = new PreviaDaAcaoService({} as McpToolRegistry, prisma);
    const lines = await (
      previews as unknown as {
        goalsBeforeAndAfter(u: string, a: unknown): Promise<unknown[]>;
      }
    ).goalsBeforeAndAfter(u.duda!, { groupId: g, templateId: t.id, applyGoals: true });
    // E a adoção de fato troca as metas (legacyNutritionView lê os targets).
    const adopted = await content.adopt(u.duda!, g, t.id, { applyGoals: true, saveMeals: false });
    expect(adopted.goalsApplied).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('F5: autor que apagou a conta — a cópia salva por outro fica presa (dois pendentes / 409)', async () => {
    await student('eva');
    const t = await content.createNutritionTemplate(u.helena!, g, {
      title: 'T órfão',
      document: doc(),
    });
    const r = await send.send(u.helena!, g, { templateId: t.id, membershipIds: [m.eva!] });
    const v1 = r.results[0]!.id;
    // Helena apaga a conta: authorId vira nulo (onDelete: SetNull). Plano ainda pendente.
    await prisma.nutritionPlan.updateMany({ where: { userId: u.eva! }, data: { authorId: null } });
    const c = await copies.get(u.carlos!, g, m.eva!, v1);
    await copies.save(u.carlos!, g, m.eva!, v1, {
      document: c.document,
      baseVersionId: c.version.id,
    });
    const pending = await prisma.nutritionPlan.count({ where: { userId: u.eva!, status: 'SENT' } });
    // Reabrir a mesma cópia deveria mostrar a versão que o Carlos acabou de salvar.
    const c2 = await copies.get(u.carlos!, g, m.eva!, v1);
    let second: unknown = null;
    try {
      await copies.save(u.carlos!, g, m.eva!, v1, {
        document: c2.document,
        baseVersionId: c2.version.id,
      });
    } catch (e) {
      second = e;
    }
    expect({
      pending,
      reopenedVersion: c2.version.version,
      second: second && (second as Error).constructor.name,
    }).toEqual({ pending: 1, reopenedVersion: 2, second: null });
  });

  it('F6: aceitar plano de OUTRO modelo/autor não arrasta o "comi isso" de hoje por chave v1 coincidente', async () => {
    await student('fabi');
    const goals = {
      kcalMin: 1800,
      kcalMax: 2200,
      proteinMinG: 120,
      proteinMaxG: 180,
      carbsMinG: 200,
      carbsMaxG: 260,
      fatMinG: 50,
      fatMaxG: 70,
    };
    const tA = await v1Template('A (Helena)', goals, f.arroz!, u.helena!);
    const tB = await v1Template('B (Carlos)', goals, f.frango!, u.carlos!);
    const rA = await send.send(u.helena!, g, { templateId: tA, membershipIds: [m.fabi!] });
    await nutritionPlans.accept(u.fabi!, rA.results[0]!.id);
    const cafeA = await prisma.nutritionPlanMeal.findFirstOrThrow({
      where: { planId: rA.results[0]!.id },
    });
    await nutritionPlans.logMeal(u.fabi!, cafeA.id, {}, TZ);
    const rB = await send.send(u.carlos!, g, { templateId: tB, membershipIds: [m.fabi!] });
    await nutritionPlans.accept(u.fabi!, rB.results[0]!.id);
    const ov = await nutritionPlans.overview(u.fabi!, TZ, todayInTz(TZ));
    // O café do Carlos (frango) aparece como "comi isso" hoje, mas ela comeu o arroz da Helena.
    expect(ov.active!.meals[0]!.logged).toBeNull();
  });

  it('P1 (sonda): dois saves simultâneos da mesma base — só um passa', async () => {
    await student('gil');
    const t = await content.createNutritionTemplate(u.helena!, g, {
      title: 'Corrida',
      document: doc(),
    });
    const r = await send.send(u.helena!, g, { templateId: t.id, membershipIds: [m.gil!] });
    const c = await copies.get(u.helena!, g, m.gil!, r.results[0]!.id);
    const out = await Promise.allSettled([
      copies.save(u.helena!, g, m.gil!, r.results[0]!.id, {
        document: c.document,
        baseVersionId: c.version.id,
      }),
      copies.save(u.carlos!, g, m.gil!, r.results[0]!.id, {
        document: c.document,
        baseVersionId: c.version.id,
      }),
    ]);
    expect(out.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('P2 (sonda): enviar com ajuste sem porta de Alimentação não ajusta e não vaza', async () => {
    await student('hugo');
    await prisma.professionalLink.updateMany({
      where: { subjectUserId: u.hugo! },
      data: { scopes: ['WORKOUT'] },
    });
    const t = await content.createNutritionTemplate(u.helena!, g, {
      title: 'Sem porta',
      document: doc(),
    });
    const r = await send.send(u.helena!, g, { templateId: t.id, membershipIds: [m.hugo!] });
    const p = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: r.results[0]!.id } });
    expect(p.kcalMin).toBe(1900);
    const denied = await prisma.professionalAccessLog.findFirst({
      where: { subjectUserId: u.hugo!, action: 'nutrition_plan_adjust', denied: true },
    });
    expect(denied).not.toBeNull();
  });

  it('P3 (sonda): PUT da cópia pela ficha de outro aluno / sem baseVersion', async () => {
    await student('ivo');
    await student('jo');
    const t = await content.createNutritionTemplate(u.helena!, g, {
      title: 'Iso',
      document: doc(),
    });
    const r = await send.send(u.helena!, g, { templateId: t.id, membershipIds: [m.ivo!] });
    const c = await copies.get(u.helena!, g, m.ivo!, r.results[0]!.id);
    await expect(
      copies.save(u.helena!, g, m.jo!, r.results[0]!.id, { document: c.document }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
