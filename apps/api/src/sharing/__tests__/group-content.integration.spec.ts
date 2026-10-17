import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MealService } from '../../nutrition/meal.service';
import { MealTemplateService } from '../../nutrition/meal-template.service';
import { UserGoalsService } from '../../nutrition/user-goals.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { ContentService } from '../content.service';
import { GroupService } from '../group.service';
import { NUTRITION_SNAPSHOT_VERSION } from '../nutrition-snapshot';
import { PlanMaterializerService } from '../plan-materializer.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * Planos prontos e dicas (Fase 7a) no Postgres real: quem publica, o que o
 * membro enxerga, a adoção e o que nunca cruza de uma comunidade para outra.
 */
describe('planos prontos e dicas da comunidade (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const exercises = new ExerciseService(prisma);
  const plans = new WorkoutPlanService(prisma);
  const mealTemplates = new MealTemplateService(prisma, {} as unknown as MealService);
  const goals = new UserGoalsService(prisma);
  const materializer = new PlanMaterializerService(prisma, exercises);
  const content = new ContentService(prisma, plans, mealTemplates, goals, materializer, media);
  const groups = new GroupService(prisma, new ProfessionalLinkService(prisma), [], media);

  const stamp = `conteudo-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;
  let catalogo: number[] = [];

  async function pessoa(nome = 'Pessoa') {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `${nome} ${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  async function entra(groupId: string, role: 'MEMBER' | 'PROFESSIONAL' | 'CREATOR') {
    const id = await pessoa(role);
    await prisma.groupMembership.create({
      data: { groupId, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    return id;
  }

  async function comunidade() {
    const dono = await pessoa('Dona');
    const g = await groups.create(dono, { type: 'SPONSORED', name: 'Academia' });
    grupos.push(g.id);
    const prof = await entra(g.id, 'PROFESSIONAL');
    const membro = await entra(g.id, 'MEMBER');
    return { groupId: g.id, dono, prof, membro };
  }

  /** Plano de treino do autor com dois exercícios do catálogo e um próprio. */
  async function planoDe(userId: string) {
    const plano = await prisma.workoutPlan.create({ data: { userId, name: 'Treino A' } });
    const custom = await exercises.createCustom(userId, {
      name: 'Remada no aparelho da casa',
      muscleGroup: 'costas',
    });
    await prisma.workoutPlanExercise.createMany({
      data: [
        { planId: plano.id, exerciseId: catalogo[0], order: 0, targetSets: 3, targetReps: '10' },
        { planId: plano.id, exerciseId: catalogo[1], order: 1, targetSets: 4, targetReps: '8-12' },
        { planId: plano.id, exerciseId: custom.id, order: 2, targetSets: 3, targetReps: '12' },
      ],
    });
    return plano.id;
  }

  async function refeicaoSalvaDe(userId: string, foodId: number | null) {
    const t = await prisma.mealTemplate.create({
      data: {
        userId,
        name: 'Café da academia',
        mealType: 'BREAKFAST',
        items: {
          create: [
            {
              position: 0,
              foodId,
              foodName: 'Aveia',
              grams: 40,
              kcal: 150,
              proteinG: 5,
              carbsG: 27,
              fatG: 3,
            },
          ],
        },
      },
    });
    return t.id;
  }

  const metas = {
    kcalMin: 1800,
    kcalMax: 2100,
    proteinMinG: 120,
    proteinMaxG: 160,
    carbsMinG: 180,
    carbsMaxG: 240,
    fatMinG: 50,
    fatMaxG: 70,
  };

  beforeAll(async () => {
    catalogo = (
      await prisma.exercise.findMany({
        where: { createdByUserId: null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 2,
      })
    ).map((e) => e.id);
    // O fatia_test tem o catálogo semeado; sem ele o teste não tem o que congelar.
    expect(catalogo).toHaveLength(2);
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    // Plano antes de gente: o exercício próprio cai com o dono, e o plano que o
    // usa não tem cascata do lado do exercício.
    await prisma.workoutPlan.deleteMany({ where: { userId: { in: criados } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('publicar', () => {
    it('dono e profissional publicam; membro não', async () => {
      const { groupId, dono, prof, membro } = await comunidade();
      await expect(
        content.createWorkoutTemplate(dono, groupId, { planId: await planoDe(dono) }),
      ).resolves.toMatchObject({ kind: 'WORKOUT', title: 'Treino A', publishedAt: null });
      await expect(
        content.createWorkoutTemplate(prof, groupId, { planId: await planoDe(prof) }),
      ).resolves.toMatchObject({ canEdit: true });
      await expect(
        content.createWorkoutTemplate(membro, groupId, { planId: await planoDe(membro) }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('só congela plano do próprio autor', async () => {
      const { groupId, dono, prof } = await comunidade();
      const doProf = await planoDe(prof);
      await expect(
        content.createWorkoutTemplate(dono, groupId, { planId: doProf }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('o profissional não edita o plano do dono; o dono modera o do profissional', async () => {
      const { groupId, dono, prof } = await comunidade();
      const doDono = await content.createWorkoutTemplate(dono, groupId, {
        planId: await planoDe(dono),
      });
      const doProf = await content.createWorkoutTemplate(prof, groupId, {
        planId: await planoDe(prof),
      });
      await expect(
        content.updateTemplate(prof, groupId, doDono.id, { title: 'Meu agora' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        content.setTemplatePublished(dono, groupId, doProf.id, true),
      ).resolves.toMatchObject({ id: doProf.id });
    });

    it('nutrição: refeição salva de outra pessoa não entra, e alimento próprio perde o id', async () => {
      const { groupId, dono, prof } = await comunidade();
      const alheia = await refeicaoSalvaDe(prof, null);
      await expect(
        content.createNutritionTemplate(dono, groupId, {
          title: 'Cutting',
          mealTemplateIds: [alheia],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const meuAlimento = await prisma.food.create({
        data: {
          name: `${stamp} aveia da casa`,
          source: 'CUSTOM',
          createdByUserId: dono,
          kcalPer100g: 370,
          proteinPer100g: 13,
          carbsPer100g: 67,
          fatPer100g: 7,
        },
      });
      const minha = await refeicaoSalvaDe(dono, meuAlimento.id);
      const t = await content.createNutritionTemplate(dono, groupId, {
        title: 'Cutting',
        goals: metas,
        mealTemplateIds: [minha],
      });
      expect(t.goals).toEqual(metas);
      expect(t.meals[0].items[0]).toMatchObject({ foodName: 'Aveia', foodId: null });
    });
  });

  describe('o que o membro vê', () => {
    it('rascunho não existe para o membro, nem na lista nem por id', async () => {
      const { groupId, dono, membro } = await comunidade();
      const t = await content.createWorkoutTemplate(dono, groupId, { planId: await planoDe(dono) });
      await expect(content.listTemplatesForMember(membro, groupId)).resolves.toEqual([]);
      await expect(content.getTemplateForMember(membro, groupId, t.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(content.adopt(membro, groupId, t.id)).rejects.toBeInstanceOf(NotFoundException);

      await content.setTemplatePublished(dono, groupId, t.id, true);
      const lista = await content.listTemplatesForMember(membro, groupId);
      expect(lista.map((x) => x.id)).toEqual([t.id]);
      expect(lista[0].exercises.map((e) => e.name)).toContain('Remada no aparelho da casa');
      expect(lista[0]).not.toHaveProperty('canEdit');
    });

    it('id de outra comunidade não abre, mesmo publicado', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const t = await content.createWorkoutTemplate(a.dono, a.groupId, {
        planId: await planoDe(a.dono),
      });
      await content.setTemplatePublished(a.dono, a.groupId, t.id, true);

      await expect(content.getTemplateForMember(b.membro, b.groupId, t.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(content.adopt(b.membro, b.groupId, t.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(content.getTemplateForMember(b.membro, a.groupId, t.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        content.updateTemplate(b.dono, b.groupId, t.id, { title: 'Roubado' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('dicas: só as publicadas, fixadas primeiro; dica de outra comunidade não muda', async () => {
      const { groupId, dono, prof, membro } = await comunidade();
      const outra = await comunidade();
      const a = await content.createTip(dono, groupId, {
        title: 'Água',
        body: 'Beba **água**.',
        category: 'HABITS',
      });
      const b = await content.createTip(prof, groupId, {
        title: 'Sono',
        body: 'Durma 8 h.',
        category: 'HABITS',
      });
      await content.createTip(prof, groupId, { title: 'Rascunho', body: '…', category: 'GENERAL' });
      await content.setTipState(dono, groupId, a.id, { published: true });
      await content.setTipState(prof, groupId, b.id, { published: true, pinned: true });

      const vistas = await content.listTipsForMember(membro, groupId);
      expect(vistas.map((t) => t.title)).toEqual(['Sono', 'Água']);
      await expect(
        content.updateTip(outra.dono, outra.groupId, a.id, { title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(content.listTipsForMember(outra.membro, groupId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('adotar', () => {
    it('treino vira plano do membro uma vez só, e não acompanha o modelo depois', async () => {
      const { groupId, dono, membro } = await comunidade();
      const t = await content.createWorkoutTemplate(dono, groupId, { planId: await planoDe(dono) });
      await content.setTemplatePublished(dono, groupId, t.id, true);

      const r = await content.adopt(membro, groupId, t.id);
      const plano = await prisma.workoutPlan.findUniqueOrThrow({
        where: { id: r.planId! },
        include: { exercises: { include: { exercise: true } } },
      });
      expect(plano).toMatchObject({ userId: membro, fromTemplateId: t.id, name: 'Treino A' });
      // O exercício próprio do autor virou exercício do membro.
      const custom = plano.exercises.find((e) => e.exercise.createdByUserId !== null);
      expect(custom?.exercise.createdByUserId).toBe(membro);

      const segunda = content.adopt(membro, groupId, t.id);
      await expect(segunda).rejects.toBeInstanceOf(ConflictException);
      await expect(segunda).rejects.toMatchObject({ response: { planId: r.planId } });

      await content.deleteTemplate(dono, groupId, t.id);
      const depois = await prisma.workoutPlan.findUniqueOrThrow({ where: { id: r.planId! } });
      expect(depois).toMatchObject({ userId: membro, fromTemplateId: null });
    });

    it('retrato forjado com exercício próprio de outra pessoa é recusado sem criar nada', async () => {
      const { groupId, dono, membro, prof } = await comunidade();
      const t = await content.createWorkoutTemplate(dono, groupId, { planId: await planoDe(dono) });
      const alheio = await exercises.createCustom(prof, {
        name: `${stamp} segredo`,
        muscleGroup: 'peito',
      });
      await prisma.groupPlanTemplate.update({
        where: { id: t.id },
        data: {
          publishedAt: new Date(),
          snapshot: {
            version: 1,
            name: 'Forjado',
            exercises: [
              {
                source: 'catalog',
                catalogExerciseId: alheio.id,
                order: 0,
                targetSets: 3,
                targetReps: '10',
              },
            ],
          },
        },
      });
      await expect(content.adopt(membro, groupId, t.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(await prisma.workoutPlan.count({ where: { userId: membro } })).toBe(0);
    });

    it('nutrição sem applyGoals não toca as metas; com applyGoals troca; refeições não duplicam', async () => {
      const { groupId, dono, membro } = await comunidade();
      const minhas = { ...metas, kcalMin: 2500, kcalMax: 2800 };
      await goals.upsert(membro, minhas);
      const t = await content.createNutritionTemplate(dono, groupId, {
        title: 'Cutting',
        goals: metas,
        mealTemplateIds: [await refeicaoSalvaDe(dono, null)],
      });
      await content.setTemplatePublished(dono, groupId, t.id, true);

      const r1 = await content.adopt(membro, groupId, t.id, { saveMeals: true });
      expect(r1).toMatchObject({ goalsApplied: false, mealsSaved: 1 });
      expect(await goals.get(membro)).toMatchObject({ kcalMin: 2500, kcalMax: 2800 });
      const salvas = await prisma.mealTemplate.findMany({ where: { userId: membro } });
      expect(salvas).toEqual([
        expect.objectContaining({ name: 'Café da academia', fromTemplateId: t.id }),
      ]);

      const r2 = await content.adopt(membro, groupId, t.id, { applyGoals: true, saveMeals: true });
      expect(r2).toMatchObject({ goalsApplied: true, mealsSaved: 0, mealsAlreadySaved: true });
      expect(await goals.get(membro)).toMatchObject({ kcalMin: 1800, kcalMax: 2100 });
      expect(await prisma.mealTemplate.count({ where: { userId: membro } })).toBe(1);
    });

    it('nome de refeição que a pessoa já tem ganha o sufixo da comunidade', async () => {
      const { groupId, dono, membro } = await comunidade();
      await refeicaoSalvaDe(membro, null);
      const t = await content.createNutritionTemplate(dono, groupId, {
        title: 'Base',
        mealTemplateIds: [await refeicaoSalvaDe(dono, null)],
      });
      await content.setTemplatePublished(dono, groupId, t.id, true);
      await content.adopt(membro, groupId, t.id);
      const nomes = (await prisma.mealTemplate.findMany({ where: { userId: membro } })).map(
        (m) => m.name,
      );
      expect(nomes.sort()).toEqual(['Café da academia', 'Café da academia (Comunidade)']);
    });

    it('alimento próprio de outra pessoa forjado no retrato não entra na refeição de quem adota', async () => {
      const { groupId, dono, membro, prof } = await comunidade();
      const segredo = await prisma.food.create({
        data: {
          name: `${stamp} receita secreta`,
          source: 'CUSTOM',
          createdByUserId: prof,
          kcalPer100g: 100,
          proteinPer100g: 1,
          carbsPer100g: 1,
          fatPer100g: 1,
        },
      });
      const t = await content.createNutritionTemplate(dono, groupId, { title: 'X', goals: metas });
      await prisma.groupPlanTemplate.update({
        where: { id: t.id },
        data: {
          publishedAt: new Date(),
          snapshot: {
            version: NUTRITION_SNAPSHOT_VERSION,
            goals: null,
            meals: [
              {
                name: 'Forjada',
                mealType: null,
                items: [
                  {
                    foodId: segredo.id,
                    groupId: null,
                    foodName: 'Qualquer',
                    grams: 100,
                    kcal: 100,
                    proteinG: 1,
                    carbsG: 1,
                    fatG: 1,
                    nutrients: null,
                    portionLabel: null,
                    portionQuantity: null,
                  },
                ],
              },
            ],
          },
        },
      });
      await content.adopt(membro, groupId, t.id);
      const item = await prisma.mealTemplateItem.findFirstOrThrow({
        where: { template: { userId: membro } },
      });
      expect(item.foodId).toBeNull();
    });
  });

  describe('imagens', () => {
    it('capa e imagem de dica só aceitam arquivo da própria comunidade', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const body = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      const r = await media.requestUpload(a.dono, {
        purpose: 'group_content',
        groupId: a.groupId,
        mime: 'image/png',
        bytes: body.length,
      });
      const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
      store.upload(f.key, body, 'image/png');
      await media.confirm(a.dono, r.fileId);

      await expect(
        content.createTip(b.dono, b.groupId, {
          title: 'Com imagem alheia',
          body: 'x',
          category: 'GENERAL',
          imageFileId: r.fileId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const dica = await content.createTip(a.dono, a.groupId, {
        title: 'Com imagem',
        body: 'x',
        category: 'GENERAL',
        imageFileId: r.fileId,
      });
      expect(dica.image?.url).toMatch(/^memory:\/\/get\//);
      await content.updateTip(a.dono, a.groupId, dica.id, { imageFileId: null });
      expect(await prisma.mediaFile.findUnique({ where: { id: r.fileId } })).toBeNull();
    });
  });
});
