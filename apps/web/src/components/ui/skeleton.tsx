import { cn } from '@/lib/utils';

/**
 * Bloco de carregamento no formato do conteúdo que vai chegar. Escondido do
 * leitor de tela: quem anuncia o carregamento é o `aria-busy` de quem o usa.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-xl bg-card motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
