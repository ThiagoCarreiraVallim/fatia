import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { iapEnabled } from './plan-offer';

/**
 * Compra do PRO dentro do app, pela RevenueCat (ADR 024).
 *
 * A RevenueCat é a ponte para a App Store e o Google Play; quem decide o plano
 * é a API (`/billing/plan`), que lê o assinante na RevenueCat. Por isso o
 * login aqui usa o **id do usuário do Fatia**: é assim que o webhook e o
 * `sync` sabem de quem é a compra.
 *
 * A compra só existe com `EXPO_PUBLIC_IAP_ENABLED=true` **e** a chave da loja no
 * build (`EXPO_PUBLIC_REVENUECAT_*`). Desligada, a RevenueCat nem é configurada,
 * e a tela não vende o PRO (ver `plan-offer.ts`).
 */

const CHAVE =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : Platform.OS === 'android'
      ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
      : undefined;

let usuarioConfigurado: string | null = null;

export function inAppPurchaseAvailable(): boolean {
  return iapEnabled(process.env.EXPO_PUBLIC_IAP_ENABLED, CHAVE);
}

/** Liga a RevenueCat à conta do Fatia. Idempotente. */
export async function storeLogIn(userId: string): Promise<void> {
  if (!inAppPurchaseAvailable() || !CHAVE || usuarioConfigurado === userId) return;
  if (usuarioConfigurado === null) {
    Purchases.configure({ apiKey: CHAVE, appUserID: userId });
  } else {
    await Purchases.logIn(userId);
  }
  usuarioConfigurado = userId;
}

/** Ao sair da conta: a próxima pessoa no aparelho não herda a compra. */
export async function sairDaLoja(): Promise<void> {
  if (usuarioConfigurado === null) return;
  usuarioConfigurado = null;
  await Purchases.logOut().catch(() => undefined);
}

/** Os pacotes da oferta atual (mensal e anual), com o preço da loja. */
export async function pacotesDoPro(): Promise<PurchasesPackage[]> {
  const ofertas = await Purchases.getOfferings();
  return ofertas.current?.availablePackages ?? [];
}

/** `true` = comprou; `false` = a pessoa desistiu na tela da loja. */
export async function comprar(pacote: PurchasesPackage): Promise<boolean> {
  try {
    await Purchases.purchasePackage(pacote);
    return true;
  } catch (erro) {
    if ((erro as { userCancelled?: boolean }).userCancelled) return false;
    throw erro;
  }
}

export async function restaurarCompras(): Promise<void> {
  await Purchases.restorePurchases();
}

export type { PurchasesPackage };
