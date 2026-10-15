import { assinaturaDoAssinante, intervaloDoProduto } from '../revenuecat/revenuecat';

const AGORA = new Date('2026-10-15T12:00:00Z');
const U = 'user-1';

const assinante = (sub: Record<string, unknown>, ent: Record<string, unknown> = {}) => ({
  entitlements: {
    pro: { expires_date: '2026-11-15T12:00:00Z', product_identifier: 'fatia_pro_mensal', ...ent },
  },
  subscriptions: {
    fatia_pro_mensal: { expires_date: '2026-11-15T12:00:00Z', store: 'app_store', ...sub },
  },
});

describe('assinaturaDoAssinante', () => {
  it('compra na App Store vira APPLE ativa, mensal, até a expiração', () => {
    expect(assinaturaDoAssinante(assinante({}), U, 'pro', AGORA)).toEqual({
      source: 'APPLE',
      providerRef: 'user-1:fatia_pro_mensal',
      productId: 'fatia_pro_mensal',
      interval: 'MONTHLY',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-11-15T12:00:00Z'),
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
    });
  });

  it('Google Play vira GOOGLE; cancelamento detectado vale até o fim', () => {
    expect(
      assinaturaDoAssinante(
        assinante({ store: 'play_store', unsubscribe_detected_at: '2026-10-14T00:00:00Z' }),
        U,
        'pro',
        AGORA,
      ),
    ).toMatchObject({ source: 'GOOGLE', status: 'ACTIVE', cancelAtPeriodEnd: true });
  });

  it('problema de cobrança depois do vencimento é carência da loja', () => {
    expect(
      assinaturaDoAssinante(
        assinante(
          {
            expires_date: '2026-10-14T00:00:00Z',
            billing_issues_detected_at: '2026-10-14T00:00:00Z',
          },
          {
            expires_date: '2026-10-14T00:00:00Z',
            grace_period_expires_date: '2026-10-20T00:00:00Z',
          },
        ),
        U,
        'pro',
        AGORA,
      ),
    ).toMatchObject({ status: 'PAST_DUE', graceEndsAt: new Date('2026-10-20T00:00:00Z') });
  });

  it('vencida sem carência expira; estorno expira na hora', () => {
    expect(
      assinaturaDoAssinante(
        assinante(
          { expires_date: '2026-10-01T00:00:00Z' },
          { expires_date: '2026-10-01T00:00:00Z' },
        ),
        U,
        'pro',
        AGORA,
      )?.status,
    ).toBe('EXPIRED');
    expect(
      assinaturaDoAssinante(assinante({ refunded_at: '2026-10-10T00:00:00Z' }), U, 'pro', AGORA)
        ?.status,
    ).toBe('EXPIRED');
  });

  it('sem o entitlement, ou fora das lojas (promocional), não há assinatura', () => {
    expect(assinaturaDoAssinante({ entitlements: {} }, U, 'pro', AGORA)).toBeNull();
    expect(assinaturaDoAssinante(assinante({ store: 'promotional' }), U, 'pro', AGORA)).toBeNull();
  });

  it('o intervalo sai do id do produto', () => {
    expect(intervaloDoProduto('fatia_pro_anual')).toBe('YEARLY');
    expect(intervaloDoProduto('fatia.pro.yearly')).toBe('YEARLY');
    expect(intervaloDoProduto('fatia_pro_mensal')).toBe('MONTHLY');
  });
});
