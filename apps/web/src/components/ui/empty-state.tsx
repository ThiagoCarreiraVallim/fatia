import type { LucideIcon } from 'lucide-react';
import type { IconName } from '@fatia/design';
import { cn } from '@/lib/utils';
import { Icon as DsIcon } from './icon';

/**
 * Estado vazio de página ou seção: diz o que falta e o que fazer a seguir.
 * Mesma forma do `EmptyState` do app nativo (`ui/state.tsx`).
 */
export function EmptyState({
  icon: Icon,
  dsIcon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  /** Ícone do design system pelo nome do canvas (telas redesenhadas). */
  dsIcon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-card border border-dashed border-subtle px-6 py-8 text-center',
        className,
      )}
    >
      {dsIcon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-field bg-muted text-muted-foreground">
          <DsIcon name={dsIcon} size={22} />
        </span>
      )}
      {Icon && <Icon size={28} aria-hidden className="text-muted-foreground" />}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
