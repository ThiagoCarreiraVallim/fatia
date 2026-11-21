import { BadRequestException } from '@nestjs/common';
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
import { PlanMaterializerService } from '../plan-materializer.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * O editor de dica da equipe (#408, Pn-10): as quatro categorias da prancha,
 * o texto até 600 caracteres e "Anunciar no mural" na hora de publicar.
 */
describe('editor de dica (#408, integração)', () => {
  const prisma = new PrismaService();
  const media = new MediaService(prisma, new MemoryObjectStore());
  const exercises = new ExerciseService(prisma);
  const plans = new WorkoutPlanService(prisma);
  const content = new ContentService(
    prisma,
    plans,
    new MealTemplateService(prisma, {} as unknown as MealService),
    new UserGoalsService(prisma),
    new PlanMaterializerService(prisma, exercises),
    media,
  );
  const groups = new GroupService(prisma, new ProfessionalLinkService(prisma), [], media);

  const stamp = `dica408-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa() {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `P ${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  async function comunidade(autoPosts?: string[]) {
    const dono = await pessoa();
    const g = await groups.create(dono, { type: 'SPONSORED', name: 'Academia' });
    grupos.push(g.id);
    if (autoPosts) {
      await prisma.group.update({
        where: { id: g.id },
        data: { autoPosts: autoPosts as never },
      });
    }
    return { groupId: g.id, dono };
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('aceita a categoria recuperação', async () => {
    const a = await comunidade();
    const d = await content.createTip(a.dono, a.groupId, {
      title: 'Durma bem',
      body: 'Sono é treino.',
      category: 'RECOVERY' as never,
    });
    expect(d.category).toBe('RECOVERY');
  });

  it('o texto vai até 600 caracteres; o antigo mais longo fica se não mudar', async () => {
    const a = await comunidade();
    await expect(
      content.createTip(a.dono, a.groupId, {
        title: 'Longa',
        body: 'a'.repeat(601),
        category: 'HABITS',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const ok = await content.createTip(a.dono, a.groupId, {
      title: 'No limite',
      body: 'a'.repeat(600),
      category: 'HABITS',
    });
    expect(ok.body).toHaveLength(600);

    // Dica de antes da #408 com 1.000 caracteres: muda o título sem mexer no texto.
    await prisma.groupTip.update({ where: { id: ok.id }, data: { body: 'b'.repeat(1000) } });
    const renomeada = await content.updateTip(a.dono, a.groupId, ok.id, {
      title: 'Renomeada',
      body: 'b'.repeat(1000),
    });
    expect(renomeada.title).toBe('Renomeada');
    await expect(
      content.updateTip(a.dono, a.groupId, ok.id, { body: 'c'.repeat(700) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('"Anunciar no mural": força o post com o tipo desligado, e desligado não posta', async () => {
    const a = await comunidade([]);
    const d1 = await content.createTip(a.dono, a.groupId, {
      title: 'Água antes do treino',
      body: 'Beba **500 ml**.',
      category: 'HABITS',
    });
    await content.setTipState(
      a.dono,
      a.groupId,
      d1.id,
      { published: true, pinned: true },
      {
        announce: true,
      },
    );
    expect(await prisma.groupPost.count({ where: { groupId: a.groupId, autoRefId: d1.id } })).toBe(
      1,
    );

    const b = await comunidade(['TIP']);
    const d2 = await content.createTip(b.dono, b.groupId, {
      title: 'Sem anúncio',
      body: 'Só na aba.',
      category: 'WORKOUT',
    });
    await content.setTipState(b.dono, b.groupId, d2.id, { published: true }, { announce: false });
    expect(await prisma.groupPost.count({ where: { groupId: b.groupId, autoRefId: d2.id } })).toBe(
      0,
    );
  });
});
