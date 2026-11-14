import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Botões do design system v2 (prancha Componentes · Botões): primário,
 * secundário, contorno, texto, apagar, adicionar, "Gerar com IA"; tamanhos
 * 52 px (`xl`, o botão principal da tela), 44 (`sm` novo é o `lg`), 34 (`xs`).
 * Pressionar encolhe para .97 (`anim-press`, parado com reduzir movimento).
 *
 * As variantes antigas (`default`, `destructive`, `ghost`, `link`) continuam
 * porque as telas ainda não redesenhadas as usam.
 */
const buttonVariants = cva(
  'anim-press relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.6)] hover:brightness-105',
        secondary: 'bg-card text-foreground hover:bg-surface-3',
        outline:
          'border border-border-strong bg-transparent text-foreground hover:bg-muted hover:text-foreground',
        text: 'bg-transparent text-foreground hover:bg-muted',
        danger: 'bg-[hsl(var(--danger)/0.12)] text-danger hover:bg-[hsl(var(--danger)/0.18)]',
        add: 'bg-primary text-primary-foreground hover:brightness-105',
        ai: 'bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.6)] hover:brightness-105',
        brand: 'bg-brand text-brand-foreground hover:brightness-105',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // Alvo de toque de 44 px (WCAG 2.5.5) sem mudar o desenho: o que é menor
      // ganha uma área invisível (`after:`) em volta, que recebe o toque.
      size: {
        default: 'h-10 px-4 py-2 after:absolute after:-inset-0.5',
        xl: 'h-[52px] rounded-field px-6 text-[15px] font-bold',
        lg: 'h-11 rounded-[12px] px-[18px] text-sm font-bold',
        sm: 'h-8 rounded-md px-3 text-xs after:absolute after:-inset-1.5',
        xs: 'h-[34px] rounded-chip px-3.5 text-[13px] font-bold after:absolute after:-inset-[5px]',
        icon: 'h-10 w-10 after:absolute after:-inset-0.5',
        // Os elementos de IA do registry pedem `icon-sm` (ações de mensagem e
        // navegação de branch). Sem este tamanho o `tsc` recusa os arquivos que
        // o CLI instalou — e reescrevê-los à mão é justamente o que a #250 proíbe.
        'icon-sm': 'h-8 w-8 after:absolute after:-inset-1.5',
      },
      full: { true: 'w-full' },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, full, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
