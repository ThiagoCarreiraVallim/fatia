'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { errorMessage } from './error-message';

/**
 * Falha ao carregar um pedaço da Nutrição, com "Tentar de novo" — o
 * `ErrorState` do app (`apps/mobile/src/components/ui/state.tsx`).
 *
 * Existe porque os cards sumiam ou mostravam o estado vazio quando a consulta
 * falhava: o gráfico da semana desaparecia e o card de metas convidava a criar
 * uma meta que a pessoa já tinha.
 */
export function LoadError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-6 text-center', className)}>
      <p role="alert" className="text-sm text-muted-foreground">
        {errorMessage(error, { fallback: 'Não foi possível carregar.' })}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
