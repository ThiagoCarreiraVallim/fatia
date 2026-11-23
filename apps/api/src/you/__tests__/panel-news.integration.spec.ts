import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import { NEWS, NEWS_IDS } from '../news-catalog';
import { PANEL_NEWS, PANEL_NEWS_IDS } from '../panel-news-catalog';
import { YouService } from '../you.service';

/**
 * Novidades do painel e "Sugerir uma ideia" da equipe (#413, Pn-27 e Pn-27b),
 * no Postgres real. Mesmo desenho das novidades do aluno (#387): catálogo em
 * código, lidas em `UserNewsRead`, ideias em `FeedbackIdea` com a área.
 */
describe('Novidades do painel e ideias da equipe (integração, #413)', () => {
  const prisma = new PrismaService();
  const you = new YouService(prisma);
  const stamp = `pnews-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(): Promise<string> {
    n += 1;
    const u = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: `Pessoa ${n}`,
        // "Existe desde antes" de todo o catálogo.
        createdAt: new Date('2026-01-01'),
      },
    });
    usuarios.push(u.id);
    return u.id;
  }

  async function comunidade(dono: string, membros: [string, GroupRole][] = []) {
    const g = await prisma.group.create({
      data: {
        type: GroupType.SOCIAL,
        name: `Comunidade ${stamp}`,
        slug: `${stamp}-${grupos.length}`,
        ownerId: dono,
        memberships: {
          create: [
            { userId: dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            ...membros.map(([userId, role]) => ({
              userId,
              role,
              status: MembershipStatus.ACTIVE,
            })),
          ],
        },
      },
    });
    grupos.push(g.id);
    return g.id;
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  it('o catálogo do painel não divide id com o do aluno', () => {
    expect(PANEL_NEWS.length).toBeGreaterThan(0);
    for (const id of PANEL_NEWS_IDS) {
      expect(id.startsWith('painel-')).toBe(true);
      expect(NEWS_IDS.has(id)).toBe(false);
    }
    expect(PANEL_NEWS_IDS.size).toBe(PANEL_NEWS.length);
  });

  it('conta as não lidas, marca uma, depois todas; nada vaza para as do aluno', async () => {
    const dona = await pessoa();
    await comunidade(dona);

    const antes = await you.panelNews(dona);
    expect(antes.unreadCount).toBe(PANEL_NEWS.length);
    expect(antes.items.map((i) => i.id)).toEqual(PANEL_NEWS.map((p) => p.id));

    const uma = await you.markPanelNewsRead(dona, [PANEL_NEWS[0]!.id, NEWS[0]!.id, 'inventada']);
    expect(uma.unreadCount).toBe(PANEL_NEWS.length - 1);
    expect(uma.items.find((i) => i.id === PANEL_NEWS[0]!.id)!.unread).toBe(false);
    // Id do aluno ou inventado pela rota do painel não grava nada.
    expect(
      await prisma.userNewsRead.count({
        where: { userId: dona, newsId: { in: [NEWS[0]!.id, 'inventada'] } },
      }),
    ).toBe(0);

    expect((await you.markPanelNewsRead(dona)).unreadCount).toBe(0);
    // "Marcar tudo" no painel não marca as novidades do aluno, nem o contrário.
    expect((await you.news(dona)).unreadCount).toBe(NEWS.length);
    await you.markNewsRead(dona);
    expect(
      await prisma.userNewsRead.count({ where: { userId: dona, newsId: { in: [...NEWS_IDS] } } }),
    ).toBe(NEWS.length);
  });

  it('quem chegou depois não herda novidades velhas do painel como não lidas', async () => {
    const dono = await pessoa();
    await prisma.user.update({ where: { id: dono }, data: { createdAt: new Date('2099-01-01') } });
    await comunidade(dono);
    expect((await you.panelNews(dono)).unreadCount).toBe(0);
  });

  it('só a equipe de alguma comunidade lê as novidades do painel', async () => {
    const dona = await pessoa();
    const aluno = await pessoa();
    const admin = await pessoa();
    const sozinho = await pessoa();
    await comunidade(dona, [
      [aluno, GroupRole.MEMBER],
      [admin, GroupRole.ADMIN],
    ]);

    expect((await you.panelNews(admin)).items.length).toBe(PANEL_NEWS.length);
    await expect(you.panelNews(aluno)).rejects.toBeInstanceOf(NotFoundException);
    await expect(you.panelNews(sozinho)).rejects.toBeInstanceOf(NotFoundException);
    await expect(you.markPanelNewsRead(aluno)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.userNewsRead.count({ where: { userId: aluno } })).toBe(0);
  });

  it('a ideia da equipe guarda a área; a do aluno segue sem área', async () => {
    const dona = await pessoa();
    await comunidade(dona);
    await you.sendIdea(dona, 'Relatório por unidade', 'REPORT');
    await you.sendIdea(dona, 'Gráfico de sono');
    await expect(you.sendIdea(dona, '  ', 'PLANS')).rejects.toBeInstanceOf(BadRequestException);

    const ideias = await prisma.feedbackIdea.findMany({
      where: { userId: dona },
      orderBy: { createdAt: 'asc' },
      select: { body: true, area: true },
    });
    expect(ideias).toEqual([
      { body: 'Relatório por unidade', area: 'REPORT' },
      { body: 'Gráfico de sono', area: null },
    ]);
  });
});
