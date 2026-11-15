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
        // Fundo a 10%, não 16%: a 16% o azul sobre o cartão escuro e o âmbar e o
        // verde sobre o fundo claro ficavam abaixo de 4,5:1.
        trial: 'border-transparent bg-[hsl(var(--info)/0.1)] text-info',
        pro: 'border-transparent bg-primary text-primary-foreground',
        'pro-community': 'border-transparent bg-brand text-brand-foreground',
        lite: 'border-transparent bg-[hsl(var(--warning)/0.1)] text-warning',
        // Contorno, sem fundo: o verde do claro sobre qualquer véu ficava em 4,3:1.
        done: 'border-[hsl(var(--success)/0.45)] bg-transparent text-success',
        pending: 'border-transparent bg-surface-3 text-muted-foreground',
        risk: 'border-transparent bg-[hsl(var(--danger)/0.1)] text-danger',
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
