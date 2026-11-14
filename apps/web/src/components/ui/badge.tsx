import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        // Selos de estado do DS v2 (prancha Componentes · Selos): cor sempre
        // acompanhada de texto; nunca a cor sozinha diz o estado.
        free: 'border-transparent bg-muted text-foreground',
        trial: 'border-transparent bg-[hsl(var(--info)/0.16)] text-info',
        pro: 'border-transparent bg-primary text-primary-foreground',
        'pro-community': 'border-transparent bg-brand text-brand-foreground',
        lite: 'border-transparent bg-[hsl(var(--warning)/0.16)] text-warning',
        done: 'border-transparent bg-[hsl(var(--success)/0.16)] text-success',
        pending: 'border-transparent bg-surface-3 text-muted-foreground',
        risk: 'border-transparent bg-[hsl(var(--danger)/0.16)] text-danger',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Texto padrão de cada selo de estado. */
export const STATUS_BADGE_LABELS = {
  free: 'Free',
  trial: (days: number) => `Teste · ${days} ${days === 1 ? 'dia' : 'dias'}`,
  pro: 'PRO',
  'pro-community': (group: string) => `PRO · ${group}`,
  lite: 'Lite',
  done: 'Concluído',
  pending: 'Pendente',
  risk: 'Em risco',
} as const;

export { Badge, badgeVariants };
