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
      visibility: 'PRIVATE',
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

    await posts.list(aluna, grupo.id);
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
});
