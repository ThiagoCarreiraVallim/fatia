import { seatInvoiceOverdueEmail } from '../seat-invoice-email';

/**
 * E-mail Ex-04 (#403): fatura dos assentos vencida, só para o dono. Preço e
 * total vêm da fatura real, nunca do template (a prancha tinha R$ 9,90 fixo).
 */
describe('seatInvoiceOverdueEmail (Ex-04)', () => {
  const base = {
    groupName: 'Academia Demo',
    kind: 'SUBSCRIPTION' as const,
    seats: 120,
    unitPriceCents: 1490,
    amountCents: 178_800,
    dueDate: '2026-11-10',
    graceDaysLeft: 7,
    payUrl: 'https://sandbox.asaas.com/i/abc',
    panelUrl: 'https://fat.ia.br/org/g1/seats',
  };

  it('mostra assentos × preço = total da fatura, o mês e o vencimento', () => {
    const e = seatInvoiceOverdueEmail(base);
    expect(e.subject).toBe('Fatura vencida: assentos de novembro da Academia Demo');
    for (const parte of [e.text, e.html]) {
      expect(parte).toContain('120 assentos × R$ 14,90');
      expect(parte).toContain('R$ 1.788,00');
      expect(parte).toContain('10 nov');
      expect(parte).not.toContain('9,90');
    }
    expect(e.html).toContain('FATURA VENCIDA');
    expect(e.html).toContain('href="https://sandbox.asaas.com/i/abc"');
  });

  it('diz que só a IA pausa, com os dias que faltam da carência', () => {
    const e = seatInvoiceOverdueEmail({ ...base, graceDaysLeft: 3 });
    expect(e.text).toContain('Os membros seguem com PRO por mais 3 dias');
    expect(e.text).toMatch(/só a IA pausa/);
    expect(e.text).toMatch(/nada é apagado/i);
  });

  it('sem a conta exata dos assentos, mostra só o valor; sem link do Asaas, leva ao painel', () => {
    const e = seatInvoiceOverdueEmail({
      ...base,
      kind: 'ADJUSTMENT',
      seats: 10,
      amountCents: 7450,
      payUrl: null,
    });
    expect(e.subject).toBe('Fatura vencida: ajuste de assentos da Academia Demo');
    expect(e.text).toContain('Valor');
    expect(e.text).toContain('R$ 74,50');
    expect(e.text).not.toContain('×');
    expect(e.html).toContain('href="https://fat.ia.br/org/g1/seats"');
  });

  it('escapa o nome da comunidade no HTML', () => {
    const e = seatInvoiceOverdueEmail({ ...base, groupName: '<b>Gym</b>' });
    expect(e.html).not.toContain('<b>Gym</b>');
  });
});
