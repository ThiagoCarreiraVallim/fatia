import type { PlanTier } from '@fatia/api-client';
import { cn } from '@/lib/utils';

/** Selo FREE/PRO, o mesmo no perfil, no plano e no menu. */
export function PlanBadge({ tier, className }: { tier: PlanTier; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
        tier === 'PRO' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        className,
      )}
    >
      {tier}
    </span>
  );
}
