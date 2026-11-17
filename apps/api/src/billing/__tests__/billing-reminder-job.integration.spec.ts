import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import type { NotificationService } from '../../notifications/notification.service';
import { BillingReminderJob } from '../billing-reminder-job.service';
import type { UserSubscriptionService } from '../user-subscription.service';

/**
 * O job diário dos avisos de cobrança (#386) contra o Postgres de teste: manda
 * push e e-mail uma vez por aviso, nunca para a assinatura da loja, e rodar de
 * novo no mesmo dia não repete.
 */
describe('BillingReminderJob (banco real)', () => {
  const prisma = new PrismaService();
  const config = {
    get: (k: string, padrao?: unknown) =>
      (({ WEB_ORIGIN: 'https://app.fat.ia.br' }) as Record<string, unknown>)[k] ?? padrao,
  } as unknown as ConfigService;
  const notify = jest.fn();
  const send = jest.fn(async () => true);
  const expireUnpaidTrials = jest.fn(async () => 0);
  const job = new BillingReminderJob(
    prisma,
    config,
    { notify } as unknown as NotificationService,
    { send } as unknown as EmailService,
    { expireUnpaidTrials } as unknown as UserSubscriptionService,
  );
  const stamp = `lembrete-${Date.now()}`;
  // 09:00 em São Paulo.
  const HOJE = new Date('2026-11-10T12:00:00Z');
  const sp = (ymd: string) => new Date(`${ymd}T03:00:00Z`);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    for (const k of ['pix', 'loja', 'cedo']) {
      const u = await prisma.user.create({
        data: {
          logtoSub: `${stamp}-${k}`,
          email: `${stamp}-${k}@test.local`,
          name: k,
          // "cedo" mora em Tóquio: lá já é noite, o horário não importa; quem
          // está antes das 9h é testado no caso próprio.
          timezone: 'America/Sao_Paulo',
        },
      });
      ids[k] = u.id;
    }
    await prisma.userSubscription.createMany({
      data: [
        {
          userId: ids.pix!,
          source: 'ASAAS',
          status: 'ACTIVE',
          interval: 'MONTHLY',
          paymentMethod: 'PIX',
          providerRef: `${stamp}-pix`,
          currentPeriodEnd: sp('2026-11-13'),
        },
        {
          userId: ids.loja!,
          source: 'APPLE',
          status: 'ACTIVE',
          interval: 'MONTHLY',
          providerRef: `${stamp}-loja`,
          currentPeriodEnd: sp('2026-11-13'),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    notify.mockClear();
    send.mockClear();
  });

  it('manda o "vence em 3 dias" por push e e-mail, e só para a web', async () => {
    await job.run(HOJE);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      [ids.pix],
      expect.objectContaining({ kind: 'BILLING', title: 'Seu PRO vence em 3 dias', url: '/plan' }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${stamp}-pix@test.local`,
        subject: 'Seu PRO vence em 3 dias',
      }),
    );
    expect(
      await prisma.billingReminder.count({ where: { subscription: { userId: ids.pix } } }),
    ).toBe(1);
    expect(
      await prisma.billingReminder.count({ where: { subscription: { userId: ids.loja } } }),
    ).toBe(0);
  });

  it('cada rodada também encerra os testes que acabaram sem pagamento', async () => {
    expireUnpaidTrials.mockClear();
    await job.run(HOJE);
    expect(expireUnpaidTrials).toHaveBeenCalledWith(HOJE);
  });

  it('rodar de novo no mesmo dia não repete', async () => {
    await job.run(new Date(HOJE.getTime() + 3 * 3_600_000));
    expect(notify).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('antes das 9h no fuso da pessoa, espera', async () => {
    await prisma.userSubscription.updateMany({
      where: { userId: ids.pix },
      data: { currentPeriodEnd: sp('2026-11-10') },
    });
    await job.run(new Date('2026-11-10T09:00:00Z')); // 06:00 em São Paulo
    expect(notify).not.toHaveBeenCalled();
    await job.run(HOJE);
    expect(notify).toHaveBeenCalledWith(
      [ids.pix],
      expect.objectContaining({ title: 'Seu PRO vence hoje' }),
    );
  });

  it('a loja com falha de cobrança recebe só o "atualize na loja", uma vez', async () => {
    await prisma.userSubscription.updateMany({
      where: { userId: ids.loja },
      data: { status: 'PAST_DUE', currentPeriodEnd: sp('2026-11-08') },
    });
    await job.run(HOJE);
    await job.run(HOJE);
    const daLoja = notify.mock.calls.filter(([quem]) => quem[0] === ids.loja);
    expect(daLoja).toHaveLength(1);
    expect(daLoja[0]![1]).toMatchObject({ title: 'A loja não conseguiu cobrar' });
  });
});
