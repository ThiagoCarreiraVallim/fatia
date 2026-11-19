'use client';

import { ReviewScreen } from '../review-screen';

/**
 * A aba Em risco por caminho próprio (#399): é para onde o aviso diário leva.
 * O toque no aviso só aceita caminho sem `?` (`notificationTarget` e o
 * service worker), então `?aba=risco` não serviria.
 */
export default function AtRiskPage() {
  return <ReviewScreen initialTab="risk" />;
}
