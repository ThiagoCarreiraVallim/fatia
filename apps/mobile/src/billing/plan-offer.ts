import type { MyPlan } from '@fatia/api-client';

/**
 * O que a tela "Meu plano" oferece, com a compra dentro do app ligada ou não.
 *
 * A compra pela loja (RevenueCat) é desligável por build: `EXPO_PUBLIC_IAP_ENABLED`
 * precisa ser `'true'`, **e** a chave da loja precisa estar no build. O piloto
 * vai às lojas sem vender nada no app — a IA chega pelo assento da comunidade ou
 * pela cortesia —, e as regras das lojas proíbem, num app sem compra pela loja,
 * oferecer o PRO ou apontar para comprá-lo fora. A web (Asaas) continua vendendo.
 *
 * Sem dependência de React Native, para ser testável no Vitest.
 */
export function iapEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_IAP_ENABLED,
  storeKey: string | undefined = undefined,
): boolean {
  return flag === 'true' && Boolean(storeKey);
}

export interface PlanOffer {
  /** Os pacotes da loja e o botão de assinar. */
  purchase: boolean;
  /** "Restaurar compras". */
  restore: boolean;
  /** "A assinatura renova sozinha e pode ser cancelada na loja". */
  renewalNote: boolean;
  /** "Assinatura feita pela web — gerencie pelo navegador". */
  webManageNote: boolean;
  /** O que dizer a quem está no Free quando o app não vende. */
  notice: string | null;
}

export const PRO_VIA_COMMUNITY =
  'No app, o PRO chega pela sua comunidade: quando a academia ou o profissional der um ' +
  'assento a você, a IA do Fatia é liberada aqui. O registro manual continua livre.';

export function planOffer(
  plan: Pick<MyPlan, 'tier' | 'source' | 'requiresPlan'>,
  iap: boolean,
): PlanOffer {
  const free = plan.tier === 'FREE' && plan.requiresPlan;
  if (iap) {
    return {
      purchase: free,
      restore: free,
      renewalNote: free,
      webManageNote: plan.tier === 'PRO' && plan.source === 'ASAAS',
      notice: null,
    };
  }
  return {
    purchase: false,
    restore: false,
    renewalNote: false,
    // Sem compra no app, nada que mande comprar ou gerenciar compra fora dele.
    webManageNote: false,
    notice: free ? PRO_VIA_COMMUNITY : null,
  };
}
