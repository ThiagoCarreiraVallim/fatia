import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { GroupExerciseService } from '../group-exercise.service';
import { GroupService } from '../group.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { mp4WithDuration } from '../../storage/__tests__/mp4-fixture';

/**
 * O catálogo da equipe (#408, Pn-11 e Pn-11b) no Postgres real: busca e filtros
 * sobre o catálogo inteiro, favorito da equipe, guia com passos, erros, selo
 * DA CASA e padrão no plano, duplicar, "em N planos" e a regra do vídeo.
 */
describe('catálogo de exercícios da equipe (#408, integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const exercises = new ExerciseService(prisma, media);
  const plans = new WorkoutPlanService(prisma);
  const catalog = new GroupExerciseService(prisma, media);
  const groups = new GroupService(
    prisma,
    new ProfessionalLinkService(prisma),
    [{ beforeDelete: (groupId) => exercises.beforeDeleteGroup(groupId) }],
    media,
  );

  const stamp = `cat408-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;
  let agachamento: { id: number; name: string; muscleGroup: string };
  let supino: { id: number; name: string };

  async function pessoa(nome = 'Pessoa') {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `${nome} ${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  async function entra(groupId: string, role: 'MEMBER' | 'PROFESSIONAL' | 'RECEPTION') {
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

  async function enviaVideo(userId: string, groupId: string, body: Buffer) {
    const r = await media.requestUpload(userId, {
      purpose: 'exercise_video',
      groupId,
      mime: 'video/mp4',
      bytes: body.length,
    });
    const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(f.key, body, 'video/mp4');
    return r.fileId;
  }

  const nome = (base: string) => `${base} ${stamp}`;

  beforeAll(async () => {
    agachamento = await prisma.exercise.findFirstOrThrow({
      where: { createdByUserId: null, groupOwned: false, muscleGroup: 'pernas' },
      select: { id: true, name: true, muscleGroup: true },
      orderBy: { id: 'asc' },
    });
    supino = await prisma.exercise.findFirstOrThrow({
      where: { createdByUserId: null, groupOwned: false, muscleGroup: 'peito' },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.workoutPlan.deleteMany({ where: { userId: { in: criados } } });
    await prisma.exercise.deleteMany({ where: { groupOwned: true, name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('catálogo com filtros (Pn-11)', () => {
    it('lista o catálogo inteiro mais o da casa, sem o de outra comunidade nem o pessoal', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      const daCasa = await catalog.create(a.prof, a.groupId, {
        name: nome('Leg da casa'),
        muscleGroup: 'pernas',
      });
      const deOutra = await catalog.create(b.prof, b.groupId, {
        name: nome('Leg de outra'),
        muscleGroup: 'pernas',
      });
      const pessoal = await exercises.createCustom(a.prof, {
        name: nome('Meu pessoal'),
        muscleGroup: 'pernas',
      });

      const geral = await prisma.exercise.count({
        where: { createdByUserId: null, groupOwned: false },
      });
      const page = await catalog.listForTeam(a.prof, a.groupId, { q: stamp, limit: 50 });
      expect(page.total).toBe(geral + 1);
      const ids = page.items.map((i) => i.exerciseId);
      expect(ids).toContain(daCasa.exerciseId);
      expect(ids).not.toContain(deOutra.exerciseId);
      expect(ids).not.toContain(pessoal.id);
      expect(page.count).toBe(1);
    });

    it('filtra por músculo, equipamento, da casa e favorito, com a contagem por faceta', async () => {
      const a = await comunidade();
      await catalog.setGuide(a.prof, a.groupId, agachamento.id, { homeFriendly: true });
      await catalog.setFavorite(a.prof, a.groupId, supino.id, true);

      const casa = await catalog.listForTeam(a.prof, a.groupId, { house: true });
      expect(casa.items.map((i) => i.exerciseId)).toEqual([agachamento.id]);
      expect(casa.items[0]).toMatchObject({ homeFriendly: true, hasGuide: true });

      const favs = await catalog.listForTeam(a.prof, a.groupId, { favorite: true });
      expect(favs.items.map((i) => i.exerciseId)).toEqual([supino.id]);

      const pernas = await catalog.listForTeam(a.prof, a.groupId, { muscle: 'pernas', limit: 500 });
      expect(pernas.items.every((i) => i.muscleGroup === 'pernas')).toBe(true);
      expect(pernas.facets.muscles.pernas).toBe(pernas.count);
      // A faceta do músculo ignora o próprio filtro: mostra quantos há nos outros.
      expect(pernas.facets.muscles.peito).toBeGreaterThan(0);

      const halteres = await catalog.listForTeam(a.prof, a.groupId, { equipment: 'halteres' });
      expect(halteres.count).toBeGreaterThan(0);
      expect(halteres.items.every((i) => i.equipment === 'halteres')).toBe(true);
    });

    it('favoritos da equipe vêm primeiro, também na busca por nome', async () => {
      const a = await comunidade();
      const termo = supino.name.split(' ')[0]!;
      const antes = await catalog.listForTeam(a.prof, a.groupId, { q: termo });
      const ultimo = antes.items[antes.items.length - 1]!;
      await catalog.setFavorite(a.dono, a.groupId, ultimo.exerciseId, true);
      const depois = await catalog.listForTeam(a.prof, a.groupId, { q: termo });
      expect(depois.items[0]).toMatchObject({ exerciseId: ultimo.exerciseId, favorite: true });
      // Sem termo também.
      const tudo = await catalog.listForTeam(a.prof, a.groupId, { limit: 5 });
      expect(tudo.items[0]?.exerciseId).toBe(ultimo.exerciseId);
    });

    it('membro e recepção não abrem o catálogo da equipe', async () => {
      const a = await comunidade();
      const recepcao = await entra(a.groupId, 'RECEPTION');
      await expect(catalog.listForTeam(a.membro, a.groupId, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(catalog.listForTeam(recepcao, a.groupId, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('favorito da equipe', () => {
    it('é da comunidade, idempotente, e não vaza para a outra', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      await catalog.setFavorite(a.prof, a.groupId, supino.id, true);
      await catalog.setFavorite(a.prof, a.groupId, supino.id, true);
      expect(
        await prisma.groupExerciseFavorite.count({
          where: { groupId: a.groupId, exerciseId: supino.id },
        }),
      ).toBe(1);
      // Quem marcou foi o profissional; o dono vê marcado (é da equipe).
      expect((await catalog.getForTeam(a.dono, a.groupId, supino.id)).favorite).toBe(true);
      expect((await catalog.getForTeam(b.dono, b.groupId, supino.id)).favorite).toBe(false);
      await catalog.setFavorite(a.dono, a.groupId, supino.id, false);
      await catalog.setFavorite(a.dono, a.groupId, supino.id, false);
      expect((await catalog.getForTeam(a.prof, a.groupId, supino.id)).favorite).toBe(false);
    });

    it('não favorita exercício de outra comunidade nem pessoal; membro não favorita', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      const deOutra = await catalog.create(b.prof, b.groupId, {
        name: nome('Da outra'),
        muscleGroup: 'costas',
      });
      const pessoal = await exercises.createCustom(b.membro, {
        name: nome('Pessoal B'),
        muscleGroup: 'costas',
      });
      await expect(
        catalog.setFavorite(a.prof, a.groupId, deOutra.exerciseId, true),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(catalog.setFavorite(a.prof, a.groupId, pessoal.id, true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        catalog.setFavorite(a.membro, a.groupId, supino.id, true),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await prisma.groupExerciseFavorite.count({ where: { groupId: a.groupId } })).toBe(0);
    });
  });

  describe('guia da casa (Pn-11b)', () => {
    it('grava passos, erros, selo e padrão; o membro e o agente recebem', async () => {
      const a = await comunidade();
      const salvo = await catalog.setGuide(a.prof, a.groupId, agachamento.id, {
        steps: ['  Pés na largura dos ombros. ', '', 'Desça até a coxa passar do joelho.'],
        commonMistakes: ['Joelho para dentro na subida.'],
        homeFriendly: true,
        defaultSets: 4,
        defaultReps: '6-8',
        defaultRestSeconds: 120,
        defaultLoadMode: 'WEIGHT',
      });
      expect(salvo).toMatchObject({
        steps: ['Pés na largura dos ombros.', 'Desça até a coxa passar do joelho.'],
        commonMistakes: ['Joelho para dentro na subida.'],
        homeFriendly: true,
        defaults: { sets: 4, reps: '6-8', restSeconds: 120, loadMode: 'WEIGHT' },
      });

      const tela = await exercises.getWithMedia(a.membro, agachamento.id);
      expect(tela.community).toMatchObject({
        steps: ['Pés na largura dos ombros.', 'Desça até a coxa passar do joelho.'],
        commonMistakes: ['Joelho para dentro na subida.'],
        homeFriendly: true,
      });
      const agente = await exercises.get(a.membro, agachamento.id);
      expect(agente.community).toMatchObject({
        steps: ['Pés na largura dos ombros.', 'Desça até a coxa passar do joelho.'],
        commonMistakes: ['Joelho para dentro na subida.'],
        homeFriendly: true,
      });
      const forma = await exercises.explainForm(a.membro, agachamento.name);
      expect(forma.find((f) => f.id === agachamento.id)).toMatchObject({
        community: {
          groupName: 'Academia',
          steps: ['Pés na largura dos ombros.', 'Desça até a coxa passar do joelho.'],
          commonMistakes: ['Joelho para dentro na subida.'],
          homeFriendly: true,
        },
      });
    });

    it('recusa padrão fora da faixa e repetições sem sentido', async () => {
      const a = await comunidade();
      await expect(
        catalog.setGuide(a.prof, a.groupId, agachamento.id, { defaultSets: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        catalog.setGuide(a.prof, a.groupId, agachamento.id, { defaultReps: 'muitas' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        catalog.setGuide(a.prof, a.groupId, agachamento.id, {
          steps: Array.from({ length: 13 }, (_, i) => `passo ${i}`),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('o detalhe da equipe abre exercício do catálogo ainda sem guia, e não o de outra comunidade', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      const deOutra = await catalog.create(b.prof, b.groupId, {
        name: nome('Só da B'),
        muscleGroup: 'ombro',
      });
      const semGuia = await catalog.getForTeam(a.prof, a.groupId, supino.id);
      expect(semGuia).toMatchObject({
        exerciseId: supino.id,
        hasGuide: false,
        ownedByCommunity: false,
        steps: [],
        video: null,
        usage: { templates: 0, plans: { band: 'none', count: null } },
      });
      await expect(
        catalog.getForTeam(a.prof, a.groupId, deOutra.exerciseId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('"em N planos": o plano pessoal dos membros não conta (só o que veio da comunidade, #466)', async () => {
      const a = await comunidade();
      const usar = async (userId: string) => {
        const p = await plans.create(userId, { name: 'Pernas' });
        await plans.addExercise(userId, p.id, {
          exerciseId: agachamento.id,
          order: 0,
          targetSets: 3,
          targetReps: '10',
        });
      };
      await usar(a.membro);
      for (let i = 0; i < 5; i++) await usar(await entra(a.groupId, 'MEMBER'));
      expect((await catalog.getForTeam(a.prof, a.groupId, agachamento.id)).usage?.plans).toEqual({
        band: 'none',
        count: null,
      });
    });
  });

  describe('duplicar', () => {
    it('cria uma cópia da casa com o guia, sem vídeo nem fotos', async () => {
      const a = await comunidade();
      await catalog.setGuide(a.prof, a.groupId, agachamento.id, {
        steps: ['Desça devagar.'],
        homeFriendly: true,
        defaultSets: 3,
        tips: 'Respire.',
      });
      const copia = await catalog.duplicate(a.prof, a.groupId, agachamento.id);
      expect(copia.exerciseId).not.toBe(agachamento.id);
      expect(copia).toMatchObject({
        name: `${agachamento.name} (cópia)`,
        ownedByCommunity: true,
        muscleGroup: agachamento.muscleGroup,
        steps: ['Desça devagar.'],
        homeFriendly: true,
        tips: 'Respire.',
        video: null,
        photos: [],
      });
      const row = await prisma.exercise.findUniqueOrThrow({ where: { id: copia.exerciseId } });
      expect(row).toMatchObject({
        groupId: a.groupId,
        groupOwned: true,
        clonedFromId: agachamento.id,
      });
      // Duplicar de novo não colide no nome.
      const outra = await catalog.duplicate(a.prof, a.groupId, agachamento.id);
      expect(outra.name).toBe(`${agachamento.name} (cópia 2)`);
      await prisma.exercise.deleteMany({
        where: { id: { in: [copia.exerciseId, outra.exerciseId] } },
      });
    });

    it('não duplica exercício de outra comunidade', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      const deOutra = await catalog.create(b.prof, b.groupId, {
        name: nome('Segredo da B'),
        muscleGroup: 'core',
      });
      await expect(catalog.duplicate(a.prof, a.groupId, deOutra.exerciseId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('vídeo do exercício: até 60 s', () => {
    it('lê a duração no confirm; passa de 60 s é recusado e sai do bucket', async () => {
      const a = await comunidade();
      const curto = await enviaVideo(a.prof, a.groupId, mp4WithDuration(24_000));
      const view = await media.confirm(a.prof, curto);
      expect(view).toMatchObject({ id: curto });
      expect((await prisma.mediaFile.findUniqueOrThrow({ where: { id: curto } })).durationMs).toBe(
        24_000,
      );

      // O moov depois do mdat, como o celular grava.
      const longo = await enviaVideo(
        a.prof,
        a.groupId,
        mp4WithDuration(61_000, { moovAtEnd: true }),
      );
      const chave = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: longo } })).key;
      await expect(media.confirm(a.prof, longo)).rejects.toThrow(/60 s/);
      expect(store.objects.has(chave)).toBe(false);
    });
  });
});
