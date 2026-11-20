import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MealService } from '../../nutrition/meal.service';
import { MealTemplateService } from '../../nutrition/meal-template.service';
import { UserGoalsService } from '../../nutrition/user-goals.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { ContentService } from '../content.service';
import { PlanMaterializerService } from '../plan-materializer.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION } from '../plan-snapshot';

/**
 * A biblioteca da equipe (#405, Pn-08 e Pn-08c): rascunho, "Na comunidade",
 * "Anunciar no mural" e "Com quem" (número só a partir de 5 pessoas).
 */
describe('biblioteca de planos (#405, banco real)', () => {
  const prisma = new PrismaService();
  const media = new MediaService(prisma, new MemoryObjectStore());
  const plans = new WorkoutPlanService(prisma);
  const content = new ContentService(
    prisma,
    plans,
    new MealTemplateService(prisma, {} as unknown as MealService),
    new UserGoalsService(prisma),
    new PlanMaterializerService(prisma, new ExerciseService(prisma)),
    media,
  );
  const stamp = `lib-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;
  let g = '';
  let helena = '';
  let planoDaHelena = '';

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user.id;
  }

  async function modelo(title: string, extra: { published?: boolean; draft?: boolean } = {}) {
    const snapshot = buildPlanSnapshot(await plans.findById(helena, planoDaHelena));
    return (
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: g,
          authorId: helena,
          kind: 'WORKOUT',
          title,
          snapshot: snapshot as object,
          snapshotVersion: PLAN_SNAPSHOT_VERSION,
          publishedAt: extra.published ? new Date() : null,
          draft: extra.draft ?? false,
        },
      })
    ).id;
  }

  /** `quantos` pessoas com cópia: metade adotou, metade recebeu da equipe. */
  async function copias(templateId: string, quantos: number) {
    for (let i = 0; i < quantos; i++) {
      const aluno = await pessoa(`aluno ${i}`);
      if (i % 2 === 0) {
        await prisma.workoutPlan.create({
          data: { userId: aluno, name: 'cópia', fromTemplateId: templateId },
        });
      } else {
        await prisma.planOffer.create({
          data: { userId: aluno, authorId: helena, groupId: g, sourceTemplateId: templateId },
        });
      }
    }
  }

  const doTime = async (id: string) =>
    (await content.listTemplatesForTeam(helena, g)).find((t) => t.id === id)!;

  beforeAll(async () => {
    await prisma.$connect();
    const dono = await pessoa('Bruno');
    helena = await pessoa('Helena');
    g = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Academia',
          slug: `${stamp}-g`,
          ownerId: dono,
          autoPosts: [],
        },
      })
    ).id;
    await prisma.groupMembership.createMany({
      data: [
        { groupId: g, userId: dono, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g, userId: helena, role: 'PROFESSIONAL', status: 'ACTIVE' },
      ],
    });
    const ex = await prisma.exercise.findFirstOrThrow({
      where: { createdByUserId: null, groupOwned: false },
      select: { id: true },
    });
    planoDaHelena = (
      await prisma.workoutPlan.create({
        data: {
          userId: helena,
          name: 'Inferior',
          exercises: { create: [{ exerciseId: ex.id, order: 0, targetSets: 3, targetReps: '10' }] },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: g } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('"Com quem"', () => {
    it('conta pessoas distintas com cópia e esconde o número abaixo de 5', async () => {
      const muitos = await modelo('Muitos');
      const poucos = await modelo('Poucos');
      const ninguem = await modelo('Ninguém');
      await copias(muitos, 6);
      await copias(poucos, 2);
      // Oferta apagada da pessoa (#402) não conta.
      const apagada = await pessoa('apagada');
      await prisma.planOffer.create({
        data: {
          userId: apagada,
          authorId: helena,
          groupId: g,
          sourceTemplateId: muitos,
          removedAt: new Date(),
        },
      });

      expect((await doTime(muitos)).withWhom).toEqual({ band: 'many', count: 6 });
      expect((await doTime(poucos)).withWhom).toEqual({ band: 'few', count: null });
      expect((await doTime(ninguem)).withWhom).toEqual({ band: 'none', count: null });
    });
  });

  describe('rascunho e "Na comunidade"', () => {
    it('rascunho não vai para a comunidade', async () => {
      const id = await modelo('Braços', { draft: true });
      expect((await doTime(id)).draft).toBe(true);
      await expect(content.setTemplatePublished(helena, g, id, true)).rejects.toThrow(
        ConflictException,
      );
      await content.updateTemplate(helena, g, id, { draft: false });
      expect((await doTime(id)).draft).toBe(false);
    });

    it('publicado não volta a rascunho sem sair da comunidade', async () => {
      const id = await modelo('Publicado', { published: true });
      await expect(content.updateTemplate(helena, g, id, { draft: true })).rejects.toThrow(
        ConflictException,
      );
    });

    it('"Anunciar no mural" decide o post, por cima da configuração', async () => {
      const comPost = await modelo('Com post');
      await content.setTemplatePublished(helena, g, comPost, true, { announce: true });
      const semPost = await modelo('Sem post');
      await prisma.group.update({ where: { id: g }, data: { autoPosts: ['PLAN'] } });
      await content.setTemplatePublished(helena, g, semPost, true, { announce: false });
      const posts = await prisma.groupPost.findMany({
        where: { groupId: g, autoKind: 'PLAN' },
        select: { autoRefId: true },
      });
      expect(posts.map((p) => p.autoRefId)).toEqual([comPost]);
    });

    it('tirar da comunidade não apaga a cópia de ninguém', async () => {
      const id = await modelo('Adotado', { published: true });
      await copias(id, 2);
      const v = await content.setTemplatePublished(helena, g, id, false);
      expect(v.publishedAt).toBeNull();
      expect(await prisma.workoutPlan.count({ where: { fromTemplateId: id } })).toBe(1);
      expect(await prisma.planOffer.count({ where: { sourceTemplateId: id } })).toBe(1);
    });
  });
});
