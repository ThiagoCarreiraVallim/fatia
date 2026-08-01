import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { Label } from './label';
import { cn } from './utils';

/**
 * `react-hook-form` funciona igual no React Native — o que não funciona é o
 * `<Form>` do shadcn, que depende de `<label for>`, `aria-describedby` e ids no
 * DOM.
 *
 * A ligação equivalente aqui é `accessibilityLabel` no campo. Por isso o render
 * prop entrega `a11y`: o campo espalha essas props e o leitor de tela anuncia
 * rótulo, obrigatoriedade e a mensagem de erro junto do campo, em vez de deixar
 * o erro como um texto solto que ninguém associa a nada.
 */

export interface FormFieldRender<T extends FieldValues, N extends FieldPath<T>> {
  field: ControllerRenderProps<T, N>;
  error?: string;
  a11y: {
    accessibilityLabel: string;
    accessibilityHint?: string;
    'aria-invalid': boolean;
  };
}

export function FormField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  className,
  render,
}: {
  control: Control<T>;
  name: N;
  label: string;
  description?: string;
  className?: string;
  render: (props: FormFieldRender<T, N>) => ReactNode;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;
        return (
          <View className={cn('gap-1.5', className)}>
            <Label>{label}</Label>
            {render({
              field,
              error,
              a11y: {
                accessibilityLabel: label,
                accessibilityHint: error ?? description,
                'aria-invalid': Boolean(error),
              },
            })}
            {description && !error ? (
              <Text className="text-xs text-muted-foreground">{description}</Text>
            ) : null}
            {error ? (
              // `alert` faz o leitor de tela anunciar assim que a mensagem
              // aparece, sem esperar o foco chegar nela.
              <Text accessibilityRole="alert" className="text-xs text-destructive">
                {error}
              </Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}

export function FormMessage({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" className="text-xs text-destructive">
      {children}
    </Text>
  );
}
