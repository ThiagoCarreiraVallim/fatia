'use client';

import { useSearchParams } from 'next/navigation';
import { ReviewScreen } from './review-screen';

/**
 * "Para revisar" (#399, Pn-02). O `?aba=risco` antigo ainda abre o Em risco;
 * o aviso diário leva a `/review/at-risk`, que é caminho puro.
 */
export default function ReviewPage() {
  const params = useSearchParams();
  return <ReviewScreen initialTab={params.get('aba') === 'risco' ? 'risk' : 'open'} />;
}
