import { PrismaService } from '../../common/prisma.service';
import {
  membershipsWithEffectiveSeat,
  proPayerGroupOf,
  SubscriptionEntitlementsService,
} from '../subscription-entitlements.service';

const DIA = 86_400_000;

/**
 * Assento com começo e fim (#403): o direito é lido da janela, como a carência,
 * sem job. Antes do começo e depois do fim a atribuição não dá PRO, e nada é
 * apagado; dentro dela, o assento de programa diz de onde vem e até quando.
 */
describe('assento com janela (#403, banco real)', () => {
  const prisma = new PrismaService();
  const config = {
    get: (k: string, padrao?: unknown) => (k === 'AI_REQUIRES_PLAN' ? true : padrao),
  } as never;
  const direitos = new SubscriptionEntitlementsService(prisma, config);
  const stamp = `seat-window-${Date.now()}`;
  const users: Record<'dona' | 'antes' | 'durante' | 'depois' | 'comum', string> = {
    dona: '',
    antes: '',
    durante: '',
    depois: '',
    comum: '',
  };
  const ms: Record<string, string> = {};
  let groupId: string;
  let poolId: string;
  let programId: string;
  const fimDoPrograma = new Date(Date.now() + 10 * DIA);

  beforeAll(async () => {
    for (const k of Object.keys(users) as (keyof typeof users)[]) {
      users[k] = (
        await prisma.user.create({
          data: { logtoSub: `${stamp}-${k}`, email: `${stamp}-${k}@test.local`, name: k },
        })
      ).id;
    }
    const g = await prisma.group.create({
      data: {
        type: 'SPONSORED',
        name: 'Academia Janela',
        slug: stamp,
        ownerId: users.dona,
        memberships: {
          create: Object.entries(users).map(([k, userId]) => ({
            userId,
            role: k === 'dona' ? ('OWNER' as const) : ('MEMBER' as const),
            status: 'ACTIVE' as const,
          })),
        },
      },
      include: { memberships: true },
    });
    groupId = g.id;
    for (const m of g.memberships) ms[m.userId] = m.id;
    const pool = await prisma.groupSeatPool.create({
      data: {
        groupId,
        seats: 1,
        unitPriceCents: 1490,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 40 * DIA),
      },
    });
    poolId = pool.id;
    const program = await prisma.groupProgram.create({
      data: {
        groupId,
        poolId,
        name: 'Verão 21',
        kind: 'CLASS',
        seats: 3,
        startsAt: new Date(Date.now() - 5 * DIA),
        endsAt: fimDoPrograma,
        unitPriceCents: 1490,
        amountCents: 4470,
        chargeStatus: 'ACTIVE',
      },
    });
    programId = program.id;
    const janela = (k: 'antes' | 'durante' | 'depois') =>
      k === 'antes'
        ? { startsAt: new Date(Date.now() + 2 * DIA), endsAt: fimDoPrograma }
        : k === 'durante'
          ? { startsAt: new Date(Date.now() - 5 * DIA), endsAt: fimDoPrograma }
          : { startsAt: new Date(Date.now() - 9 * DIA), endsAt: new Date(Date.now() - DIA) };
    for (const k of ['antes', 'durante', 'depois'] as const) {
      await prisma.groupSeatAssignment.create({
        data: { poolId, programId, membershipId: ms[users[k]]!, ...janela(k) },
      });
    }
    await prisma.groupSeatAssignment.create({
      data: { poolId, membershipId: ms[users.comum]! },
    });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await prisma.$disconnect();
  });

  it('antes do começo e depois do fim é Free, sem apagar a atribuição', async () => {
    expect(await direitos.aiTierForUser(users.antes)).toMatchObject({ tier: 'FREE' });
    expect(await direitos.aiTierForUser(users.depois)).toMatchObject({ tier: 'FREE' });
    expect(await prisma.groupSeatAssignment.count({ where: { programId, revokedAt: null } })).toBe(
      3,
    );
    expect(await proPayerGroupOf(prisma, users.depois)).toBeNull();
  });

  it('dentro da janela é PRO pelo programa, com o nome e o fim do programa', async () => {
    const d = await direitos.aiTierForUser(users.durante);
    expect(d).toMatchObject({
      tier: 'PRO',
      source: 'GROUP',
      subscription: { paidBy: 'PROGRAM', programName: 'Verão 21', cancelAtPeriodEnd: true },
    });
    expect(d.subscription?.currentPeriodEnd?.getTime()).toBe(fimDoPrograma.getTime());
    expect(d.subscription?.programEndsAt?.getTime()).toBe(fimDoPrograma.getTime());
  });

  it('o painel só marca PRO para quem está dentro da janela', async () => {
    const comPro = await membershipsWithEffectiveSeat(prisma, Object.values(ms));
    expect(comPro.has(ms[users.durante]!)).toBe(true);
    expect(comPro.has(ms[users.comum]!)).toBe(true);
    expect(comPro.has(ms[users.antes]!)).toBe(false);
    expect(comPro.has(ms[users.depois]!)).toBe(false);
  });

  it('o assento comum continua sem fim, pago pelo assento', async () => {
    expect(await direitos.aiTierForUser(users.comum)).toMatchObject({
      tier: 'PRO',
      subscription: { paidBy: 'SEAT', programName: null },
    });
  });

  it('a falta de pagamento do pool também pausa o programa, depois da carência', async () => {
    await prisma.groupSeatPool.update({
      where: { id: poolId },
      data: { status: 'PAST_DUE', graceEndsAt: new Date(Date.now() - DIA) },
    });
    expect(await direitos.aiTierForUser(users.durante)).toMatchObject({ tier: 'FREE' });
    await prisma.groupSeatPool.update({
      where: { id: poolId },
      data: { status: 'ACTIVE', graceEndsAt: null },
    });
  });
});
