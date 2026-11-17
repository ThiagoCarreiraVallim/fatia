import { describe, expect, it } from 'vitest';
import {
  benefitInitials,
  benefitValidity,
  emptyBenefitDraft,
  benefitDraftToInput,
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

  it('cupom vira maiúsculo, sem link', () => {
    const r = benefitDraftToInput(
      {
        ...emptyBenefitDraft(hoje),
        partnerName: ' Suplementa ',
        discountText: '15% em suplementos',
        couponCode: 'demo15',
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
        couponCode: 'DEMO15',
        url: null,
        validUntil: '2026-12-31',
        logoFileId: null,
      },
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
