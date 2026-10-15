import { fimDoPeriodo, mudancaDoEvento } from '../user-subscription.service';

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

describe('mudancaDoEvento', () => {
  it('confirmação nunca recua o fim do período', () => {
    expect(
      mudancaDoEvento(ativa('2026-12-15T03:00:00Z'), 'PAYMENT_CONFIRMED', '2026-10-15'),
    ).toBeNull();
    expect(
      mudancaDoEvento(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_CONFIRMED', '2026-11-15'),
    ).toMatchObject({ status: 'ACTIVE', currentPeriodEnd: new Date('2026-12-15T03:00:00Z') });
  });

  it('atraso põe em carência de 7 dias a partir do vencimento', () => {
    expect(mudancaDoEvento(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_OVERDUE', '2026-11-15')).toEqual(
      { status: 'PAST_DUE', graceEndsAt: new Date('2026-11-22T03:00:00Z') },
    );
  });

  it('o primeiro pagamento não feito não é atraso: o checkout continua pendente', () => {
    expect(
      mudancaDoEvento(
        { status: 'PENDING', interval: 'MONTHLY', currentPeriodEnd: null },
        'PAYMENT_OVERDUE',
        '2026-10-15',
      ),
    ).toBeNull();
  });

  it('estorno e chargeback encerram na hora', () => {
    expect(mudancaDoEvento(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_REFUNDED', null)).toMatchObject({
      status: 'EXPIRED',
    });
  });

  it('assinatura excluída: pendente fecha; paga vale até o fim do período', () => {
    expect(
      mudancaDoEvento(
        { status: 'PENDING', interval: 'MONTHLY', currentPeriodEnd: null },
        'SUBSCRIPTION_DELETED',
        null,
      ),
    ).toMatchObject({ status: 'CANCELED' });
    expect(
      mudancaDoEvento(ativa('2026-11-15T03:00:00Z'), 'SUBSCRIPTION_DELETED', null),
    ).toMatchObject({ cancelAtPeriodEnd: true });
  });

  it('evento que não conhecemos não muda nada', () => {
    expect(
      mudancaDoEvento(ativa('2026-11-15T03:00:00Z'), 'PAYMENT_CREATED', '2026-11-15'),
    ).toBeNull();
  });
});
