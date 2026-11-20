import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import type { NotificationService } from '../../notifications/notification.service';
import { BillingReminderJob } from '../billing-reminder-job.service';
import type { UserSubscriptionService } from '../user-subscription.service';

/**
 * Fatura dos assentos vencida (#403, Ex-04) contra o Postgres de teste: o
 * e-mail vai só ao dono, uma vez por fatura, com o valor da fatura. O membro
 * nunca é avisado da fatura da academia: nem push, nem e-mail.
 */
describe('Ex-04: fatura de assentos vencida (banco real)', () => {
  const prisma = new PrismaService();
  const config = {
    get: (k: string, padrao?: unknown) =>
      (({ WEB_ORIGIN: 'https://app.fat.ia.br' }) as Record<string, unknown>)[k] ?? padrao,
  } as unknown as ConfigService;
  const stamp = `ex04-${Date.now()}`;
  const notify = jest.fn();
  const send = jest.fn(async (_m: { to: string; subject: string; text: string }) => true);
  const job = new BillingReminderJob(
    prisma,
    config,
    { notify } as unknown as NotificationService,
    {
      // Só conta o que é desta suíte (as outras rodam em paralelo no mesmo banco).
      send: async (m: { to: string; subject: string; text: string }) =>
        m.to.startsWith(stamp) ? send(m) : true,
    } as unknown as EmailService,
    { expireUnpaidTrials: async () => 0 } as unknown as UserSubscriptionService,
  );
  const ids: Record<'dona' | 'admin' | 'membro', string> = { dona: '', admin: '', membro: '' };
  let groupId: string;
  let invoiceId: string;

  beforeAll(async () => {
    for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
      ids[k] = (
        await prisma.user.create({
          data: { logtoSub: `${stamp}-${k}`, email: `${stamp}-${k}@test.local`, name: k },
        })
      ).id;
    }
    const g = await prisma.group.create({
      data: {
        type: 'SPONSORED',
        name: 'Academia Ex04',
        slug: stamp,
        ownerId: ids.dona,
        memberships: {
          create: [
            { userId: ids.dona, role: 'OWNER', status: 'ACTIVE' },
            { userId: ids.admin, role: 'ADMIN', status: 'ACTIVE', reportEmail: true },
            { userId: ids.membro, role: 'MEMBER', status: 'ACTIVE' },
          ],
        },
      },
    });
    groupId = g.id;
    const pool = await prisma.groupSeatPool.create({
      data: {
        groupId,
        seats: 120,
        unitPriceCents: 1490,
        status: 'PAST_DUE',
        providerRef: `${stamp}-sub`,
        currentPeriodEnd: new Date(Date.now() - 2 * 86_400_000),
        graceEndsAt: new Date(Date.now() + 5 * 86_400_000),
      },
    });
    invoiceId = (
      await prisma.groupSeatInvoice.create({
        data: {
          poolId: pool.id,
          providerPaymentId: `${stamp}-pay`,
          kind: 'SUBSCRIPTION',
          amountCents: 178_800,
          seats: 120,
          dueDate: '2026-11-10',
          status: 'OVERDUE',
          invoiceUrl: 'https://sandbox.asaas.com/i/ex04',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it('manda só ao dono, com o valor da fatura, e não repete', async () => {
    await job.notifySeatInvoicesOverdue(new Date());
    await job.notifySeatInvoicesOverdue(new Date());

    expect(send).toHaveBeenCalledTimes(1);
    const [m] = send.mock.calls[0]!;
    expect(m.to).toBe(`${stamp}-dona@test.local`);
    expect(m.text).toContain('120 assentos × R$ 14,90');
    expect(m.text).toContain('R$ 1.788,00');
    // Nenhum push: nem ao dono, nem a membro.
    expect(notify).not.toHaveBeenCalled();
    const f = await prisma.groupSeatInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(f.overdueNotifiedAt).not.toBeNull();
  });
});
