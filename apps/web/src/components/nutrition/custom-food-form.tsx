'use client';

import { useId, useState } from 'react';
import {
  customFoodFromForm,
  customFoodSummary,
  type CustomFoodBasis,
  type CustomFoodErrors,
  type CustomFoodForm as FormValues,
  type CustomFoodInput,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  initial: FormValues;
  /** Na edição os valores ficam sempre por 100 g, como estão guardados. */
  editing?: boolean;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (input: CustomFoodInput) => void;
  onCancel: () => void;
  cancelLabel?: string;
}

const MACRO_FIELDS = [
  ['kcal', 'Calorias (kcal)'],
  ['protein', 'Proteína (g)'],
  ['carbs', 'Carboidrato (g)'],
  ['fat', 'Gordura (g)'],
] as const;

/**
 * Cadastro de alimento próprio: copia o rótulo como ele é ("porção de 30 g")
 * e a conta para 100 g fica com `customFoodFromForm`, a mesma do app.
 */
export function CustomFoodForm({
  initial,
  editing = false,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  cancelLabel = 'Voltar',
}: Props) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<CustomFoodErrors>({});

  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined, macros: undefined }));
  };
  const setBasis = (basis: CustomFoodBasis) => {
    setValues((prev) => ({ ...prev, basis }));
    setErrors({});
  };

  const byServing = values.basis === 'serving';
  // A conta à vista: quem copia o rótulo confere se a porção foi digitada certo.
  const parsed = byServing ? customFoodFromForm(values) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = customFoodFromForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.input);
  };

  const fieldError = (key: keyof CustomFoodErrors) =>
    errors[key] ? (
      <p id={`${id}-${key}-erro`} className="text-xs text-rose-500">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: keyof CustomFoodErrors) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${id}-${key}-erro` : undefined,
  });

  return (
    <form onSubmit={submit} noValidate className="my-3 space-y-3">
      <div className="space-y-1">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Nome
        </label>
        <Input
          id={`${id}-name`}
          autoFocus={!initial.name}
          value={values.name}
          onChange={set('name')}
          placeholder="Ex.: granola da marca X"
          maxLength={160}
          {...invalid('name')}
        />
        {fieldError('name')}
      </div>

      {!editing && (
        <div className="space-y-1">
          <p id={`${id}-basis`} className="text-sm font-medium">
            Valores do rótulo
          </p>
          <div role="radiogroup" aria-labelledby={`${id}-basis`} className="flex gap-2">
            <BasisChip checked={byServing} onSelect={() => setBasis('serving')}>
              Por porção
            </BasisChip>
            <BasisChip checked={!byServing} onSelect={() => setBasis('100g')}>
              Por 100 g
            </BasisChip>
          </div>
        </div>
      )}

      {byServing && (
        <div className="space-y-1">
          <label htmlFor={`${id}-servingGrams`} className="text-sm font-medium">
            Tamanho da porção (g)
          </label>
          <Input
            id={`${id}-servingGrams`}
            inputMode="decimal"
            value={values.servingGrams}
            onChange={set('servingGrams')}
            placeholder="Ex.: 30"
            {...invalid('servingGrams')}
          />
          {fieldError('servingGrams')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {MACRO_FIELDS.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <label htmlFor={`${id}-${key}`} className="text-xs font-medium text-muted-foreground">
              {label}
            </label>
            <Input
              id={`${id}-${key}`}
              inputMode="decimal"
              value={values[key]}
              onChange={set(key)}
              placeholder={key === 'kcal' ? '' : '0'}
              {...invalid(key)}
            />
            {fieldError(key)}
          </div>
        ))}
      </div>
      {errors.macros && (
        <p role="alert" className="text-xs text-rose-500">
          {errors.macros}
        </p>
      )}

      {parsed?.ok && (
        <p className="text-xs text-muted-foreground">
          Fica guardado como {customFoodSummary(parsed.input)}.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? 'Salvando...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function BasisChip({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors',
        checked
          ? 'border-primary bg-primary/15 font-medium text-primary'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
