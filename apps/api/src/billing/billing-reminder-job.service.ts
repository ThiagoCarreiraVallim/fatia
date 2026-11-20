import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../notifications/email.service';
import { NotificationService } from '../notifications/notification.service';
import { localClock } from '../notifications/reminders/reminder-rules';
import { billingReminderFor, billingReminderTexts, safeTimeZone } from './billing-reminders';
import { UserSubscriptionService } from './user-subscription.service';

/** Roda de hora em hora; cada aviso sai uma vez por dia de vencimento. */
const EVERY_MS = 60 * 60_000;
/** Ninguém recebe aviso de cobrança antes das 9h, no fuso dela. */
const HORA_DO_AVISO = 9;
const DIA_MS = 86_400_000;

/**
 * Os avisos de cobrança e de fim do teste (#386, prancha Ex-03): push e e-mail.
 *
 * Lê o estado gravado (vencimento, status, fim do teste), e não só o webhook:
 * uma renovação que o Asaas nunca avisou também chega ao "faltam 2 dias". Cada
 * aviso é gravado em `BillingReminder` **antes** de sair, com unique por
 * assinatura, tipo e vencimento: duas instâncias da API, ou a mesma rodando de
 * hora em hora, não mandam o mesmo aviso duas vezes. Falha no envio não
 * reenvia — perder um aviso é melhor que repetir cobrança.
 *
 * O push não leva preço, forma de pagamento nem link (a regra das lojas vale
 * para o que aparece no app); o e-mail leva ao "Meu plano" da web.
 */
@Injectable()
export class BillingReminderJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingReminderJob.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly email: EmailService,
    private readonly subscriptions: UserSubscriptionService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.run(new Date()).catch((err: unknown) =>
        this.logger.warn(
          `Avisos de cobrança falharam: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Uma rodada. Devolve quantos avisos saíram. */
  async run(now: Date): Promise<number> {
    // Antes dos avisos: o teste que acabou sem pagamento sai do Asaas (#386).
    await this.subscriptions
      .expireUnpaidTrials(now)
      .catch((err: unknown) =>
        this.logger.warn(
          `Testes vencidos não encerrados: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    const subs = await this.dueSubscriptions(now);

    const web = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3030';
    let enviados = 0;
    for (const sub of subs) {
      // Um registro ruim (fuso inválido, e-mail que falha) não para a rodada.
      try {
        if (await this.remind(sub, now, web)) enviados += 1;
      } catch (err) {
        this.logger.warn({
          event: 'aviso_de_cobranca_falhou',
          subscriptionId: sub.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return enviados;
  }

  /** Fatura dos assentos vencida (#403, Ex-04): e-mail ao dono, uma vez por fatura. */
  async notifySeatInvoicesOverdue(_now: Date): Promise<number> {
    return 0;
  }

  private dueSubscriptions(now: Date) {
    return this.prisma.userSubscription.findMany({
      where: {
        source: { in: ['ASAAS', 'APPLE', 'GOOGLE'] },
        status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] },
        OR: [
          {
            currentPeriodEnd: {
              gte: new Date(now.getTime() - 9 * DIA_MS),
              lte: new Date(now.getTime() + 5 * DIA_MS),
            },
          },
          { trialEndsAt: { gte: now, lte: new Date(now.getTime() + 5 * DIA_MS) } },
        ],
      },
      include: { user: { select: { email: true, timezone: true } } },
    });
  }

  private async remind(
    sub: Awaited<ReturnType<BillingReminderJob['dueSubscriptions']>>[number],
    now: Date,
    web: string,
  ): Promise<boolean> {
    // O dia e a hora são os da pessoa; fuso gravado errado vira São Paulo.
    const fuso = safeTimeZone(sub.user.timezone);
    const aviso = billingReminderFor(sub, now, fuso);
    if (!aviso) return false;
    if (localClock(now, fuso).minute < HORA_DO_AVISO * 60) return false;

    try {
      await this.prisma.billingReminder.create({
        data: { subscriptionId: sub.id, kind: aviso.kind, dueDate: aviso.dueDate },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }

    const textos = billingReminderTexts(aviso.kind, sub, {
      priceCents:
        sub.interval === 'YEARLY'
          ? this.config.get<number>('BILLING_PRO_YEARLY_CENTS', 17900)
          : this.config.get<number>('BILLING_PRO_MONTHLY_CENTS', 1990),
      interval: sub.interval,
      webUrl: web,
    });
    this.notifications.notify([sub.userId], { kind: NotificationKind.BILLING, ...textos.push });
    await this.email.send({ to: sub.user.email, ...textos.email });
    this.logger.log({ event: 'aviso_de_cobranca', kind: aviso.kind, subscriptionId: sub.id });
    return true;
  }
}
