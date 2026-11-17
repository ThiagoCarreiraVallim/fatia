import type { BillingInterval } from '@fatia/api-client';

/**
 * A oferta do PRO no app (#386, pranchas Al-M2 e Al-M3).
 *
 * A compra pela loja (RevenueCat) é desligável por build: `EXPO_PUBLIC_IAP_ENABLED`
 * precisa ser `'true'`, **e** a chave da loja precisa estar no build. O piloto
 * vai às lojas sem vender nada no app — a IA chega pelo assento da comunidade ou
 * pela cortesia —, e as regras das lojas proíbem, num app sem compra pela loja,
 * oferecer o PRO ou apontar para comprá-lo fora. O que a tela mostra em cada
 * estado sai de `planStatusView` (api-client), com `surface: 'app'`.
 *
 * Sem dependência de React Native, para ser testável no Vitest.
 */
export function iapEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_IAP_ENABLED,
  storeKey: string | undefined = undefined,
): boolean {
  return flag === 'true' && Boolean(storeKey);
}

/** Al-M2 sem compra no app: sem preço, sem web, sem "assinar". */
export const PRO_VIA_COMMUNITY =
  'Neste app, o PRO é liberado pela academia ou pelo profissional que você acompanha. ' +
  'Peça o código à equipe.';

/** O pedaço de `PurchasesPackage` (react-native-purchases) que a tela lê. */
export interface StorePackageLike {
  identifier: string;
  packageType: string;
  product: {
    priceString: string;
    introPrice: {
      price: number;
      periodUnit: string;
      periodNumberOfUnits: number;
      cycles: number;
    } | null;
  };
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/**
 * Dias de teste grátis que a **loja** oferece neste pacote. O botão só diz
 * "Começar 7 dias grátis" quando a loja tem a oferta: quem decide a
 * elegibilidade e cobra é ela, e prometer um teste que a folha da loja não
 * mostra seria enganar.
 */
export function storeTrialDays(pkg: StorePackageLike): number {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return 0;
  return (UNIT_DAYS[intro.periodUnit] ?? 0) * intro.periodNumberOfUnits * Math.max(1, intro.cycles);
}

export interface StoreOption {
  interval: BillingInterval;
  title: string;
  /** O preço como a loja formata, na moeda da conta da loja. */
  price: string;
  per: string;
}

export function storeOption(pkg: StorePackageLike): StoreOption | null {
  if (pkg.packageType === 'ANNUAL') {
    return { interval: 'YEARLY', title: 'Anual', price: pkg.product.priceString, per: 'por ano' };
  }
  if (pkg.packageType === 'MONTHLY') {
    return {
      interval: 'MONTHLY',
      title: 'Mensal',
      price: pkg.product.priceString,
      per: 'sem fidelidade',
    };
  }
  return null;
}
