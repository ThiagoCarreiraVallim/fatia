import * as React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * Mensagem de erro do campo (prancha Componentes · Campos): borda e texto em
   * `danger`, com ícone, ligada ao campo por `aria-describedby`.
   */
  error?: string;
  /** Campo grande do design system v2 (52 px, raio 14, foco com contorno verde). */
  size?: 'default' | 'xl';
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, size = 'default', id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-erro`;
    const input = (
      <input
        id={inputId}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? cn(props['aria-describedby'], errorId) : props['aria-describedby']
        }
        className={cn(
          size === 'xl'
            ? 'flex h-[52px] w-full rounded-field border-[1.5px] border-transparent bg-muted px-[18px] text-base text-foreground transition-[border-color,box-shadow] duration-fast placeholder:text-faint focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_hsl(var(--primary-soft))] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
            : 'flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:text-sm',
          error &&
            'border-danger focus-visible:border-danger focus-visible:shadow-[0_0_0_4px_hsl(var(--danger)/0.12)]',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
    if (!error) return input;
    return (
      <div className="flex flex-col gap-2">
        {input}
        <p id={errorId} className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
          <Icon name="alert" size={16} />
          {error}
        </p>
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
