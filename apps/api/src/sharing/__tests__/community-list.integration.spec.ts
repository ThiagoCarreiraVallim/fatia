import { PrismaService } from '../../common/prisma.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { GroupService } from '../group.service';
import { MembershipService } from '../membership.service';
import { PostService } from '../post.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * "Minhas comunidades" (#393, Cm-01): cada cartão diz quantas pessoas, quantos
 * posts novos desde a última visita ao mural, o que está esperando a pessoa e a
 * posição dela no desafio em andamento. Tudo do ponto de vista de quem pergunta.
 */
describe('minhas comunidades (integração)', () => {
  const prisma = new PrismaService();
  const media = new MediaService(prisma, new MemoryObjectStore());
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const groups = new GroupService(prisma, links, [], media);
  const posts = new PostService(prisma, media, silentNotifications);

  const stamp = `lista-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user.id;
  }

  async function comunidade() {
    const dono = await pessoa('Dona');
    const grupo = await groups.create(dono, {
      visibility: 'PUBLIC',
      type: 'SPONSORED',
      name: 'Academia',
      joinPolicy: 'OPEN',
      timezone: 'America/Cuiaba',
    });
    grupos.push(grupo.id);
    const aluna = await pessoa('Aluna');
    const { membershipId } = await memberships.requestJoin(aluna, grupo.slug, {
      scopes: [],
      statsOptIn: false,
    });
    return { dono, aluna, grupo, membershipId };
  }

  const minha = async (userId: string, groupId: string) =>
    (await groups.listMine(userId)).find((g) => g.id === groupId)!;

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('mostra quantas pessoas ativas, a visibilidade e o fuso', async () => {
    const { aluna, grupo } = await comunidade();
    expect(await minha(aluna, grupo.id)).toMatchObject({
      memberCount: 2,
      visibility: 'PUBLIC',
      timezone: 'America/Cuiaba',
    });
  });

  it('conta os posts novos dos outros; abrir o mural zera', async () => {
    const { dono, aluna, grupo, membershipId } = await comunidade();
    const donaM = await prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId: grupo.id, userId: dono } },
    });
    await prisma.groupMembership.update({
      where: { id: membershipId },
      data: { feedSeenAt: new Date(Date.now() - 60_000) },
    });
    await prisma.groupPost.createMany({
      data: [
        { groupId: grupo.id, membershipId: donaM.id, body: 'um' },
        { groupId: grupo.id, membershipId: donaM.id, body: 'dois' },
        // O próprio post não é novidade para quem escreveu.
        { groupId: grupo.id, membershipId, body: 'meu' },
        // Removido não conta.
        { groupId: grupo.id, membershipId: donaM.id, body: 'fora', removedAt: new Date() },
        // Antes da última visita, também não.
        {
          groupId: grupo.id,
          membershipId: donaM.id,
          body: 'velho',
          createdAt: new Date(Date.now() - 120_000),
        },
      ],
    });
    expect((await minha(aluna, grupo.id)).newPostCount).toBe(2);

    // Ler o mural não zera (a faixa "posts novos" do mural precisa da contagem);
    // abrir a tela chama o `markSeen` (#394), como a web e o app fazem.
    await posts.list(aluna, grupo.id);
    expect((await minha(aluna, grupo.id)).newPostCount).toBe(2);
    await posts.markSeen(aluna, grupo.id);
    expect((await minha(aluna, grupo.id)).newPostCount).toBe(0);
  });

  it('o plano mandado pela equipe e ainda sem resposta conta como "para você"', async () => {
    const { dono, aluna, grupo } = await comunidade();
    expect((await minha(aluna, grupo.id)).forYouCount).toBe(0);
    await prisma.planOffer.create({
      data: {
        userId: aluna,
        authorId: dono,
        groupId: grupo.id,
        versions: {
          create: {
            version: 1,
            status: 'PENDING',
            title: 'Treino A',
            snapshot: {},
            snapshotVersion: 1,
            schedule: 'FLEXIBLE',
          },
        },
      },
    });
    expect((await minha(aluna, grupo.id)).forYouCount).toBe(1);
  });

  it('a posição no desafio em andamento, só de quem participa', async () => {
    const { dono, aluna, grupo, membershipId } = await comunidade();
    expect((await minha(aluna, grupo.id)).challenge).toBeNull();
    const donaM = await prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId: grupo.id, userId: dono } },
    });
    const desafio = await prisma.groupChallenge.create({
      data: {
        groupId: grupo.id,
        title: 'Março ativo',
        metric: 'WORKOUT_SESSIONS',
        timezone: 'America/Cuiaba',
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect((await minha(aluna, grupo.id)).challenge).toBeNull();
    await prisma.groupChallengeParticipant.createMany({
      data: [
        { challengeId: desafio.id, membershipId: donaM.id, displayName: 'D', score: 9 },
        { challengeId: desafio.id, membershipId, displayName: 'A', score: 3 },
      ],
    });
    expect((await minha(aluna, grupo.id)).challenge).toEqual({
      id: desafio.id,
      title: 'Março ativo',
      rank: 2,
    });
  });

  describe('quem da equipe vê (Cm-04)', () => {
    it('lista a equipe com o que cada um vê de mim e quando olhou por último', async () => {
      const { dono, grupo } = await comunidade();
      const pro = await pessoa('Helena');
      await prisma.groupMembership.create({
        data: { groupId: grupo.id, userId: pro, role: 'PROFESSIONAL', status: 'ACTIVE' },
      });
      const ana = await pessoa('Ana');
      await memberships.requestJoin(ana, grupo.slug, { scopes: ['WORKOUT'], statsOptIn: false });
      const bia = await pessoa('Bia');
      await memberships.requestJoin(bia, grupo.slug, { scopes: ['WORKOUT'], statsOptIn: false });

      const link = await prisma.professionalLink.findFirstOrThrow({
        where: { groupId: grupo.id, subjectUserId: ana, professionalId: pro, revokedAt: null },
      });
      const viu = new Date();
      await prisma.professionalAccessLog.createMany({
        data: [
          {
            linkId: link.id,
            professionalId: pro,
            subjectUserId: ana,
            scope: 'WORKOUT',
            action: 'x',
            at: viu,
          },
          // Negado não é "viu".
          {
            professionalId: dono,
            subjectUserId: ana,
            scope: 'NUTRITION',
            action: 'x',
            denied: true,
          },
          // O que olharam da Bia não aparece para a Ana.
          { professionalId: dono, subjectUserId: bia, scope: 'WORKOUT', action: 'x' },
        ],
      });

      const equipe = await memberships.teamForMember(ana, grupo.id);
      expect(equipe).toEqual([
        {
          name: 'Dona',
          role: 'OWNER',
          specialty: null,
          accompaniesMe: false,
          sees: ['WORKOUT'],
          lastViewedAt: null,
        },
        {
          name: 'Helena',
          role: 'PROFESSIONAL',
          specialty: null,
          accompaniesMe: false,
          sees: ['WORKOUT'],
          lastViewedAt: viu,
        },
      ]);
      // Outros alunos nunca aparecem.
      expect(JSON.stringify(equipe)).not.toMatch(/Bia|Aluna/);
    });

    it('quem não é da comunidade não vê a equipe', async () => {
      const { grupo } = await comunidade();
      const estranha = await pessoa('Estranha');
      await expect(memberships.teamForMember(estranha, grupo.id)).rejects.toThrow(
        'Group not found',
      );
    });
  });

  describe('"PRO pago pela academia" (revisão I2)', () => {
    async function comAssento() {
      const c = await comunidade();
      const pool = await prisma.groupSeatPool.create({
        data: { groupId: c.grupo.id, seats: 1, unitPriceCents: 1490, status: 'ACTIVE' },
      });
      await prisma.groupSeatAssignment.create({
        data: { poolId: pool.id, membershipId: c.membershipId },
      });
      return c;
    }

    it('assento valendo e sem assinatura própria: quem paga é esta comunidade', async () => {
      const { aluna, grupo } = await comAssento();
      expect(await minha(aluna, grupo.id)).toMatchObject({
        hasAiSeat: true,
        proPaidByThisGroup: true,
      });
    });

    it('assinatura pessoal ativa mais assento: o PRO é da pessoa, não da academia', async () => {
      const { aluna, grupo } = await comAssento();
      await prisma.userSubscription.create({
        data: {
          userId: aluna,
          source: 'ASAAS',
          status: 'ACTIVE',
          interval: 'MONTHLY',
          currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
        },
      });
      expect(await minha(aluna, grupo.id)).toMatchObject({
        hasAiSeat: true,
        proPaidByThisGroup: false,
      });
      expect((await groups.findByIdForMember(aluna, grupo.id)).proPaidByThisGroup).toBe(false);
    });

    it('sem assento, não é pago pela academia', async () => {
      const { aluna, grupo } = await comunidade();
      expect((await minha(aluna, grupo.id)).proPaidByThisGroup).toBe(false);
    });
  });
});
