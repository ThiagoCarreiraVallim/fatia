import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Estado vazio de página ou seção: diz o que falta e o que fazer a seguir.
 * Mesma forma do `EmptyState` do app nativo (`ui/state.tsx`).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border border-dashed border-subtle px-6 py-8 text-center',
        className,
      )}
    >
      {Icon && <Icon size={28} aria-hidden className="text-muted-foreground" />}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
