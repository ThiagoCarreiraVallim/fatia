import { cn } from '@/lib/utils';

/**
 * Bloco de carregamento no formato do conteúdo que vai chegar, com o brilho
 * que atravessa (`anim-shim`, parado com reduzir movimento). Escondido do
 * leitor de tela: quem anuncia o carregamento é o `aria-busy` de quem o usa.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn('anim-shim rounded-[12px] bg-card', className)} {...props} />
  );
}
