import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Falha ao carregar uma tela ou seção, com "Tentar de novo". Mesma forma do
 * `ErrorState` do app nativo (`ui/state.tsx`): sem ele a tela que falhava
 * ficava só com o título, e quem olhava não sabia se era carregamento ou erro.
 */
export function ErrorState({
  message = 'Não deu para carregar.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-subtle bg-card px-6 py-8 text-center',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
