import { Suspense } from 'react';
import { PlanScreen } from '@/components/billing/plan-screen';

/** "Meu plano" (ADR 024). Suspense por causa do `useSearchParams` (`?recurso=`). */
export default function PlanPage() {
  return (
    <Suspense>
      <PlanScreen />
    </Suspense>
  );
}
