import { fimDoPeriodo, subscriptionEventChange } from '../user-subscription.service';

const ativa = (fim: string) => ({
  status: 'ACTIVE' as const,
  interval: 'MONTHLY' as const,
  currentPeriodEnd: new Date(fim),
});

describe('fimDoPeriodo', () => {
  it('mensal soma um mês; dia 31 cai no último dia do mês seguinte', () => {
    expect(fimDoPeriodo('2026-10-15', 'MONTHLY').toISOString()).toBe('2026-11-15T03:00:00.000Z');
    expect(fimDoPeriodo('2026-01-31', 'MONTHLY').toISOString()).toBe('2026-02-28T03:00:00.000Z');
    expect(fimDoPeriodo('2026-12-10', 'MONTHLY').toISOString()).toBe('2027-01-10T03:00:00.000Z');
  });

  it('anual soma doze meses', () => {
    expect(fimDoPeriodo('2026-10-15', 'YEARLY').toISOString()).toBe('2027-10-15T03:00:00.000Z');
  });
});

describe('subscriptionEventChange', () => {
  it('confirmação nunca recua o fim do período', () => {
    expect(
      subscriptionEventChange(ativa('2026-12-15T03:00:00Z'), 'PAYMENT_CONFIRMED', '2026-10-15'),
    ).toBeNull();
    expect(
      subscriptionEventChange(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_CONFIRMED', '2026-11-15'),
    ).toMatchObject({ status: 'ACTIVE', currentPeriodEnd: new Date('2026-12-15T03:00:00Z') });
  });

  it('atraso põe em carência de 7 dias a partir do vencimento', () => {
    expect(
      subscriptionEventChange(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_OVERDUE', '2026-11-15'),
    ).toEqual({ status: 'PAST_DUE', graceEndsAt: new Date('2026-11-22T03:00:00Z') });
  });

  it('o primeiro pagamento não feito não é atraso: o checkout continua pendente', () => {
    expect(
      subscriptionEventChange(
        { status: 'PENDING', interval: 'MONTHLY', currentPeriodEnd: null },
        'PAYMENT_OVERDUE',
        '2026-10-15',
      ),
    ).toBeNull();
  });

  it('estorno e chargeback encerram na hora', () => {
    expect(
      subscriptionEventChange(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_REFUNDED', null),
    ).toMatchObject({
      status: 'EXPIRED',
    });
  });

  it('assinatura excluída: pendente fecha; paga vale até o fim do período', () => {
    expect(
      subscriptionEventChange(
        { status: 'PENDING', interval: 'MONTHLY', currentPeriodEnd: null },
        'SUBSCRIPTION_DELETED',
        null,
      ),
    ).toMatchObject({ status: 'CANCELED' });
    expect(
      subscriptionEventChange(ativa('2026-11-15T03:00:00Z'), 'SUBSCRIPTION_DELETED', null),
    ).toMatchObject({ cancelAtPeriodEnd: true });
  });

  it('evento que não conhecemos não muda nada', () => {
    expect(
      subscriptionEventChange(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_CREATED', '2026-11-15'),
    ).toBeNull();
  });
});

describe('subscriptionEventChange — teste e link da cobrança em aberto (#386)', () => {
  const teste = {
    status: 'TRIALING' as const,
    interval: 'YEARLY' as const,
    currentPeriodEnd: new Date('2026-11-23T03:00:00Z'),
  };

  it('o primeiro pagamento no fim do teste vira ACTIVE pelo período inteiro', () => {
    expect(subscriptionEventChange(teste, 'PAYMENT_RECEIVED', '2026-11-23')).toMatchObject({
      status: 'ACTIVE',
      paymentUrl: null,
      currentPeriodEnd: new Date('2027-11-23T03:00:00Z'),
    });
  });

  it('teste não pago não entra em carência: o atraso do primeiro pagamento é ignorado', () => {
    expect(subscriptionEventChange(teste, 'PAYMENT_OVERDUE', '2026-11-23')).toBeNull();
  });

  it('a cobrança da renovação criada guarda o link para "Abrir página de pagamento"', () => {
    expect(
      subscriptionEventChange(
        ativa('2026-11-15T03:00:00Z'),
        'PAYMENT_CREATED',
        '2026-11-15',
        'https://www.asaas.com/i/pay_2',
      ),
    ).toEqual({ paymentUrl: 'https://www.asaas.com/i/pay_2' });
  });

  it('o atraso também guarda o link da cobrança vencida', () => {
    expect(
      subscriptionEventChange(
        ativa('2026-11-15T03:00:00Z'),
        'PAYMENT_OVERDUE',
        '2026-11-15',
        'https://www.asaas.com/i/pay_2',
      ),
    ).toMatchObject({ status: 'PAST_DUE', paymentUrl: 'https://www.asaas.com/i/pay_2' });
  });

  it('cobrança criada de um período já pago, ou sem link, não muda nada', () => {
    expect(
      subscriptionEventChange(
        ativa('2026-12-15T03:00:00Z'),
        'PAYMENT_CREATED',
        '2026-10-15',
        'https://x/i',
      ),
    ).toBeNull();
    expect(
      subscriptionEventChange(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_CREATED', '2026-11-15', null),
    ).toBeNull();
  });
});
