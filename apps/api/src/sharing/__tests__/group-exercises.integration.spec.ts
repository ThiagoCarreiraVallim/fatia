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
import { MediaService, type MediaPurpose } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { ContentService } from '../content.service';
import { GroupExerciseService } from '../group-exercise.service';
import { GroupService } from '../group.service';
import { PlanMaterializerService } from '../plan-materializer.service';
import { ProfessionalLinkService } from '../professional-link.service';

/** PNG 1×1 válido: o `sharp` precisa de imagem de verdade para confirmar. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
/** O começo de um MP4: tamanho da caixa e `ftyp`. O resto não importa à conferência. */
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypmp42'),
  Buffer.alloc(64),
]);

/**
 * O catálogo de exercícios da comunidade (Fase 7b, ADR 030) no Postgres real:
 * quem cria, quem enxerga, o tutorial por cima do catálogo, o filtro da
 * academia e o que acontece quando o exercício ou a comunidade some.
 */
describe('catálogo de exercícios da comunidade (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const exercises = new ExerciseService(prisma, media);
  const plans = new WorkoutPlanService(prisma);
  const materializer = new PlanMaterializerService(prisma, exercises);
  const content = new ContentService(
    prisma,
    plans,
    new MealTemplateService(prisma, {} as unknown as MealService),
    new UserGoalsService(prisma),
    materializer,
    media,
  );
  const catalog = new GroupExerciseService(prisma, media);
  const groups = new GroupService(
    prisma,
    new ProfessionalLinkService(prisma),
    [{ beforeDelete: (groupId) => exercises.beforeDeleteGroup(groupId) }],
    media,
  );

  const stamp = `catalogo-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;
  /** Um exercício do catálogo geral com halteres e outro com barra. */
  let halteres: { id: number; name: string };
  let barra: { id: number; name: string };

  async function pessoa(nome = 'Pessoa') {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `${nome} ${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  async function entra(groupId: string, role: 'MEMBER' | 'PROFESSIONAL') {
    const id = await pessoa(role);
    await prisma.groupMembership.create({
      data: { groupId, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    return id;
  }

  async function comunidade(nome = 'Academia') {
    const dono = await pessoa('Dona');
    const g = await groups.create(dono, { type: 'SPONSORED', name: nome });
    grupos.push(g.id);
    return {
      groupId: g.id,
      dono,
      prof: await entra(g.id, 'PROFESSIONAL'),
      membro: await entra(g.id, 'MEMBER'),
    };
  }

  async function envia(
    userId: string,
    groupId: string,
    purpose: MediaPurpose,
    mime: string,
    body: Buffer,
  ) {
    const r = await media.requestUpload(userId, { purpose, groupId, mime, bytes: body.length });
    const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(f.key, body, mime);
    await media.confirm(userId, r.fileId);
    return r.fileId;
  }

  /** Nome único por execução: o `@@unique([name, groupId])` vale entre testes. */
  const nome = (base: string) => `${base} ${stamp}`;

  beforeAll(async () => {
    const um = (equipment: string) =>
      prisma.exercise.findFirstOrThrow({
        where: { createdByUserId: null, groupOwned: false, equipment },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      });
    halteres = await um('halteres');
    barra = await um('barra');
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.workoutPlan.deleteMany({ where: { userId: { in: criados } } });
    await prisma.workoutSession.deleteMany({ where: { userId: { in: criados } } });
    await prisma.exercise.deleteMany({ where: { groupOwned: true, name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('exercício da casa', () => {
    it('a equipe cria; o membro acha primeiro na busca; quem é de fora não acha nem abre', async () => {
      const a = await comunidade();
      const estranho = await pessoa('Estranho');
      const criado = await catalog.create(a.prof, a.groupId, {
        name: nome('Leg press 45 da casa'),
        muscleGroup: 'pernas',
        equipment: 'máquina',
        instructions: ['Pés na largura do quadril'],
      });
      expect(criado).toMatchObject({ ownedByCommunity: true, canEdit: true });

      const busca = await exercises.search(a.membro, { q: 'leg press' });
      expect(busca[0]).toMatchObject({ id: criado.exerciseId, communityName: 'Academia' });

      const deFora = await exercises.search(estranho, { q: nome('Leg press 45 da casa') });
      expect(deFora.map((e) => e.id)).not.toContain(criado.exerciseId);
      await expect(exercises.getWithMedia(estranho, criado.exerciseId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('membro não cria; nome repetido na comunidade é conflito', async () => {
      const a = await comunidade();
      await expect(
        catalog.create(a.membro, a.groupId, { name: nome('Remada'), muscleGroup: 'costas' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await catalog.create(a.dono, a.groupId, { name: nome('Remada'), muscleGroup: 'costas' });
      await expect(
        catalog.create(a.prof, a.groupId, { name: nome('Remada'), muscleGroup: 'costas' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('quem é de fora não põe o exercício da comunidade no próprio plano (#92)', async () => {
      const a = await comunidade();
      const estranho = await pessoa('Estranho');
      const criado = await catalog.create(a.dono, a.groupId, {
        name: nome('Puxada da casa'),
        muscleGroup: 'costas',
      });
      const plano = await plans.create(estranho, { name: 'Meu' });
      await expect(
        plans.addExercise(estranho, plano.id, {
          exerciseId: criado.exerciseId,
          order: 1,
          targetSets: 3,
          targetReps: '10',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        plans.addExercise(a.membro, (await plans.create(a.membro, { name: 'Meu' })).id, {
          exerciseId: criado.exerciseId,
          order: 1,
          targetSets: 3,
          targetReps: '10',
        }),
      ).resolves.toMatchObject({ exerciseId: criado.exerciseId });
    });

    it('a cópia que o membro faz para editar é dele, e não da comunidade', async () => {
      const a = await comunidade();
      const criado = await catalog.create(a.dono, a.groupId, {
        name: nome('Agachamento no smith'),
        muscleGroup: 'pernas',
      });
      const copia = await exercises.cloneForEdit(a.membro, criado.exerciseId);
      expect(copia).toMatchObject({ createdByUserId: a.membro, groupOwned: false, groupId: null });
    });
  });

  describe('tutorial', () => {
    it('vídeo e fotos da comunidade aparecem no detalhe do membro; o agente recebe sem URL', async () => {
      const a = await comunidade();
      const estranho = await pessoa('Estranho');
      const video = await envia(a.prof, a.groupId, 'exercise_video', 'video/mp4', MP4);
      const foto = await envia(a.prof, a.groupId, 'exercise_photo', 'image/png', PNG);
      await catalog.setGuide(a.prof, a.groupId, halteres.id, {
        videoFileId: video,
        photoFileIds: [foto],
        tips: 'Cotovelo **colado** no corpo.',
      });

      const detalhe = await exercises.getWithMedia(a.membro, halteres.id);
      expect(detalhe.community).toMatchObject({
        groupName: 'Academia',
        tips: 'Cotovelo **colado** no corpo.',
        video: { url: expect.stringContaining('memory://get/') },
        photos: [{ url: expect.stringContaining('.webp') }],
      });

      const agente = await exercises.get(a.membro, halteres.id);
      expect(agente.community).toEqual({
        groupName: 'Academia',
        tips: 'Cotovelo **colado** no corpo.',
        hasVideo: true,
        photoCount: 1,
      });
      expect(JSON.stringify(agente)).not.toContain('memory://');

      // Quem não é da comunidade vê o exercício do catálogo, sem o tutorial dela.
      expect((await exercises.getWithMedia(estranho, halteres.id)).community).toBeNull();
    });

    it('trocar o vídeo apaga o antigo do bucket', async () => {
      const a = await comunidade();
      const v1 = await envia(a.dono, a.groupId, 'exercise_video', 'video/mp4', MP4);
      const v2 = await envia(a.dono, a.groupId, 'exercise_video', 'video/mp4', MP4);
      await catalog.setGuide(a.dono, a.groupId, barra.id, { videoFileId: v1 });
      const chave = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: v1 } })).key;
      await catalog.setGuide(a.dono, a.groupId, barra.id, { videoFileId: v2 });
      expect(store.objects.has(chave)).toBe(false);
      expect(await prisma.mediaFile.findUnique({ where: { id: v1 } })).toBeNull();
    });

    it('vídeo que não é MP4/MOV é recusado na confirmação e sai do bucket', async () => {
      const a = await comunidade();
      const html = Buffer.from('<html><script>alert(1)</script></html>');
      const r = await media.requestUpload(a.dono, {
        purpose: 'exercise_video',
        groupId: a.groupId,
        mime: 'video/mp4',
        bytes: html.length,
      });
      const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
      store.upload(f.key, html, 'video/mp4');
      await expect(media.confirm(a.dono, r.fileId)).rejects.toBeInstanceOf(BadRequestException);
      expect(store.objects.has(f.key)).toBe(false);
    });

    it('não aceita exercício pessoal de alguém, nem o de outra comunidade, nem mídia alheia', async () => {
      const a = await comunidade('Academia A');
      const b = await comunidade('Academia B');
      const pessoal = await exercises.createCustom(a.membro, {
        name: nome('Meu exercício'),
        muscleGroup: 'core',
      });
      const daB = await catalog.create(b.dono, b.groupId, {
        name: nome('Máquina da B'),
        muscleGroup: 'costas',
      });
      for (const exerciseId of [pessoal.id, daB.exerciseId]) {
        await expect(
          catalog.setGuide(a.dono, a.groupId, exerciseId, { tips: 'x' }),
        ).rejects.toBeInstanceOf(NotFoundException);
      }

      const videoDaB = await envia(b.dono, b.groupId, 'exercise_video', 'video/mp4', MP4);
      const capaDaA = await envia(a.dono, a.groupId, 'group_content', 'image/png', PNG);
      await expect(
        catalog.setGuide(a.dono, a.groupId, halteres.id, { videoFileId: videoDaB }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Imagem enviada como capa de plano não vira foto de exercício.
      await expect(
        catalog.setGuide(a.dono, a.groupId, halteres.id, { photoFileIds: [capaDaA] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('o profissional não muda o tutorial do dono; o dono muda o do profissional', async () => {
      const a = await comunidade();
      await catalog.setGuide(a.dono, a.groupId, halteres.id, { tips: 'do dono' });
      await catalog.setGuide(a.prof, a.groupId, barra.id, { tips: 'do prof' });
      await expect(
        catalog.setGuide(a.prof, a.groupId, halteres.id, { tips: 'meu agora' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        catalog.setGuide(a.dono, a.groupId, barra.id, { tips: 'revisado' }),
      ).resolves.toMatchObject({ tips: 'revisado' });
    });
  });

  describe('na minha academia', () => {
    it('só o que a comunidade destaca, o equipamento dela e peso corporal', async () => {
      const a = await comunidade();
      await catalog.setEquipment(a.dono, a.groupId, ['halteres']);
      const daCasa = await catalog.create(a.dono, a.groupId, {
        name: nome('Cadeira extensora'),
        muscleGroup: 'pernas',
        equipment: 'máquina',
      });
      const filtrado = await exercises.search(a.membro, { onlyMyGym: true, limit: 50 });
      expect(filtrado[0]!.id).toBe(daCasa.exerciseId);
      const equipamentos = new Set(filtrado.slice(1).map((e) => e.equipment));
      expect([...equipamentos].sort()).toEqual(['halteres', 'peso corporal']);

      const tudo = await exercises.search(a.membro, { limit: 50 });
      expect(tudo.some((e) => e.equipment === 'barra')).toBe(true);
    });

    it('só o dono marca o equipamento, e só da lista', async () => {
      const a = await comunidade();
      await expect(catalog.setEquipment(a.prof, a.groupId, ['halteres'])).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        catalog.setEquipment(a.dono, a.groupId, ['nave espacial']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('plano pronto com exercício da casa', () => {
    it('o membro adota e o plano aponta para o exercício da comunidade', async () => {
      const a = await comunidade();
      const daCasa = await catalog.create(a.prof, a.groupId, {
        name: nome('Remada cavalinho da casa'),
        muscleGroup: 'costas',
      });
      const plano = await plans.create(a.prof, { name: 'Costas' });
      await plans.addExercise(a.prof, plano.id, {
        exerciseId: daCasa.exerciseId,
        order: 0,
        targetSets: 3,
        targetReps: '10',
      });
      const modelo = await content.createWorkoutTemplate(a.prof, a.groupId, { planId: plano.id });
      expect(modelo.exercises).toEqual([
        expect.objectContaining({ name: nome('Remada cavalinho da casa') }),
      ]);
      await content.setTemplatePublished(a.prof, a.groupId, modelo.id, true);

      const adotado = await content.adopt(a.membro, a.groupId, modelo.id, {});
      const meu = await plans.findById(a.membro, adotado.planId!);
      expect(meu.exercises.map((e) => e.exerciseId)).toEqual([daCasa.exerciseId]);

      // E o plano pronto segura a remoção do exercício.
      await expect(catalog.remove(a.prof, a.groupId, daCasa.exerciseId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('quando some', () => {
    it('exercício em uso sai da comunidade, mas fica no histórico de quem treinou e fora do catálogo público', async () => {
      const a = await comunidade();
      const estranho = await pessoa('Estranho');
      const daCasa = await catalog.create(a.dono, a.groupId, {
        name: nome('Hack machine'),
        muscleGroup: 'pernas',
      });
      const plano = await plans.create(a.membro, { name: 'Pernas' });
      await plans.addExercise(a.membro, plano.id, {
        exerciseId: daCasa.exerciseId,
        order: 0,
        targetSets: 3,
        targetReps: '10',
      });

      await catalog.remove(a.dono, a.groupId, daCasa.exerciseId);

      const linha = await prisma.exercise.findUniqueOrThrow({ where: { id: daCasa.exerciseId } });
      expect(linha).toMatchObject({ groupId: null, groupOwned: true, createdByUserId: null });
      expect(
        (await exercises.search(a.membro, { q: 'hack machine' })).map((e) => e.id),
      ).not.toContain(daCasa.exerciseId);
      await expect(exercises.getWithMedia(a.membro, daCasa.exerciseId)).resolves.toMatchObject({
        id: daCasa.exerciseId,
      });
      expect(
        (await exercises.search(estranho, { q: 'hack machine' })).map((e) => e.id),
      ).not.toContain(daCasa.exerciseId);
      await expect(exercises.getWithMedia(estranho, daCasa.exerciseId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('exercício que ninguém usa é apagado; tutorial do catálogo geral só tira o tutorial', async () => {
      const a = await comunidade();
      const daCasa = await catalog.create(a.dono, a.groupId, {
        name: nome('Polia da casa'),
        muscleGroup: 'braço',
      });
      await catalog.remove(a.dono, a.groupId, daCasa.exerciseId);
      expect(await prisma.exercise.findUnique({ where: { id: daCasa.exerciseId } })).toBeNull();

      await catalog.setGuide(a.dono, a.groupId, halteres.id, { tips: 'x' });
      await catalog.remove(a.dono, a.groupId, halteres.id);
      expect(await prisma.exercise.findUnique({ where: { id: halteres.id } })).not.toBeNull();
      expect((await exercises.getWithMedia(a.membro, halteres.id)).community).toBeNull();
    });

    it('apagar a comunidade leva o que ninguém usa; o que alguém usa não vira catálogo de todo mundo', async () => {
      const a = await comunidade();
      const estranho = await pessoa('Estranho');
      const usado = await catalog.create(a.dono, a.groupId, {
        name: nome('Usado'),
        muscleGroup: 'core',
      });
      const solto = await catalog.create(a.dono, a.groupId, {
        name: nome('Solto'),
        muscleGroup: 'core',
      });
      const plano = await plans.create(a.membro, { name: 'Core' });
      await plans.addExercise(a.membro, plano.id, {
        exerciseId: usado.exerciseId,
        order: 0,
        targetSets: 3,
        targetReps: '10',
      });

      await groups.remove(a.dono, a.groupId);

      expect(await prisma.exercise.findUnique({ where: { id: solto.exerciseId } })).toBeNull();
      expect(
        await prisma.exercise.findUniqueOrThrow({ where: { id: usado.exerciseId } }),
      ).toMatchObject({ groupId: null, groupOwned: true });
      expect(
        (await exercises.search(estranho, { q: nome('Usado') })).map((e) => e.id),
      ).not.toContain(usado.exerciseId);
      await expect(exercises.getWithMedia(a.membro, usado.exerciseId)).resolves.toMatchObject({
        id: usado.exerciseId,
      });
    });

    it('o banco recusa exercício de comunidade com dono pessoa', async () => {
      const a = await comunidade();
      await expect(
        prisma.exercise.create({
          data: {
            name: nome('Torto'),
            muscleGroup: 'core',
            groupOwned: true,
            groupId: a.groupId,
            createdByUserId: a.dono,
          },
        }),
      ).rejects.toThrow(/Exercise_group_owned_has_no_user/);
    });
  });

  it('o membro lista o catálogo da comunidade; quem é de fora não', async () => {
    const a = await comunidade();
    const b = await comunidade('Outra');
    await catalog.setGuide(a.dono, a.groupId, halteres.id, { tips: 'x' });
    await expect(catalog.listForMember(a.membro, a.groupId)).resolves.toEqual([
      expect.objectContaining({ exerciseId: halteres.id, ownedByCommunity: false }),
    ]);
    await expect(catalog.listForMember(b.membro, a.groupId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
