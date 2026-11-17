import { describe, expect, it } from 'vitest';
import {
  iapEnabled,
  PRO_VIA_COMMUNITY,
  storeOption,
  storeTrialDays,
  type StorePackageLike,
} from '../plan-offer';

describe('iapEnabled', () => {
  it('só com a flag "true" e a chave da loja no build', () => {
    expect(iapEnabled('true', 'appl_x')).toBe(true);
    expect(iapEnabled('true', undefined)).toBe(false);
    expect(iapEnabled(undefined, 'appl_x')).toBe(false);
    expect(iapEnabled('false', 'appl_x')).toBe(false);
    expect(iapEnabled('1', 'appl_x')).toBe(false);
  });
});

describe('PRO_VIA_COMMUNITY (Al-M2 sem compra no app)', () => {
  it('diz que o PRO chega pela comunidade, sem preço nem web', () => {
    expect(PRO_VIA_COMMUNITY).toBe(
      'Neste app, o PRO é liberado pela academia ou pelo profissional que você acompanha. Peça o código à equipe.',
    );
    expect(PRO_VIA_COMMUNITY).not.toMatch(/R\$|web|navegador|site|assin|pix|boleto/i);
  });
});

const pacote = (
  p: Partial<StorePackageLike['product']> & { packageType?: string },
): StorePackageLike => ({
  identifier: '$rc_annual',
  packageType: p.packageType ?? 'ANNUAL',
  product: { priceString: 'R$ 179,90', introPrice: null, ...p },
});

describe('storeTrialDays: o teste é o que a loja oferece, não o que o Fatia supõe', () => {
  it('oferta introdutória grátis de 1 semana = 7 dias', () => {
    expect(
      storeTrialDays(
        pacote({ introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 } }),
      ),
    ).toBe(7);
  });

  it('7 dias declarados em dias', () => {
    expect(
      storeTrialDays(
        pacote({ introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 } }),
      ),
    ).toBe(7);
  });

  it('preço introdutório pago não é teste grátis', () => {
    expect(
      storeTrialDays(
        pacote({
          introPrice: { price: 9.9, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 },
        }),
      ),
    ).toBe(0);
  });

  it('sem oferta, sem teste', () => {
    expect(storeTrialDays(pacote({}))).toBe(0);
  });
});

describe('storeOption: o cartão do plano com o preço da loja', () => {
  it('anual e mensal com o preço que a loja mostra', () => {
    expect(storeOption(pacote({}))).toEqual({
      interval: 'YEARLY',
      title: 'Anual',
      price: 'R$ 179,90',
      per: 'por ano',
    });
    expect(storeOption(pacote({ packageType: 'MONTHLY', priceString: 'R$ 19,90' }))).toEqual({
      interval: 'MONTHLY',
      title: 'Mensal',
      price: 'R$ 19,90',
      per: 'sem fidelidade',
    });
  });

  it('pacote que não é mensal nem anual fica de fora', () => {
    expect(storeOption(pacote({ packageType: 'LIFETIME' }))).toBeNull();
  });
});
