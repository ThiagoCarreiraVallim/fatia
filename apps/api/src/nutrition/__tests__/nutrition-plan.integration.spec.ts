import { SharedWithService } from '../../sharing/shared-with.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ShareScope } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { MealService } from '../meal.service';
import { DailyAdherenceService } from '../daily-adherence.service';
import { NutritionPlanService } from '../nutrition-plan.service';
import type { SendNutritionPlanInput } from '../dto/nutrition-plan.dto';
import { todayInTz } from '../../progress/helpers/date-tz';

/**
 * Plano alimentar do profissional, lado do aluno (#376), no Postgres real.
 *
 * O roteiro é o critério de pronto da issue: a Ana recebe o v2 da Helena,
 * aceita, toca "comi isso" no almoço, troca o pão integral por tapioca (com a
 * diferença de kcal), a Helena só vê com Alimentação liberada, e "Desfazer"
 * devolve o pão.
 */
describe('plano alimentar do profissional (integração)', () => {
  const prisma = new PrismaService();
  const meals = new MealService(prisma);
  const plans = new NutritionPlanService(
    prisma,
    meals,
    new DailyAdherenceService(prisma),
    new SharedWithService(prisma),
  );
  const TZ = 'America/Sao_Paulo';

  const stamp = `plan-${Date.now()}`;
  const criados: string[] = [];
  const foodIds: number[] = [];
  let groupId = '';
  let n = 0;

  const ids = { ana: '', helena: '', colega: '', estranho: '', anaMembership: '', bruno: '' };
  const food = { pao: 0, tapioca: 0, aveia: 0, ovo: 0, arroz: 0, frango: 0, peixe: 0, custom: 0 };

  async function pessoa(nome: string) {
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
    return user.id;
  }

  async function base(nome: string, kcal: number, p: number, c: number, g: number) {
    const f = await prisma.food.create({
      data: {
        name: `${stamp} ${nome}`,
        searchName: `${stamp} ${nome}`.toLowerCase(),
        source: 'TACO',
        kcalPer100g: kcal,
        proteinPer100g: p,
        carbsPer100g: c,
        fatPer100g: g,
      },
    });
    foodIds.push(f.id);
    return f.id;
  }

  const GOALS = {
    kcalMin: 1760,
    kcalMax: 1920,
    proteinMinG: 130,
    proteinMaxG: 150,
    carbsMinG: 175,
    carbsMaxG: 205,
    fatMinG: 52,
    fatMaxG: 64,
  };

  function plano(): SendNutritionPlanInput {
    return {
      goals: GOALS,
      meals: [
        {
          mealType: 'BREAKFAST',
          name: 'Café da manhã',
          options: [
            {
              items: [
                {
                  foodId: food.pao,
                  grams: 50,
                  portionLabel: 'fatia',
                  portionQuantity: 2,
                  equivalenceGroup: 'Carboidrato',
                  equivalents: [
                    { foodId: food.tapioca, grams: 40 },
                    { foodId: food.aveia, grams: 30 },
                  ],
                },
                { foodId: food.ovo, grams: 100 },
              ],
            },
          ],
        },
        {
          mealType: 'LUNCH',
          name: 'Almoço',
          options: [
            {
              items: [
                { foodId: food.arroz, grams: 150 },
                { foodId: food.frango, grams: 120 },
              ],
            },
            { items: [{ foodId: food.peixe, grams: 150 }] },
          ],
        },
      ],
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.ana = await pessoa('Ana Demo');
    ids.helena = await pessoa('Helena Personal');
    ids.colega = await pessoa('Colega');
    ids.estranho = await pessoa('Estranho');
    const dono = await pessoa('Bruno');
    ids.bruno = dono;
    const grupo = await prisma.group.create({
      data: { type: 'SPONSORED', name: 'Academia', slug: `${stamp}-g`, ownerId: dono },
    });
    groupId = grupo.id;
    await prisma.groupMembership.createMany({
      data: [
        { groupId, userId: dono, role: 'OWNER', status: 'ACTIVE' },
        { groupId, userId: ids.helena, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId, userId: ids.ana, role: 'MEMBER', status: 'ACTIVE' },
        { groupId, userId: ids.colega, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    ids.anaMembership = (
      await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId: ids.ana } },
      })
    ).id;

    food.pao = await base('pão integral', 248, 9.4, 49.9, 3.4);
    food.tapioca = await base('tapioca goma', 340, 0, 85, 0);
    food.aveia = await base('aveia', 394, 13.9, 66.6, 8.5);
    food.ovo = await base('ovo', 146, 13.3, 0.6, 9.5);
    food.arroz = await base('arroz', 128, 2.5, 28.1, 0.2);
    food.frango = await base('frango', 159, 32, 0, 2.5);
    food.peixe = await base('peixe', 120, 22, 0, 3);
    const custom = await prisma.food.create({
      data: {
        name: `${stamp} do colega`,
        source: 'CUSTOM',
        createdByUserId: ids.colega,
        kcalPer100g: 100,
        proteinPer100g: 1,
        carbsPer100g: 1,
        fatPer100g: 1,
      },
    });
    food.custom = custom.id;
    foodIds.push(custom.id);
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.food.deleteMany({ where: { id: { in: foodIds } } });
    await prisma.$disconnect();
  });

  describe('envio (entrada do editor da equipe, #407)', () => {
    it('só a equipe da comunidade envia, e só a quem é aluno dela', async () => {
      await expect(plans.send(ids.colega, ids.anaMembership, plano())).rejects.toThrow(
        NotFoundException,
      );
      await expect(plans.send(ids.estranho, ids.anaMembership, plano())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('recusa alimento personalizado de outra conta (ADR 045: só a base)', async () => {
      const p = plano();
      p.meals[0]!.options[0]!.items[0]!.equivalents = [{ foodId: food.custom, grams: 10 }];
      await expect(plans.send(ids.helena, ids.anaMembership, p)).rejects.toThrow(NotFoundException);
    });

    it('recusa faixa com mínimo acima do máximo', async () => {
      const p = plano();
      p.goals = { ...GOALS, kcalMin: 2000, kcalMax: 1900 };
      await expect(plans.send(ids.helena, ids.anaMembership, p)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('numera as versões e a nova substitui a que ainda esperava o aceite', async () => {
      const v1 = await plans.send(ids.helena, ids.anaMembership, plano());
      const v2 = await plans.send(ids.helena, ids.anaMembership, plano());
      expect([v1.version, v2.version]).toEqual([1, 2]);
      const antigo = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: v1.id } });
      expect(antigo.status).toBe('SUPERSEDED');

      const visao = await plans.overview(ids.ana, TZ);
      expect(visao.active).toBeNull();
      expect(visao.pending?.id).toBe(v2.id);
      expect(visao.pending?.author).toEqual({ name: 'Helena Personal' });
      // Os macros são calculados da base: 50 g de pão a 248 kcal/100 g.
      const pao = visao.pending!.meals[0]!.options[0]!.items[0]!;
      expect(pao.kcal).toBeCloseTo(124);
      expect(pao.equivalents.map((e) => Math.round(e.kcal))).toEqual([136, 118]);
    });
  });

  describe('do aceite à troca desfeita (critério de pronto)', () => {
    let planId = '';
    let breakfastId = '';
    let lunchId = '';
    let lunchOption2 = '';
    let paoItemId = '';
    let tapiocaId = '';

    beforeAll(async () => {
      planId = (await plans.overview(ids.ana, TZ)).pending!.id;
    });

    it('o plano de outra pessoa não é aceito por ninguém além dela', async () => {
      await expect(plans.accept(ids.colega, planId)).rejects.toThrow(NotFoundException);
    });

    it('aceitar aplica as metas e cria as refeições salvas em nome da aluna', async () => {
      await prisma.userGoals.create({
        data: { userId: ids.ana, ...GOALS, kcalMin: 1500, dailyWaterTargetMl: 3000 },
      });
      const aceito = await plans.accept(ids.ana, planId);
      expect(aceito.status).toBe('ACCEPTED');

      const metas = await prisma.userGoals.findUniqueOrThrow({ where: { userId: ids.ana } });
      expect(metas).toMatchObject({ ...GOALS, dailyWaterTargetMl: 3000 });
      // As metas de antes ficam no histórico, com a origem do plano (#396).
      const historico = await prisma.userGoalsHistory.findMany({ where: { userId: ids.ana } });
      expect(historico).toHaveLength(1);
      expect(historico[0]).toMatchObject({
        kcalMin: 1500,
        dailyWaterTargetMl: 3000,
        source: 'nutrition_plan',
      });

      const salvas = await prisma.mealTemplate.findMany({ where: { userId: ids.ana } });
      expect(salvas).toHaveLength(3);

      const visao = await plans.overview(ids.ana, TZ);
      expect(visao.pending).toBeNull();
      expect(visao.active?.id).toBe(planId);
      expect(visao.week.days).toBe(7);
      breakfastId = visao.active!.meals[0]!.id;
      lunchId = visao.active!.meals[1]!.id;
      lunchOption2 = visao.active!.meals[1]!.options[1]!.id;
      paoItemId = visao.active!.meals[0]!.options[0]!.items[0]!.id;
      tapiocaId = visao.active!.meals[0]!.options[0]!.items[0]!.equivalents[0]!.id;
    });

    it('aceitar de novo o mesmo plano não muda nada', async () => {
      await expect(plans.accept(ids.ana, planId)).rejects.toThrow(ConflictException);
    });

    it('"comi isso" no almoço pede a opção, e a opção tem de ser desta refeição', async () => {
      await expect(plans.logMeal(ids.ana, lunchId, {}, TZ)).rejects.toThrow(BadRequestException);
      const doCafe = (await plans.overview(ids.ana, TZ)).active!.meals[0]!.options[0]!.id;
      await expect(plans.logMeal(ids.ana, lunchId, { optionId: doCafe }, TZ)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        plans.logMeal(ids.colega, lunchId, { optionId: lunchOption2 }, TZ),
      ).rejects.toThrow(NotFoundException);
    });

    it('"comi isso" registra a opção escolhida no diário, uma vez por dia (o segundo toque devolve o mesmo)', async () => {
      const r = await plans.logMeal(ids.ana, lunchId, { optionId: lunchOption2 }, TZ);
      const refeicao = await meals.findById(ids.ana, r.mealId);
      expect(refeicao.mealType).toBe('LUNCH');
      expect(refeicao.items.map((i) => i.grams)).toEqual([150]);
      // Origem do item (#374): veio do plano.
      expect(refeicao.items.map((i) => i.source)).toEqual(['PLAN']);

      const visao = await plans.overview(ids.ana, TZ);
      expect(visao.active!.meals[1]!.logged).toEqual({
        mealId: r.mealId,
        optionId: lunchOption2,
      });
      // Toque repetido é o mesmo registro, não erro nem refeição nova.
      await expect(
        plans.logMeal(ids.ana, lunchId, { optionId: lunchOption2 }, TZ),
      ).resolves.toEqual(r);
    });

    it('apagar a refeição do diário desfaz o "feito"', async () => {
      const visao = await plans.overview(ids.ana, TZ);
      await meals.delete(ids.ana, visao.active!.meals[1]!.logged!.mealId);
      expect((await plans.overview(ids.ana, TZ)).active!.meals[1]!.logged).toBeNull();
    });

    it('o equivalente tem de ser do item, e o item do plano em uso da pessoa', async () => {
      const ovoId = (await plans.overview(ids.ana, TZ)).active!.meals[0]!.options[0]!.items[1]!.id;
      await expect(
        plans.swap(ids.ana, { itemId: ovoId, equivalentId: tapiocaId }, TZ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        plans.swap(ids.colega, { itemId: paoItemId, equivalentId: tapiocaId }, TZ),
      ).rejects.toThrow(NotFoundException);
    });

    it('trocar depois do "comi isso" muda o item no diário, e sem consentimento a equipe não vê', async () => {
      const cafe = await plans.logMeal(ids.ana, breakfastId, {}, TZ);
      const r = await plans.swap(ids.ana, { itemId: paoItemId, equivalentId: tapiocaId }, TZ);
      expect(r.teamSees).toBe(false);
      expect(r.viewerName).toBeNull();
      expect(r.replaced).toBe(`${stamp} pão integral`);
      expect(r.swap.date).toBe(todayInTz(TZ));

      const refeicao = await meals.findById(ids.ana, cafe.mealId);
      expect(refeicao.items.map((i) => [i.foodName, i.grams])).toEqual([
        [`${stamp} tapioca goma`, 40],
        [`${stamp} ovo`, 100],
      ]);

      const item = (await plans.overview(ids.ana, TZ)).active!.meals[0]!.options[0]!.items[0]!;
      expect(item.swap).toMatchObject({ equivalentId: tapiocaId, grams: 40 });
      // 136 kcal de tapioca no lugar de 124 de pão: +12 no total da opção.
      const opcao = (await plans.overview(ids.ana, TZ)).active!.meals[0]!.options[0]!;
      expect(Math.round(opcao.kcal)).toBe(136 + 146);
    });

    it('com Alimentação liberada para a Helena, ela vê a troca e a aderência da semana', async () => {
      await prisma.professionalLink.create({
        data: {
          subjectUserId: ids.ana,
          professionalId: ids.helena,
          groupId,
          scopes: [ShareScope.NUTRITION],
        },
      });
      const visao = await plans.overview(ids.ana, TZ);
      expect(visao.teamSees).toBe(true);

      const equipe = await plans.teamView(ids.ana, TZ, 7);
      expect(equipe.plan).toMatchObject({ version: 2, status: 'ACCEPTED' });
      expect(equipe.swaps).toEqual([
        expect.objectContaining({
          mealName: 'Café da manhã',
          replaced: `${stamp} pão integral`,
          foodName: `${stamp} tapioca goma`,
          kcalDelta: 12,
          undone: false,
        }),
      ]);
      expect(equipe.adherence.days).toBe(7);
    });

    it('trocar de novo no mesmo dia substitui a troca anterior', async () => {
      const aveiaId = (await plans.overview(ids.ana, TZ)).active!.meals[0]!.options[0]!.items[0]!
        .equivalents[1]!.id;
      const r = await plans.swap(ids.ana, { itemId: paoItemId, equivalentId: aveiaId }, TZ);
      expect(r).toMatchObject({ teamSees: true, viewerName: 'Helena' });
      const ativas = await prisma.nutritionSwap.count({
        where: { itemId: paoItemId, undoneAt: null },
      });
      expect(ativas).toBe(1);
    });

    it('a troca de outra pessoa não é desfeita por ninguém além dela', async () => {
      const item = (await plans.overview(ids.ana, TZ)).active!.meals[0]!.options[0]!.items[0]!;
      await expect(plans.undoSwap(ids.colega, item.swap!.id)).rejects.toThrow(NotFoundException);
    });

    it('"Desfazer" devolve o pão, no plano e no diário', async () => {
      const visao = await plans.overview(ids.ana, TZ);
      const item = visao.active!.meals[0]!.options[0]!.items[0]!;
      const r = await plans.undoSwap(ids.ana, item.swap!.id);
      expect(r).toEqual({ undone: true, restored: `${stamp} pão integral` });

      const depois = await plans.overview(ids.ana, TZ);
      expect(depois.active!.meals[0]!.options[0]!.items[0]!.swap).toBeNull();
      const refeicao = await meals.findById(ids.ana, depois.active!.meals[0]!.logged!.mealId);
      expect(refeicao.items[0]).toMatchObject({ foodName: `${stamp} pão integral`, grams: 50 });
      await expect(plans.undoSwap(ids.ana, item.swap!.id)).rejects.toThrow(NotFoundException);
    });

    it('trocar antes do "comi isso" registra o equivalente', async () => {
      const amanha = new Date(Date.now() + 86_400_000);
      const dia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(amanha);
      await plans.swap(ids.ana, { itemId: paoItemId, equivalentId: tapiocaId, date: dia }, TZ);
      const r = await plans.logMeal(ids.ana, breakfastId, { eatenAt: `${dia}T08:00:00-03:00` }, TZ);
      const refeicao = await meals.findById(ids.ana, r.mealId);
      expect(refeicao.items[0]).toMatchObject({ foodName: `${stamp} tapioca goma`, grams: 40 });
    });

    it('uma versão nova aceita substitui a antiga e troca as refeições salvas', async () => {
      const v3 = await plans.send(ids.helena, ids.anaMembership, plano());
      const visao = await plans.overview(ids.ana, TZ);
      expect(visao.active?.id).toBe(planId);
      expect(visao.pending?.id).toBe(v3.id);

      await plans.accept(ids.ana, v3.id);
      const antigo = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: planId } });
      expect(antigo.status).toBe('SUPERSEDED');
      expect(await prisma.mealTemplate.count({ where: { userId: ids.ana } })).toBe(3);
    });
  });

  describe('concorrência, consentimento e vínculo com o diário (revisão da #376)', () => {
    let bia = '';
    let biaMembership = '';

    async function novaAluna(nome: string) {
      const id = await pessoa(nome);
      const m = await prisma.groupMembership.create({
        data: { groupId, userId: id, role: 'MEMBER', status: 'ACTIVE' },
      });
      return { id, membership: m.id };
    }

    async function emUso(userId: string) {
      const v = await plans.overview(userId, TZ);
      return v.active!;
    }

    beforeAll(async () => {
      const a = await novaAluna('Bia');
      bia = a.id;
      biaMembership = a.membership;
    });

    it('dois "aceitar" ao mesmo tempo: um aceita, o outro é 409, e as refeições salvas não dobram', async () => {
      const enviado = await plans.send(ids.helena, biaMembership, plano());
      const r = await Promise.allSettled([
        plans.accept(bia, enviado.id),
        plans.accept(bia, enviado.id),
      ]);
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const recusa = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
      expect(recusa.reason).toBeInstanceOf(ConflictException);
      expect(await prisma.mealTemplate.count({ where: { userId: bia } })).toBe(3);
    });

    it('plano substituído não volta a valer', async () => {
      const antigo = (await emUso(bia)).id;
      const novo = await plans.send(ids.helena, biaMembership, plano());
      await plans.accept(bia, novo.id);
      await expect(plans.accept(bia, antigo)).rejects.toThrow(ConflictException);
      const linha = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: antigo } });
      expect(linha.status).toBe('SUPERSEDED');
      expect(await prisma.nutritionPlan.count({ where: { userId: bia, status: 'ACCEPTED' } })).toBe(
        1,
      );
    });

    it('aceitar dois planos pendentes ao mesmo tempo nunca dá 500 e deixa um só em uso', async () => {
      for (let i = 0; i < 5; i += 1) {
        const a = await plans.send(ids.helena, biaMembership, plano());
        const b = await plans.send(ids.bruno, biaMembership, plano());
        const r = await Promise.allSettled([plans.accept(bia, a.id), plans.accept(bia, b.id)]);
        for (const x of r) {
          if (x.status === 'rejected') expect(x.reason).toBeInstanceOf(ConflictException);
        }
        expect(
          await prisma.nutritionPlan.count({ where: { userId: bia, status: 'ACCEPTED' } }),
        ).toBe(1);
      }
    });

    it('dois "comi isso" ao mesmo tempo: uma refeição só, e os dois toques devolvem ela', async () => {
      const cafe = (await emUso(bia)).meals[0]!.id;
      const r = await Promise.allSettled([
        plans.logMeal(bia, cafe, {}, TZ),
        plans.logMeal(bia, cafe, {}, TZ),
      ]);
      expect(r.map((x) => x.status)).toEqual(['fulfilled', 'fulfilled']);
      const [a, b] = r.map((x) => (x as PromiseFulfilledResult<{ mealId: string }>).value.mealId);
      expect(a).toBe(b);
      expect(await prisma.meal.count({ where: { userId: bia, mealType: 'BREAKFAST' } })).toBe(1);
    });

    it('duas trocas do mesmo item no mesmo dia ao mesmo tempo: nunca 500, uma ativa só', async () => {
      const item = (await emUso(bia)).meals[0]!.options[0]!.items[0]!;
      for (let i = 0; i < 5; i += 1) {
        const r = await Promise.allSettled([
          plans.swap(bia, { itemId: item.id, equivalentId: item.equivalents[0]!.id }, TZ),
          plans.swap(bia, { itemId: item.id, equivalentId: item.equivalents[1]!.id }, TZ),
        ]);
        for (const x of r) {
          if (x.status === 'rejected') expect(x.reason).toBeInstanceOf(ConflictException);
        }
        expect(
          await prisma.nutritionSwap.count({ where: { itemId: item.id, undoneAt: null } }),
        ).toBe(1);
      }
    });

    it('item do diário editado ainda é o trocado, e "Desfazer" devolve ele', async () => {
      const cafe = (await emUso(bia)).meals[0]!;
      const item = cafe.options[0]!.items[0]!;
      const ativa = item.swap ?? null;
      if (ativa) await plans.undoSwap(bia, ativa.id);
      const mealId = (await emUso(bia)).meals[0]!.logged!.mealId;
      const gravado = (await meals.findById(bia, mealId)).items[0]!;
      // A pessoa corrigiu as gramas no diário: o nome e as gramas não batem mais com o plano.
      await prisma.mealItem.update({
        where: { id: gravado.id },
        data: { grams: 65, source: 'MANUAL' },
      });

      const r = await plans.swap(
        bia,
        { itemId: item.id, equivalentId: item.equivalents[0]!.id },
        TZ,
      );
      const depois = (await meals.findById(bia, mealId)).items.find((i) => i.id === gravado.id)!;
      expect(depois).toMatchObject({
        foodName: item.equivalents[0]!.foodName,
        grams: item.equivalents[0]!.grams,
        source: 'PLAN',
      });

      await plans.undoSwap(bia, r.swap.id);
      const desfeito = (await meals.findById(bia, mealId)).items.find((i) => i.id === gravado.id)!;
      expect(desfeito).toMatchObject({ foodName: item.foodName, grams: item.grams });
    });

    it('a equipe vê se QUALQUER profissional ativo tem Alimentação, mesmo não sendo o autor', async () => {
      const item = (await emUso(bia)).meals[0]!.options[0]!.items[0]!;
      const trocar = () =>
        plans.swap(bia, { itemId: item.id, equivalentId: item.equivalents[0]!.id }, TZ);

      expect(await trocar()).toMatchObject({ teamSees: false, viewerName: null });

      // Membro comum com vínculo (dado legado) não conta como equipe.
      await prisma.professionalLink.create({
        data: {
          subjectUserId: bia,
          professionalId: ids.colega,
          groupId,
          scopes: [ShareScope.NUTRITION],
        },
      });
      expect(await trocar()).toMatchObject({ teamSees: false, viewerName: null });

      // O dono da academia, que não escreveu o plano em uso, vê: equipe sem nome.
      const autor = (await emUso(bia)).author?.name;
      expect(autor).toBeDefined();
      await prisma.professionalLink.create({
        data: {
          subjectUserId: bia,
          professionalId: ids.bruno,
          groupId,
          scopes: [ShareScope.NUTRITION],
        },
      });
      const autorEhBruno = autor === 'Bruno';
      const r = await trocar();
      expect(r.teamSees).toBe(true);
      expect(r.viewerName).toBe(autorEhBruno ? 'Bruno' : null);
      expect((await plans.overview(bia, TZ)).teamSees).toBe(true);

      // Profissional que saiu da comunidade deixa de contar.
      await prisma.groupMembership.update({
        where: { groupId_userId: { groupId, userId: ids.bruno } },
        data: { status: 'REMOVED' },
      });
      try {
        expect(await trocar()).toMatchObject({ teamSees: false });
      } finally {
        await prisma.groupMembership.update({
          where: { groupId_userId: { groupId, userId: ids.bruno } },
          data: { status: 'ACTIVE' },
        });
      }
    });
  });

  describe('exclusão da conta (LGPD)', () => {
    it('apagar a conta do autor mantém o plano do aluno, sem o autor', async () => {
      const autora = await pessoa('Nutri Saindo');
      await prisma.groupMembership.create({
        data: { groupId, userId: autora, role: 'PROFESSIONAL', status: 'ACTIVE' },
      });
      const enviado = await plans.send(autora, ids.anaMembership, plano());
      await prisma.user.delete({ where: { id: autora } });
      const plano2 = await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: enviado.id } });
      expect(plano2.authorId).toBeNull();
      expect((await plans.overview(ids.ana, TZ)).pending?.author).toBeNull();
    });

    it('apagar a conta do aluno leva plano, trocas e registros do plano', async () => {
      const planos = await prisma.nutritionPlan.findMany({
        where: { userId: ids.ana },
        select: { id: true },
      });
      expect(
        await prisma.nutritionSwap.count({ where: { plan: { userId: ids.ana } } }),
      ).toBeGreaterThan(0);
      await prisma.user.delete({ where: { id: ids.ana } });
      const resto = planos.map((p) => p.id);
      expect(await prisma.nutritionPlan.count({ where: { id: { in: resto } } })).toBe(0);
      expect(await prisma.nutritionSwap.count({ where: { planId: { in: resto } } })).toBe(0);
      expect(
        await prisma.nutritionPlanLog.count({ where: { planMeal: { planId: { in: resto } } } }),
      ).toBe(0);
    });
  });
});
