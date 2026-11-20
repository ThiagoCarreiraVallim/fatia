import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
import { AccessAuditService } from '../access-audit.service';
import { ContentService } from '../content.service';
import { NutritionCopyService } from '../nutrition-copy.service';
import { PlanMaterializerService } from '../plan-materializer.service';
import { PlanOfferService } from '../plan-offer.service';
import { PlanSendService } from '../plan-send.service';
import { ProfessionalAccessService } from '../professional-access.service';
import { SharedWithService } from '../shared-with.service';

/**
 * O editor de plano alimentar da equipe (#407, Pn-24 a Pn-24c), no Postgres real.
 *
 * O roteiro é o critério de pronto: a Helena cria "Hipertrofia 2.000 kcal",
 * define o grupo "Carboidrato 2" com cinco equivalentes e envia para a Ana
 * ajustando às 1.840 kcal dela. A Ana aceita e troca o arroz por batata-doce
 * no almoço; a Helena abre a cópia, muda o lanche e salva sem perder a troca.
 */
describe('editor de plano alimentar (#407, banco real)', () => {
  const prisma = new PrismaService();
  const notify = jest.fn();
  const notifications = { notify } as unknown as NotificationService;
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

  const TZ = 'America/Sao_Paulo';
  const stamp = `nutri-editor-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  const foodIds: number[] = [];
  const u: Record<string, string> = {};
  const m: Record<string, string> = {};
  const f: Record<string, number> = {};
  let n = 0;
  let g = '';
  let g2 = '';

  async function pessoa(k: string, nome = k) {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: nome,
        timezone: TZ,
      },
    });
    criados.push(user.id);
    u[k] = user.id;
    return user.id;
  }

  async function alimento(
    k: string,
    per100: [number, number, number, number],
    medida?: { label: string; grams: number },
    dono?: string,
  ) {
    const [kcal, p, c, gord] = per100;
    const food = await prisma.food.create({
      data: {
        name: `${k} ${stamp}`,
        searchName: `${k} ${stamp}`.toLowerCase(),
        source: dono ? 'CUSTOM' : 'TACO',
        createdByUserId: dono ?? null,
        kcalPer100g: kcal,
        proteinPer100g: p,
        carbsPer100g: c,
        fatPer100g: gord,
        ...(medida ? { portions: { create: [medida] } } : {}),
      },
    });
    foodIds.push(food.id);
    f[k] = food.id;
  }

  const membershipOf = async (groupId: string, userId: string) =>
    (
      await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId } },
      })
    ).id;

  /** O "Hipertrofia 2.000 kcal" como a tela manda. */
  function documento(lanche = 'iogurte') {
    return {
      targets: { kcal: 2000, proteinG: 150, carbsG: 210, fatG: 60 },
      adjustToStudent: true,
      meals: [
        {
          name: 'Café da manhã',
          time: '07:00',
          mealType: 'BREAKFAST',
          // Refeição vazia é válida: o aluno vê "sem sugestão" (Pn-24b).
          options: [{ items: [] }],
        },
        {
          key: 'almoco',
          name: 'Almoço',
          time: '12:30',
          mealType: 'LUNCH',
          options: [
            {
              items: [
                {
                  key: 'arroz',
                  foodId: f.arroz,
                  grams: 100,
                  portionLabel: 'colher de sopa',
                  portionQuantity: 4,
                  groupKey: 'carb2',
                },
                { key: 'frango', foodId: f.frango, grams: 120 },
              ],
            },
          ],
        },
        {
          key: 'lanche',
          name: 'Lanche',
          time: '16:00',
          mealType: 'SNACK',
          options: [{ items: [{ key: 'lanche-1', foodId: f[lanche], grams: 170 }] }],
        },
      ],
      groups: [
        {
          key: 'carb2',
          name: 'Carboidrato 2',
          keyMacro: 'carbs',
          foods: [
            { foodId: f.arroz, grams: 100, portionLabel: 'colher de sopa', portionQuantity: 4 },
            { foodId: f.batata, grams: 130, portionLabel: 'unidade média', portionQuantity: 1 },
            { foodId: f.pao, grams: 50, portionLabel: 'fatia', portionQuantity: 2 },
            { foodId: f.macarrao, grams: 110 },
            { foodId: f.mandioca, grams: 90 },
          ],
        },
      ],
    };
  }

  let templateId = '';
  let planoV1 = '';

  beforeAll(async () => {
    await prisma.$connect();
    for (const k of ['bruno', 'helena', 'carlos', 'ana', 'carla', 'ze'])
      await pessoa(k, k === 'helena' ? 'Helena Souza' : k === 'ana' ? 'Ana Dias' : k);
    g = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Academia', slug: `${stamp}-g`, ownerId: u.bruno! },
      })
    ).id;
    g2 = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Outra', slug: `${stamp}-g2`, ownerId: u.helena! },
      })
    ).id;
    grupos.push(g, g2);
    await prisma.groupMembership.createMany({
      data: [
        { groupId: g, userId: u.bruno!, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g, userId: u.helena!, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: g, userId: u.carlos!, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: g, userId: u.ana!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g, userId: u.carla!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g2, userId: u.helena!, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g2, userId: u.ze!, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    for (const k of ['helena', 'carlos', 'ana', 'carla']) m[k] = await membershipOf(g, u[k]!);
    m.ze = await membershipOf(g2, u.ze!);
    await prisma.professionalLink.createMany({
      data: [
        { subjectUserId: u.ana!, professionalId: u.helena!, groupId: g, scopes: ['NUTRITION'] },
        { subjectUserId: u.carla!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
        { subjectUserId: u.ana!, professionalId: u.carlos!, groupId: g, scopes: ['NUTRITION'] },
      ],
    });
    // 1.840 kcal da Ana (o meio da faixa).
    await prisma.userGoals.create({
      data: {
        userId: u.ana!,
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
    await alimento('arroz', [128, 2.5, 28, 0.2], { label: 'colher de sopa', grams: 25 });
    await alimento('batata', [86, 0.6, 20, 0.1], { label: 'unidade média', grams: 130 });
    await alimento('pao', [248, 9.4, 50, 3.4], { label: 'fatia', grams: 25 });
    await alimento('macarrao', [102, 3.4, 21, 0.9]);
    await alimento('mandioca', [125, 0.6, 30, 0.3]);
    await alimento('frango', [159, 32, 0, 2.5]);
    await alimento('iogurte', [51, 4.1, 1.9, 3]);
    await alimento('banana', [98, 1.3, 26, 0.1]);
    await alimento('meu', [100, 10, 10, 1], undefined, u.helena);
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.food.deleteMany({ where: { id: { in: foodIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => notify.mockClear());

  it('cria o modelo pelo editor: retrato v2 com nomes, macros e chaves', async () => {
    const t = await content.createNutritionTemplate(u.helena!, g, {
      title: 'Hipertrofia 2.000 kcal',
      document: documento(),
    });
    templateId = t.id;
    const row = await prisma.groupPlanTemplate.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.snapshotVersion).toBe(2);
    const doc = t.nutritionDocument!;
    expect(doc.targets).toEqual({ kcal: 2000, proteinG: 150, carbsG: 210, fatG: 60 });
    expect(doc.meals.map((x) => [x.name, x.time])).toEqual([
      ['Café da manhã', '07:00'],
      ['Almoço', '12:30'],
      ['Lanche', '16:00'],
    ]);
    // A refeição vazia ganha chave; a que veio com chave a mantém.
    expect(doc.meals[0]!.key).toEqual(expect.any(String));
    expect(doc.meals[1]!.key).toBe('almoco');
    const arroz = doc.meals[1]!.options[0]!.items[0]!;
    expect(arroz).toMatchObject({ key: 'arroz', groupKey: 'carb2', foodName: `arroz ${stamp}` });
    expect(arroz.carbsG).toBeCloseTo(28);
    expect(doc.groups[0]!.foods).toHaveLength(5);
    // A prévia antiga (comunidade) continua: metas em faixa, sem a refeição vazia.
    expect(t.goals).toMatchObject({ kcalMin: 1900, kcalMax: 2100 });
    expect(t.meals.map((x) => x.name)).toEqual(['Almoço', 'Lanche']);
  });

  it('alimento pessoal não entra no plano (ADR 045)', async () => {
    const doc = documento();
    doc.meals[2]!.options[0]!.items[0]!.foodId = f.meu!;
    await expect(
      content.updateTemplate(u.helena!, g, templateId, { document: doc }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('alimento sem o macro-chave não entra no grupo', async () => {
    const doc = documento();
    doc.groups[0]!.foods.push({ foodId: f.frango!, grams: 100 });
    await expect(
      content.updateTemplate(u.helena!, g, templateId, { document: doc }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('envia para a Ana ajustando às 1.840 kcal dela, com os equivalentes do grupo', async () => {
    const r = await send.send(u.helena!, g, { templateId, membershipIds: [m.ana!] });
    planoV1 = r.results[0]!.id;
    const plano = await prisma.nutritionPlan.findUniqueOrThrow({
      where: { id: planoV1 },
      include: {
        meals: {
          orderBy: { position: 'asc' },
          include: {
            options: {
              include: { items: { orderBy: { position: 'asc' }, include: { equivalents: true } } },
            },
          },
        },
      },
    });
    expect(plano).toMatchObject({ kcalMin: 1748, kcalMax: 1932, sourceTemplateId: templateId });
    const [cafe, almoco] = plano.meals;
    expect(cafe!.options[0]!.items).toHaveLength(0);
    expect(almoco).toMatchObject({ time: '12:30', key: 'almoco' });
    const arroz = almoco!.options[0]!.items[0]!;
    // 92 g → 3½ colheres de sopa.
    expect(arroz).toMatchObject({
      key: 'arroz',
      groupKey: 'carb2',
      equivalenceGroup: 'Carboidrato 2',
      grams: 87.5,
      portionQuantity: 3.5,
    });
    expect(arroz.equivalents.map((e) => e.foodId).sort()).toEqual(
      [f.batata, f.pao, f.macarrao, f.mandioca].sort(),
    );
    // Cada equivalente com o carboidrato do arroz (±10%).
    for (const e of arroz.equivalents) {
      expect(Math.abs(e.carbsG - arroz.carbsG) / arroz.carbsG).toBeLessThanOrEqual(0.1001);
    }
    expect(plano.equivalenceGroups).toEqual([expect.objectContaining({ key: 'carb2' })]);
  });

  it('refeição vazia não registra "comi isso"', async () => {
    await nutritionPlans.accept(u.ana!, planoV1);
    const cafe = await prisma.nutritionPlanMeal.findFirstOrThrow({
      where: { planId: planoV1, position: 0 },
    });
    await expect(nutritionPlans.logMeal(u.ana!, cafe.id, {}, TZ)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  let arrozV1 = '';

  it('a Ana troca o arroz por batata-doce no almoço', async () => {
    const arroz = await prisma.nutritionPlanItem.findFirstOrThrow({
      where: { option: { meal: { planId: planoV1 } }, key: 'arroz' },
      include: { equivalents: true },
    });
    arrozV1 = arroz.id;
    const batata = arroz.equivalents.find((e) => e.foodId === f.batata)!;
    await nutritionPlans.swap(u.ana!, { itemId: arroz.id, equivalentId: batata.id }, TZ);
    const ov = await nutritionPlans.overview(u.ana!, TZ);
    expect(ov.active!.meals[1]!.time).toBe('12:30');
    expect(ov.active!.meals[1]!.options[0]!.items[0]!.swap?.foodName).toBe(`batata ${stamp}`);
  });

  let baseVersion = '';

  it('a Helena abre a cópia da Ana: documento, versão e trocas que seguem', async () => {
    const c = await copies.get(u.helena!, g, m.ana!, planoV1);
    baseVersion = c.version.id;
    expect(c).toMatchObject({
      planId: planoV1,
      studentName: 'Ana Dias',
      title: 'Hipertrofia 2.000 kcal',
      authorName: 'Helena Souza',
      template: { id: templateId, title: 'Hipertrofia 2.000 kcal' },
      version: { id: planoV1, version: 1, status: 'ACCEPTED' },
      pendingUpdate: false,
      swapsKept: 1,
    });
    // O meio das faixas gravadas (55 g de gordura vira 50–61 g, e o meio, 56).
    expect(c.document.targets).toEqual({ kcal: 1840, proteinG: 138, carbsG: 193, fatG: 56 });
    expect(c.document.adjustToStudent).toBe(false);
    expect(c.document.groups[0]).toMatchObject({ key: 'carb2', keyMacro: 'carbs' });
    expect(c.document.meals[1]!.options[0]!.items[0]).toMatchObject({ key: 'arroz' });
    const trilha = await prisma.professionalAccessLog.findFirst({
      where: { subjectUserId: u.ana!, action: 'open_nutrition_copy', denied: false },
    });
    expect(trilha).not.toBeNull();
  });

  it('salvar na cópia grava a versão 2; o modelo e a versão em uso ficam como estão', async () => {
    const antes = await prisma.groupPlanTemplate.findUniqueOrThrow({ where: { id: templateId } });
    const c = await copies.get(u.helena!, g, m.ana!, planoV1);
    const doc = { ...c.document, meals: c.document.meals.map((x) => ({ ...x })) };
    // Muda o lanche: banana no lugar do iogurte.
    doc.meals[2] = {
      ...doc.meals[2]!,
      options: [
        {
          items: [
            {
              ...doc.meals[2]!.options[0]!.items[0]!,
              key: 'lanche-2',
              foodId: f.banana!,
              grams: 120,
              portionLabel: null,
              portionQuantity: null,
            },
          ],
        },
      ],
    };
    const r = await copies.save(u.helena!, g, m.ana!, planoV1, {
      document: doc,
      changeNote: 'Banana no lanche',
      baseVersionId: baseVersion,
    });
    expect(r.version).toBe(2);
    const v2 = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: r.planId } });
    expect(v2).toMatchObject({
      status: 'SENT',
      authorId: u.helena,
      editedById: u.helena,
      sourceTemplateId: templateId,
      changeNote: 'Banana no lanche',
      kcalMin: 1748,
    });
    const v1 = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: planoV1 } });
    expect(v1.status).toBe('ACCEPTED');
    const depois = await prisma.groupPlanTemplate.findUniqueOrThrow({ where: { id: templateId } });
    expect(depois.snapshot).toEqual(antes.snapshot);
    expect(notify).toHaveBeenCalledWith([u.ana], expect.anything());
    const trilha = await prisma.professionalAccessLog.findFirst({
      where: { subjectUserId: u.ana!, action: 'edit_nutrition_copy', denied: false },
    });
    expect(trilha).not.toBeNull();

    // A cópia agora abre na versão 2, esperando o aceite.
    const c2 = await copies.get(u.helena!, g, m.ana!, planoV1);
    expect(c2).toMatchObject({ version: { version: 2, status: 'SENT' }, pendingUpdate: true });
  });

  it('outra pessoa salvando a partir da versão velha recebe 409', async () => {
    const c = await copies.get(u.carlos!, g, m.ana!, planoV1);
    await expect(
      copies.save(u.carlos!, g, m.ana!, planoV1, {
        document: c.document,
        baseVersionId: baseVersion,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a Ana aceita a versão 2 e a troca do almoço continua', async () => {
    const v2 = await prisma.nutritionPlan.findFirstOrThrow({
      where: { userId: u.ana!, status: 'SENT' },
    });
    await nutritionPlans.accept(u.ana!, v2.id);
    const ov = await nutritionPlans.overview(u.ana!, TZ);
    expect(ov.active!.id).toBe(v2.id);
    const almoco = ov.active!.meals[1]!.options[0]!;
    expect(almoco.items[0]!.swap?.foodName).toBe(`batata ${stamp}`);
    expect(ov.active!.meals[2]!.options[0]!.items[0]!.foodName).toBe(`banana ${stamp}`);
    // A troca é a mesma linha, só passou a apontar a versão nova: nada se apagou.
    expect(await prisma.nutritionSwap.count({ where: { plan: { userId: u.ana! } } })).toBe(1);
    expect(await prisma.nutritionPlanItem.count({ where: { id: arrozV1 } })).toBe(1);
  });

  describe('isolamento', () => {
    it('sem Alimentação no vínculo, a cópia responde como inexistente e a recusa fica na trilha', async () => {
      await expect(copies.get(u.helena!, g, m.carla!, planoV1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await prisma.professionalLink.updateMany({
        where: { subjectUserId: u.ana!, professionalId: u.helena! },
        data: { revokedAt: new Date() },
      });
      try {
        await expect(copies.get(u.helena!, g, m.ana!, planoV1)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        const negada = await prisma.professionalAccessLog.findFirst({
          where: { subjectUserId: u.ana!, action: 'open_nutrition_copy', denied: true },
        });
        expect(negada).not.toBeNull();
      } finally {
        await prisma.professionalLink.updateMany({
          where: { subjectUserId: u.ana!, professionalId: u.helena! },
          data: { revokedAt: null },
        });
      }
    });

    it('o plano da Ana não abre pela ficha de outra pessoa nem por outra comunidade', async () => {
      await expect(copies.get(u.helena!, g, m.carla!, planoV1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(copies.get(u.helena!, g2, m.ze!, planoV1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(copies.get(u.helena!, g2, m.ana!, planoV1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
