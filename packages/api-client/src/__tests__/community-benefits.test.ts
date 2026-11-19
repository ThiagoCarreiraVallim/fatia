import { describe, expect, it } from 'vitest';
import {
  benefitInitials,
  benefitValidity,
  emptyBenefitDraft,
  benefitDraftToInput,
  benefitDraftToPatch,
  benefitToDraft,
  benefitValidUntilOptions,
} from '../community-benefits';

describe('benefícios (Cm-22)', () => {
  it('a validade: "até 31 dez", ou o aviso do vencido', () => {
    expect(benefitValidity({ validUntil: '2026-12-31', expired: false })).toBe('até 31 dez');
    expect(benefitValidity({ validUntil: '2026-10-31', expired: true })).toBe('venceu');
  });

  it('as iniciais do parceiro no lugar do logo', () => {
    expect(benefitInitials('Suplementa')).toBe('SU');
    expect(benefitInitials('Fisio Movimento')).toBe('FM');
    expect(benefitInitials('Corre+ Tênis')).toBe('CT');
  });
});

describe('formulário do painel (Pn-28)', () => {
  const hoje = '2026-11-17';

  it('cupom fica como foi digitado (só o trim), sem link', () => {
    const r = benefitDraftToInput(
      {
        ...emptyBenefitDraft(hoje),
        partnerName: ' Suplementa ',
        discountText: '15% em suplementos',
        couponCode: ' demo15 ',
        url: 'https://ignorado',
        validUntil: '2026-12-31',
      },
      hoje,
    );
    expect(r).toEqual({
      ok: true,
      input: {
        partnerName: 'Suplementa',
        discountText: '15% em suplementos',
        kind: 'COUPON',
        couponCode: 'demo15',
        url: null,
        validUntil: '2026-12-31',
        logoFileId: null,
      },
    });
  });

  it('editar: a validade só vai quando muda, e vencida intocada não barra o texto', () => {
    const vencido = {
      id: 'b1',
      partnerName: 'Corre+',
      logoUrl: null,
      logoFileId: null,
      discountText: '10% em tênis',
      kind: 'COUPON' as const,
      couponCode: 'CORRE10',
      url: null,
      validUntil: '2026-10-31',
      status: 'expired' as const,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };
    const d = { ...benefitToDraft(vencido), discountText: '15% em tênis' };
    const r = benefitDraftToPatch(d, hoje, vencido);
    expect(r.ok).toBe(true);
    expect(r.ok && r.input).not.toHaveProperty('validUntil');
    expect(r.ok && r.input.discountText).toBe('15% em tênis');

    // Mudou a validade: vai, e não pode estar no passado.
    expect(benefitDraftToPatch({ ...d, validUntil: '2026-12-31' }, hoje, vencido)).toMatchObject({
      ok: true,
      input: { validUntil: '2026-12-31' },
    });
    expect(benefitDraftToPatch({ ...d, validUntil: '2026-11-01' }, hoje, vencido)).toEqual({
      ok: false,
      errors: { validUntil: 'A validade não pode estar no passado' },
    });
  });

  it('diz o que falta: parceiro, desconto, código, link https e data', () => {
    expect(benefitDraftToInput({ ...emptyBenefitDraft(hoje) }, hoje)).toEqual({
      ok: false,
      errors: {
        partnerName: 'Diga o parceiro',
        discountText: 'Diga o desconto',
        couponCode: 'Digite o código do cupom',
      },
    });
    const link = benefitDraftToInput(
      {
        ...emptyBenefitDraft(hoje),
        partnerName: 'P',
        discountText: 'd',
        kind: 'LINK',
        url: 'http://x.com',
        validUntil: '2026-11-16',
      },
      hoje,
    );
    expect(link).toEqual({
      ok: false,
      errors: {
        url: 'O link precisa começar com https://',
        validUntil: 'A validade não pode estar no passado',
      },
    });
  });
});

describe('validade em escolhas prontas (app)', () => {
  it('fim do mês que vem, de 3, 6 e 12 meses; o último dia certo de cada mês', () => {
    expect(benefitValidUntilOptions('2026-11-17')).toEqual([
      { value: '2026-12-31', label: 'até 31 dez' },
      { value: '2027-02-28', label: 'até 28 fev' },
      { value: '2027-05-31', label: 'até 31 mai' },
      { value: '2027-11-30', label: 'até 30 nov' },
    ]);
  });

  it('em janeiro, fevereiro bissexto', () => {
    expect(benefitValidUntilOptions('2028-01-10')[0]).toEqual({
      value: '2028-02-29',
      label: 'até 29 fev',
    });
  });
});
