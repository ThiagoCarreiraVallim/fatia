import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

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
        'flex flex-col items-center gap-3 rounded-card border border-subtle bg-card px-6 py-8 text-center',
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-field bg-[hsl(var(--danger)/0.14)] text-danger">
        <Icon name="alert" size={22} />
      </span>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
