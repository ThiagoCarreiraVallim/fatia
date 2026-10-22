import { PrismaService } from '../../common/prisma.service';
import { SubscriptionEntitlementsService } from '../subscription-entitlements.service';
import { concederAssento, leArgumentosDoAssento } from '../grant-seat';

describe('billing:grant-seat — argumentos', () => {
  it('lê e-mail, código da comunidade, assentos e --purge', () => {
    expect(leArgumentosDoAssento(['Demo@Fatia.local', 'academia-demo', '--seats', '3'])).toEqual({
      email: 'demo@fatia.local',
      slug: 'academia-demo',
      assentos: 3,
      apagar: false,
    });
    expect(leArgumentosDoAssento(['demo@fatia.local', 'x', '--purge'])).toMatchObject({
      apagar: true,
      assentos: 1,
    });
  });

  it('recusa sem código e assentos que não são inteiro positivo', () => {
    expect(() => leArgumentosDoAssento(['demo@fatia.local'])).toThrow(/Uso/);
    expect(() => leArgumentosDoAssento(['a@b.c', 'x', '--seats', '0'])).toThrow(/inteiro/);
  });
});

/** Contra o Postgres de teste: o assento dá PRO e o --purge não deixa rastro. */
describe('billing:grant-seat (banco real)', () => {
  const prisma = new PrismaService();
  const config = {
    get: (k: string, padrao?: unknown) => (k === 'AI_REQUIRES_PLAN' ? true : padrao),
  } as never;
  const direitos = new SubscriptionEntitlementsService(prisma, config);
  const stamp = `grant-seat-${Date.now()}`;
  let dona: string;
  let membro: string;
  let groupId: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all(
      ['dona', 'membro'].map((s) =>
        prisma.user.create({
          data: { logtoSub: `${stamp}-${s}`, email: `${stamp}-${s}@test.local`, name: s },
        }),
      ),
    );
    dona = a.id;
    membro = b.id;
    const g = await prisma.group.create({
      data: {
        type: 'SPONSORED',
        name: 'Academia Teste',
        slug: stamp,
        ownerId: dona,
        memberships: {
          create: [
            { userId: dona, role: 'OWNER', status: 'ACTIVE' },
            { userId: membro, role: 'MEMBER', status: 'ACTIVE' },
          ],
        },
      },
    });
    groupId = g.id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: [dona, membro] } } });
    await prisma.$disconnect();
  });

  it('dá o PRO pela comunidade, é idempotente, e o --purge apaga pool e atribuição', async () => {
    const args = leArgumentosDoAssento([`${stamp}-membro@test.local`, stamp]);
    await concederAssento(prisma, args);
    await concederAssento(prisma, args);
    expect(await prisma.groupSeatAssignment.count({ where: { pool: { groupId } } })).toBe(1);
    expect(await direitos.aiTierForUser(membro)).toMatchObject({ tier: 'PRO', source: 'GROUP' });

    await concederAssento(prisma, { ...args, apagar: true });
    expect(await prisma.groupSeatPool.count({ where: { groupId } })).toBe(0);
    expect(await direitos.aiTierForUser(membro)).toMatchObject({ tier: 'FREE' });
  });

  it('não dá assento a quem não é membro ativo', async () => {
    await expect(
      concederAssento(prisma, leArgumentosDoAssento([`${stamp}-membro@test.local`, 'nao-existe'])),
    ).rejects.toThrow(/Nenhuma comunidade/);
    await prisma.groupMembership.update({
      where: { groupId_userId: { groupId, userId: membro } },
      data: { status: 'LEFT' },
    });
    await expect(
      concederAssento(prisma, leArgumentosDoAssento([`${stamp}-membro@test.local`, stamp])),
    ).rejects.toThrow(/não é membro ativo/);
  });
});
