import {
  billingReminderFor,
  billingReminderTexts,
  type ReminderSubscription,
} from '../billing-reminders';

/**
 * Qual aviso de cobrança sai hoje (#386, prancha Ex-03): 3 dias antes do
 * vencimento, no dia, +2 (faltam 5 da carência), +5 (faltam 2) e +7 (a IA
 * pausou); o fim do teste no dia 5; e, na loja, só "atualize na loja".
 */
const DIA = 86_400_000;
// 09:00 em São Paulo de 10/11/2026.
const HOJE = new Date('2026-11-10T12:00:00Z');
// Meia-noite de São Paulo de um dia, a forma em que o vencimento é gravado.
const sp = (ymd: string) => new Date(`${ymd}T03:00:00Z`);

function sub(p: Partial<ReminderSubscription>): ReminderSubscription {
  return {
    source: 'ASAAS',
    status: 'ACTIVE',
    paymentMethod: 'PIX',
    interval: 'MONTHLY',
    currentPeriodEnd: sp('2026-11-13'),
    graceEndsAt: null,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    ...p,
  };
}

describe('billingReminderFor', () => {
  it('web com Pix: 3 dias antes avisa que vence', () => {
    expect(billingReminderFor(sub({}), HOJE)).toEqual({ kind: 'DUE_SOON', dueDate: '2026-11-13' });
  });

  it('no dia do vencimento avisa que vence hoje', () => {
    expect(billingReminderFor(sub({ currentPeriodEnd: sp('2026-11-10') }), HOJE)).toEqual({
      kind: 'DUE_TODAY',
      dueDate: '2026-11-10',
    });
  });

  it('em atraso: +2 faltam 5, +5 faltam 2, +7 a IA pausou', () => {
    const atraso = (due: string) =>
      sub({ status: 'PAST_DUE', currentPeriodEnd: sp(due), graceEndsAt: null });
    expect(billingReminderFor(atraso('2026-11-08'), HOJE)?.kind).toBe('GRACE_5_LEFT');
    expect(billingReminderFor(atraso('2026-11-05'), HOJE)?.kind).toBe('GRACE_2_LEFT');
    expect(billingReminderFor(atraso('2026-11-03'), HOJE)).toEqual({
      kind: 'AI_PAUSED',
      dueDate: '2026-11-03',
    });
  });

  it('webhook atrasado (ACTIVE com o período vencido) também conta como atraso', () => {
    expect(billingReminderFor(sub({ currentPeriodEnd: sp('2026-11-08') }), HOJE)?.kind).toBe(
      'GRACE_5_LEFT',
    );
  });

  it('dias sem aviso não mandam nada', () => {
    for (const due of ['2026-11-14', '2026-11-12', '2026-11-11', '2026-11-09', '2026-11-04']) {
      expect(billingReminderFor(sub({ currentPeriodEnd: sp(due) }), HOJE)).toBeNull();
    }
  });

  it('cartão não recebe o "vence em 3 dias" nem o "vence hoje": a cobrança é automática', () => {
    expect(billingReminderFor(sub({ paymentMethod: 'CREDIT_CARD' }), HOJE)).toBeNull();
    expect(
      billingReminderFor(
        sub({ paymentMethod: 'CREDIT_CARD', currentPeriodEnd: sp('2026-11-10') }),
        HOJE,
      ),
    ).toBeNull();
    expect(
      billingReminderFor(
        sub({
          paymentMethod: 'CREDIT_CARD',
          status: 'PAST_DUE',
          currentPeriodEnd: sp('2026-11-08'),
        }),
        HOJE,
      )?.kind,
    ).toBe('GRACE_5_LEFT');
  });

  it('cancelada até o fim do período não recebe cobrança', () => {
    expect(billingReminderFor(sub({ cancelAtPeriodEnd: true }), HOJE)).toBeNull();
  });

  it('assinatura da loja nunca recebe lembrete de cobrança do Fatia', () => {
    for (const source of ['APPLE', 'GOOGLE'] as const) {
      expect(billingReminderFor(sub({ source }), HOJE)).toBeNull();
      expect(
        billingReminderFor(sub({ source, currentPeriodEnd: sp('2026-11-08') }), HOJE),
      ).toBeNull();
    }
  });

  it('loja com problema de cobrança: só o "atualize na loja", uma vez por vencimento', () => {
    expect(
      billingReminderFor(
        sub({
          source: 'APPLE',
          status: 'PAST_DUE',
          paymentMethod: null,
          currentPeriodEnd: sp('2026-11-08'),
          graceEndsAt: new Date(HOJE.getTime() + 6 * DIA),
        }),
        HOJE,
      ),
    ).toEqual({ kind: 'STORE_BILLING_ISSUE', dueDate: '2026-11-08' });
  });

  it('cortesia nunca recebe aviso', () => {
    expect(billingReminderFor(sub({ source: 'MANUAL', paymentMethod: null }), HOJE)).toBeNull();
  });

  it('teste: no dia 5 (faltam 2) avisa que acaba, na web e na loja', () => {
    const teste = (source: 'ASAAS' | 'APPLE') =>
      sub({
        source,
        status: 'TRIALING',
        trialEndsAt: new Date('2026-11-12T15:00:00Z'),
        currentPeriodEnd: new Date('2026-11-12T15:00:00Z'),
      });
    expect(billingReminderFor(teste('ASAAS'), HOJE)).toEqual({
      kind: 'TRIAL_ENDING',
      dueDate: '2026-11-12',
    });
    expect(billingReminderFor(teste('APPLE'), HOJE)?.kind).toBe('TRIAL_ENDING');
  });

  it('teste cancelado não recebe o aviso de fim', () => {
    expect(
      billingReminderFor(
        sub({
          status: 'TRIALING',
          trialEndsAt: new Date('2026-11-12T15:00:00Z'),
          cancelAtPeriodEnd: true,
        }),
        HOJE,
      ),
    ).toBeNull();
  });
});

describe('billingReminderTexts', () => {
  const ctx = { priceCents: 17900, interval: 'YEARLY' as const, webUrl: 'https://app.fat.ia.br' };

  it('o push nunca leva link nem manda pagar com Pix: o app não vende fora da loja', () => {
    for (const kind of [
      'TRIAL_ENDING',
      'DUE_SOON',
      'DUE_TODAY',
      'GRACE_5_LEFT',
      'GRACE_2_LEFT',
      'AI_PAUSED',
      'STORE_BILLING_ISSUE',
    ] as const) {
      const t = billingReminderTexts(
        kind,
        sub({ trialEndsAt: sp('2026-11-12'), currentPeriodEnd: sp('2026-11-13') }),
        ctx,
      );
      expect(`${t.push.title} ${t.push.body}`).not.toMatch(/pix|boleto|https?:|R\$/i);
      expect(t.push.url).toBe('/plan');
    }
  });

  it('o e-mail da web leva ao "Meu plano" da web e lembra da loja', () => {
    const t = billingReminderTexts(
      'GRACE_2_LEFT',
      sub({ currentPeriodEnd: sp('2026-11-05') }),
      ctx,
    );
    expect(t.email.subject).toMatch(/2 dias/);
    expect(t.email.html).toContain('https://app.fat.ia.br/plan');
    expect(t.email.text).toMatch(/App Store ou no Google Play/);
  });

  it('o e-mail da loja manda atualizar na loja, sem link de pagamento do Fatia', () => {
    const t = billingReminderTexts(
      'STORE_BILLING_ISSUE',
      sub({ source: 'GOOGLE', status: 'PAST_DUE', paymentMethod: null }),
      ctx,
    );
    expect(t.email.text).toMatch(/Google Play/);
    expect(t.email.html).not.toContain('/plan');
  });
});
