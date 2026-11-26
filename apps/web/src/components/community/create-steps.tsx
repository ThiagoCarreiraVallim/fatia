import { cn } from '@/lib/utils';

/** As duas barras do topo: passo 1 (tipo e nome) e passo 2 (marca). */
export function CreateSteps({ step }: { step: 1 | 2 }) {
  return (
    <div
      role="progressbar"
      aria-label="Passos para criar a comunidade"
      aria-valuemin={1}
      aria-valuemax={2}
      aria-valuenow={step}
      aria-valuetext={`Passo ${step} de 2`}
      className="flex flex-1 gap-1.5"
    >
      {[1, 2].map((n) => (
        <span
          key={n}
          className={cn(
            'h-1 flex-1 rounded-full',
            n < step ? 'bg-primary' : n === step ? 'bg-foreground' : 'bg-muted',
          )}
        />
      ))}
    </div>
  );
}
