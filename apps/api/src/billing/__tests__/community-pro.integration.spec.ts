import type { PrismaClient } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import {
  membershipsWithEffectiveSeat,
  SubscriptionEntitlementsService,
} from '../subscription-entitlements.service';
import { grantGroup, parseGrantGroupArgs } from '../grant-group';
import { dateInTz } from '../../progress/helpers/date-tz';

describe('billing:grant-group — argumentos', () => {
  it('lê o código, a data final, o programa e --revoke', () => {
    expect(
      parseGrantGroupArgs(['academia-demo', '--until', '2026-11-30', '--program', 'Verão 21']),
    ).toEqual({ slug: 'academia-demo', until: '2026-11-30', program: 'Verão 21', revoke: false });
    expect(parseGrantGroupArgs(['x', '--revoke'])).toEqual({
      slug: 'x',
      until: null,
      program: null,
      revoke: true,
    });
  });

  it('recusa sem código, data inválida e programa sem data final', () => {
    expect(() => parseGrantGroupArgs([])).toThrow(/Uso/);
    expect(() => parseGrantGroupArgs(['x', '--until', '30/11'])).toThrow(/AAAA-MM-DD/);
    expect(() => parseGrantGroupArgs(['x', '--program', 'Verão'])).toThrow(/--until/);
  });
});

/**
 * PRO pela comunidade para todos os membros ativos (#288, #386), contra o
 * Postgres de teste: quem é membro tem o PRO pago pela comunidade, sem
 * assento; quem sai perde na hora; o PRO pessoal continua sendo da pessoa.
 */
describe('PRO pela comunidade (banco real)', () => {
  const prisma = new PrismaService();
  const scriptDb = prisma as unknown as PrismaClient;
  const config = {
    get: (k: string, padrao?: unknown) => (k === 'AI_REQUIRES_PLAN' ? true : padrao),
  } as never;
  const direitos = new SubscriptionEntitlementsService(prisma, config);
  const stamp = `grant-group-${Date.now()}`;
  const ids: Record<'dona' | 'membro' | 'profissional' | 'pagante' | 'saiu', string> = {
    dona: '',
    membro: '',
    profissional: '',
    pagante: '',
    saiu: '',
  };
  const memberships: Record<string, string> = {};
  let groupId: string;

  beforeAll(async () => {
    for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
      const u = await prisma.user.create({
        data: { logtoSub: `${stamp}-${k}`, email: `${stamp}-${k}@test.local`, name: k },
      });
      ids[k] = u.id;
    }
    const g = await prisma.group.create({
      data: {
        type: 'SPONSORED',
        name: 'Academia Demo',
        slug: stamp,
        ownerId: ids.dona,
        memberships: {
          create: [
            { userId: ids.dona, role: 'OWNER', status: 'ACTIVE' },
            { userId: ids.membro, role: 'MEMBER', status: 'ACTIVE' },
            { userId: ids.profissional, role: 'PROFESSIONAL', status: 'ACTIVE' },
            { userId: ids.pagante, role: 'MEMBER', status: 'ACTIVE' },
            { userId: ids.saiu, role: 'MEMBER', status: 'ACTIVE' },
          ],
        },
      },
      include: { memberships: true },
    });
    groupId = g.id;
    for (const m of g.memberships) memberships[m.userId] = m.id;
    await prisma.userSubscription.create({
      data: {
        userId: ids.pagante,
        source: 'ASAAS',
        status: 'ACTIVE',
        interval: 'YEARLY',
        currentPeriodEnd: new Date(Date.now() + 200 * 86_400_000),
        providerRef: `${stamp}-sub`,
      },
    });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it('antes do contrato, membro é Free', async () => {
    expect(await direitos.aiTierForUser(ids.membro)).toMatchObject({ tier: 'FREE' });
  });

  it('ALL_MEMBERS: todo membro ativo tem PRO pago pela comunidade, sem assento', async () => {
    await grantGroup(scriptDb, parseGrantGroupArgs([stamp]));
    await grantGroup(scriptDb, parseGrantGroupArgs([stamp])); // idempotente
    expect(await prisma.groupSeatPool.count({ where: { groupId } })).toBe(1);
    expect(await prisma.groupSeatAssignment.count({ where: { pool: { groupId } } })).toBe(0);

    expect(await direitos.aiTierForUser(ids.membro)).toMatchObject({
      tier: 'PRO',
      source: 'GROUP',
      subscription: { paidBy: 'COMMUNITY', group: { name: 'Academia Demo' } },
    });
    // A equipe não é aluna: o modo é para os membros.
    expect(await direitos.aiTierForUser(ids.profissional)).toMatchObject({ tier: 'FREE' });
    // Quem paga o próprio PRO continua com o dele (ADR 025).
    expect(await direitos.aiTierForUser(ids.pagante)).toMatchObject({ source: 'ASAAS' });
  });

  it('o painel vê que o membro tem PRO pela comunidade (hasAiSeat), e só isso', async () => {
    const comPro = await membershipsWithEffectiveSeat(prisma, Object.values(memberships));
    expect(comPro.has(memberships[ids.membro]!)).toBe(true);
    expect(comPro.has(memberships[ids.profissional]!)).toBe(false);
    expect(comPro.has(memberships[ids.dona]!)).toBe(false);
  });

  it('quem sai da comunidade perde o PRO na hora', async () => {
    await prisma.groupMembership.update({
      where: { id: memberships[ids.saiu] },
      data: { status: 'LEFT', leftAt: new Date() },
    });
    expect(await direitos.aiTierForUser(ids.saiu)).toMatchObject({ tier: 'FREE' });
    const comPro = await membershipsWithEffectiveSeat(prisma, [memberships[ids.saiu]!]);
    expect(comPro.size).toBe(0);
  });

  it('inadimplência segue a carência: dentro dela é PRO, depois Free', async () => {
    await prisma.groupSeatPool.update({
      where: { groupId },
      data: { status: 'PAST_DUE', graceEndsAt: new Date(Date.now() + 2 * 86_400_000) },
    });
    expect(await direitos.aiTierForUser(ids.membro)).toMatchObject({
      tier: 'PRO',
      motivo: 'carencia',
    });
    await prisma.groupSeatPool.update({
      where: { groupId },
      data: { graceEndsAt: new Date(Date.now() - 86_400_000) },
    });
    expect(await direitos.aiTierForUser(ids.membro)).toMatchObject({ tier: 'FREE' });
  });

  it('programa com data final: PRO até a data, com o nome do programa', async () => {
    const fim = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    await grantGroup(
      scriptDb,
      parseGrantGroupArgs([stamp, '--until', fim, '--program', 'Verão 21']),
    );
    const d = await direitos.aiTierForUser(ids.membro);
    expect(d).toMatchObject({
      tier: 'PRO',
      subscription: { paidBy: 'PROGRAM', programName: 'Verão 21' },
    });
    expect(d.subscription?.currentPeriodEnd?.getTime()).toBeGreaterThan(Date.now());
    // O último dia é o próprio --until, no fuso de São Paulo (não o dia seguinte).
    expect(dateInTz(d.subscription!.currentPeriodEnd!, 'America/Sao_Paulo')).toBe(fim);
  });

  it('--revoke encerra o PRO de todos os membros', async () => {
    await grantGroup(scriptDb, parseGrantGroupArgs([stamp, '--revoke']));
    expect(await direitos.aiTierForUser(ids.membro)).toMatchObject({ tier: 'FREE' });
  });

  it('não mexe em comunidade com assentos pagos', async () => {
    await prisma.groupSeatPool.update({
      where: { groupId },
      data: { providerRef: `${stamp}-pago`, status: 'ACTIVE', mode: 'SEATS' },
    });
    await expect(grantGroup(scriptDb, parseGrantGroupArgs([stamp]))).rejects.toThrow(/pagos/);
  });
});
