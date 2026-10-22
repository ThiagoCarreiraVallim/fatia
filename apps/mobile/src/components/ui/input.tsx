import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from './utils';
import { cores } from '@/theme/cores';

export interface InputProps extends TextInputProps {
  className?: string;
}

/**
 * `TextInput` com a cara do input do PWA.
 *
 * Dois detalhes que só existem no mobile e que, esquecidos, aparecem como bug de
 * usabilidade e não de código:
 *
 * - `placeholderTextColor` precisa ser passado explicitamente; o React Native
 *   não lê a cor do placeholder de estilo. O padrão do sistema é cinza claro,
 *   ilegível sobre o fundo escuro do app.
 * - `selectionColor` no verde da marca — o azul padrão do sistema destoa de
 *   tudo o resto.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={cores.placeholder}
      selectionColor={cores.primary}
      className={cn(
        'min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground',
        props.editable === false && 'opacity-50',
        className,
      )}
      {...props}
    />
  );
});
