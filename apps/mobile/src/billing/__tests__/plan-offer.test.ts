import { describe, expect, it } from 'vitest';
import { iapEnabled, planOffer, PRO_VIA_COMMUNITY } from '../plan-offer';

const free = { tier: 'FREE' as const, source: null, requiresPlan: true };
const proWeb = { tier: 'PRO' as const, source: 'ASAAS' as const, requiresPlan: true };

describe('iapEnabled', () => {
  it('só com a flag "true" e a chave da loja no build', () => {
    expect(iapEnabled('true', 'appl_x')).toBe(true);
    expect(iapEnabled('true', undefined)).toBe(false);
    expect(iapEnabled(undefined, 'appl_x')).toBe(false);
    expect(iapEnabled('false', 'appl_x')).toBe(false);
    expect(iapEnabled('1', 'appl_x')).toBe(false);
  });
});

describe('planOffer — compra no app desligada (regras das lojas)', () => {
  it('não oferece compra, nem restaurar, nem renovação', () => {
    expect(planOffer(free, false)).toMatchObject({
      purchase: false,
      restore: false,
      renewalNote: false,
    });
  });

  it('diz que o PRO chega pela comunidade, sem preço nem web', () => {
    const { notice } = planOffer(free, false);
    expect(notice).toBe(PRO_VIA_COMMUNITY);
    expect(notice).not.toMatch(/R\$|web|navegador|site|assin/i);
  });

  it('não aponta para a web nem a quem já assinou por lá', () => {
    expect(planOffer(proWeb, false).webManageNote).toBe(false);
  });
});

describe('planOffer — compra no app ligada', () => {
  it('oferece a loja a quem está no Free', () => {
    expect(planOffer(free, true)).toEqual({
      purchase: true,
      restore: true,
      renewalNote: true,
      webManageNote: false,
      notice: null,
    });
  });

  it('a assinatura da web é gerenciada na web', () => {
    expect(planOffer(proWeb, true).webManageNote).toBe(true);
  });

  it('instância sem exigência de plano não oferece nada', () => {
    expect(planOffer({ ...free, requiresPlan: false }, true).purchase).toBe(false);
  });
});
