import { PrismaService } from '../../common/prisma.service';
import { parseInviteArgs, runCommunityInvite } from '../community-invite';
import { hashInviteToken } from '../invite.service';

describe('community:invite — argumentos', () => {
  it('lê o código, o papel e os dias, e o --purge com o e-mail', () => {
    expect(parseInviteArgs(['academia-demo'])).toEqual({
      slug: 'academia-demo',
      purge: false,
      role: 'MEMBER',
      days: 7,
    });
    expect(parseInviteArgs(['--role', 'professional', 'x', '--days', '3'])).toEqual({
      slug: 'x',
      purge: false,
      role: 'PROFESSIONAL',
      days: 3,
    });
    expect(parseInviteArgs(['x', '--purge', 'Demo@Fatia.local'])).toEqual({
      slug: 'x',
      purge: true,
      email: 'demo@fatia.local',
    });
  });

  it('recusa sem código, papel de dono e prazo fora da faixa', () => {
    expect(() => parseInviteArgs([])).toThrow(/Uso/);
    expect(() => parseInviteArgs(['x', '--role', 'OWNER'])).toThrow(/--role/);
    expect(() => parseInviteArgs(['x', '--days', '31'])).toThrow(/--days/);
    expect(() => parseInviteArgs(['x', '--purge'])).toThrow(/Uso/);
  });
});

/** Contra o Postgres de teste: o link vale, e o --purge devolve a pessoa ao estado de antes. */
describe('community:invite (banco real)', () => {
  const prisma = new PrismaService();
  const stamp = `community-invite-${Date.now()}`;
  let dona: string;
  let pessoa: string;
  let groupId: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all(
      ['dona', 'pessoa'].map((s) =>
        prisma.user.create({
          data: { logtoSub: `${stamp}-${s}`, email: `${stamp}-${s}@test.local`, name: s },
        }),
      ),
    );
    dona = a.id;
    pessoa = b.id;
    const g = await prisma.group.create({
      data: {
        type: 'SPONSORED',
        name: 'Academia Teste',
        slug: stamp,
        ownerId: dona,
        memberships: { create: [{ userId: dona, role: 'OWNER', status: 'ACTIVE' }] },
      },
    });
    groupId = g.id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: [dona, pessoa] } } });
    await prisma.$disconnect();
  });

  it('cria o convite em nome da dona e imprime o link com o token que a API confere', async () => {
    const agora = new Date('2026-10-17T12:00:00Z');
    const url = await runCommunityInvite(
      prisma,
      { slug: stamp, purge: false, role: 'MEMBER', days: 7 },
      'http://app.test/',
      agora,
    );
    const token = /^http:\/\/app\.test\/c\/([A-Za-z0-9_-]{43})$/.exec(url)?.[1];
    expect(token).toBeDefined();
    const convite = await prisma.groupInvite.findUnique({
      where: { tokenHash: hashInviteToken(token!) },
    });
    expect(convite).toMatchObject({
      groupId,
      role: 'MEMBER',
      createdById: dona,
      email: null,
      expiresAt: new Date('2026-10-24T12:00:00Z'),
    });
  });

  it('--purge tira a pessoa, os vínculos dela e os convites sem dono de outra pessoa', async () => {
    await prisma.groupMembership.create({
      data: { groupId, userId: pessoa, role: 'MEMBER', status: 'ACTIVE', consentScopes: ['GOALS'] },
    });
    await prisma.professionalLink.create({
      data: { subjectUserId: pessoa, professionalId: dona, groupId, scopes: ['GOALS'] },
    });
    await prisma.groupInvite.create({
      data: {
        groupId,
        tokenHash: `${stamp}-outro`,
        role: 'MEMBER',
        email: 'outra@test.local',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const msg = await runCommunityInvite(prisma, {
      slug: stamp,
      purge: true,
      email: `${stamp}-pessoa@test.local`,
    });

    expect(msg).toMatch(/1 associação, 1 vínculo/);
    expect(await prisma.groupMembership.count({ where: { groupId, userId: pessoa } })).toBe(0);
    expect(await prisma.professionalLink.count({ where: { groupId, subjectUserId: pessoa } })).toBe(
      0,
    );
    const restantes = await prisma.groupInvite.findMany({ where: { groupId } });
    expect(restantes.map((i) => i.email)).toEqual(['outra@test.local']);
    expect(await prisma.groupMembership.count({ where: { groupId, userId: dona } })).toBe(1);
  });
});
