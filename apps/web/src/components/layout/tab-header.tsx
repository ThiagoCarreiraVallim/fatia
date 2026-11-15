import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botão-ícone do topo, como o `.ib` do canvas: 44 × 44, quadrado de cantos
 * 14 px em `--s1` (`bg-card`), ícone na cor do texto. `lime` é o de criar
 * (fundo verde, tinta escura); `ghost` fica sem fundo.
 */
export function headerButtonClass(variant: 'default' | 'lime' | 'ghost' = 'default') {
  return cn(
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-[transform,background-color] duration-200 active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 motion-reduce:transition-none',
    variant === 'lime' && 'bg-primary text-primary-foreground hover:bg-primary/90',
    variant === 'default' && 'bg-card text-foreground hover:bg-muted',
    variant === 'ghost' && 'text-foreground hover:bg-card',
  );
}

/**
 * Cabeçalho das 5 abas (pranchas Al-H1, Al-N1, Al-T1, Al-V1, Cm-01): título
 * grande à esquerda (Sora 28/700, `text-h1`) e os botões-ícone à direita,
 * 8 px entre eles. As abas não têm a barra de topo pequena (`hasTopBar`).
 *
 * Sem padding lateral: fica dentro da coluna da tela, alinhado aos cards.
 *
 * ```tsx
 * <TabHeader title="Nutrição">
 *   <Link href="/nutrition/scan" aria-label="Ler código" className={headerButtonClass()}>
 *     <ScanLine size={20} aria-hidden />
 *   </Link>
 * </TabHeader>
 * ```
 */
export function TabHeader({
  title,
  children,
  className,
}: {
  title: ReactNode;
  /** Os botões da direita; use `headerButtonClass()` em cada um. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex min-h-11 items-center justify-between gap-3', className)}>
      <h1 className="min-w-0 truncate font-display text-h1 text-foreground">{title}</h1>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </header>
  );
}
