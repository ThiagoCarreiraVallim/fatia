'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Crown } from 'lucide-react';
import { billingApi, planSummary } from '@fatia/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { PlanBadge } from './plan-badge';
import { PLAN_QUERY_KEY } from './plan-screen';

/**
 * O plano no perfil: selo, resumo de uma linha e a porta para "Meu plano".
 *
 * Na instância que não exige plano (`requiresPlan: false`) não há o que
 * mostrar — a IA é de todos —, e a seção some.
 */
export function PlanSection() {
  const plan = useQuery({ queryKey: PLAN_QUERY_KEY, queryFn: () => billingApi.plan() });

  if (plan.isPending) return <Skeleton className="h-[76px] rounded-2xl" />;
  if (plan.isError || !plan.data.requiresPlan) return null;

  const pro = plan.data.tier === 'PRO';
  return (
    <Link
      href="/plan"
      aria-label={`Meu plano: ${planSummary(plan.data)}`}
      className="flex items-center gap-4 rounded-2xl border border-subtle bg-card px-4 py-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60">
        <Crown size={18} className="text-primary" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-base font-bold leading-tight text-foreground">
          Meu plano <PlanBadge tier={plan.data.tier} />
        </p>
        <p className="text-xs text-muted-foreground">
          {pro ? planSummary(plan.data) : 'Assine o PRO para conversar com a IA do Fatia'}
        </p>
      </div>
      <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
    </Link>
  );
}
