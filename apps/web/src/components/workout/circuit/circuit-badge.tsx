import { circuitBadge, type CircuitFormat } from '@fatia/api-client';
import { cn } from '@/lib/utils';

/** As cores do `bdg pro | trial | com` do canvas. */
const TONE = {
  pro: 'bg-primary text-primary-foreground',
  trial: 'bg-[hsl(var(--info)/0.1)] text-info',
  com: 'bg-brand text-brand-foreground',
} as const;

/**
 * O selo do formato: no card da aba Circuitos (Al-T6) com o nome do formato, e
 * no topo do relógio (Al-T4, T4b, T4c, T4d) com o circuito ("AMRAP 12").
 */
export function CircuitBadge({
  format,
  children,
  className,
}: {
  format: CircuitFormat;
  children?: React.ReactNode;
  className?: string;
}) {
  const badge = circuitBadge(format);
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-pill px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em]',
        TONE[badge.tone],
        className,
      )}
    >
      {children ?? badge.label}
    </span>
  );
}
