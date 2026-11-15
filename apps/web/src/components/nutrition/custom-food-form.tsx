'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus, ScanBarcode } from 'lucide-react';
import {
  customFoodFromForm,
  micronutrientFields,
  moreMicronutrients,
  nutritionApi,
  per100Preview,
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
  /**
   * "Só salvar" ao lado de "Salvar e registrar" (Al-N11): o mesmo formulário,
   * sem cair na quantidade. Sem ela, o botão de voltar ocupa o lugar.
   */
  saveOnly?: { label: string; onSubmit: (input: CustomFoodInput) => void };
}

const MACRO_FIELDS = [
  ['kcal', 'Calorias (kcal)', ''],
  ['protein', 'Proteína (g)', 'text-protein'],
  ['carbs', 'Carboidrato (g)', 'text-carbs'],
  ['fat', 'Gordura (g)', 'text-fat'],
] as const;

/**
 * Cadastro de alimento próprio (Al-N11): copia o rótulo como ele é ("porção de
 * 30 g"); a conta para 100 g, micronutrientes inclusive, fica com
 * `customFoodFromForm`, a mesma do app. Os nutrientes personalizados da pessoa
 * (#376) vêm primeiro.
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
  saveOnly,
}: Props) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<CustomFoodErrors>({});
  const [linkBarcode, setLinkBarcode] = useState(Boolean(initial.barcode));
  const filled = Object.values(initial.nutrients ?? {}).some((v) => v.trim() !== '');
  const [microOpen, setMicroOpen] = useState(filled);
  const [extraKeys, setExtraKeys] = useState<string[]>([]);

  const targets = useQuery({
    queryKey: ['nutrition', 'nutrient-targets'],
    queryFn: () => nutritionApi.nutrientTargets(),
  });
  const nutrients = values.nutrients ?? {};
  const shownFilled = Object.fromEntries(
    [...Object.keys(nutrients), ...extraKeys].map((k) => [k, nutrients[k] ?? '']),
  );
  const fields = micronutrientFields(targets.data ?? [], shownFilled);
  const more = moreMicronutrients(fields);
  const filledCount = Object.values(nutrients).filter((v) => v.trim() !== '').length;

  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined, macros: undefined }));
  };
  const setNutrient = (key: string, text: string) => {
    setValues((prev) => ({ ...prev, nutrients: { ...(prev.nutrients ?? {}), [key]: text } }));
    setErrors((prev) => {
      if (!prev.nutrients?.[key]) return prev;
      const rest = { ...prev.nutrients };
      delete rest[key];
      return { ...prev, nutrients: rest };
    });
  };
  const setBasis = (basis: CustomFoodBasis) => {
    setValues((prev) => ({ ...prev, basis }));
    setErrors({});
  };

  const byServing = values.basis === 'serving';
  const preview = per100Preview(values);

  const parse = () => {
    const result = customFoodFromForm({ ...values, barcode: linkBarcode ? values.barcode : '' });
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.nutrients) setMicroOpen(true);
      return null;
    }
    return result.input;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = parse();
    if (input) onSubmit(input);
  };

  type Key = Exclude<keyof CustomFoodErrors, 'nutrients'>;
  const fieldError = (key: Key) =>
    errors[key] ? (
      <p id={`${id}-${key}-erro`} className="text-xs text-danger">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: Key) => ({
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
        <div className="flex flex-wrap items-center justify-between gap-2">
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

      {!editing && (
        <div className="space-y-1">
          <label htmlFor={`${id}-servingGrams`} className="text-sm font-medium">
            {byServing ? 'Tamanho da porção (g)' : 'Porção do rótulo (g, opcional)'}
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
        {MACRO_FIELDS.map(([key, label, tone]) => (
          <div key={key} className="space-y-1">
            <label
              htmlFor={`${id}-${key}`}
              className={cn('text-xs font-medium', tone || 'text-muted-foreground')}
            >
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
        <p role="alert" className="text-xs text-danger">
          {errors.macros}
        </p>
      )}

      {!editing && preview && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{preview}</p>
      )}

      <div className="space-y-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[hsl(var(--primary))]"
            checked={linkBarcode}
            onChange={(e) => {
              setLinkBarcode(e.target.checked);
              setErrors((prev) => ({ ...prev, barcode: undefined }));
            }}
          />
          <span className="flex-1">Vincular a um código de barras</span>
          <ScanBarcode size={16} className="text-muted-foreground" aria-hidden />
        </label>
        {linkBarcode && (
          <div className="space-y-1">
            <label htmlFor={`${id}-barcode`} className="text-xs font-medium text-muted-foreground">
              Código de barras (números embaixo das barras)
            </label>
            <Input
              id={`${id}-barcode`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              value={values.barcode ?? ''}
              onChange={set('barcode')}
              placeholder="Ex.: 7891000100103"
              {...invalid('barcode')}
            />
            {fieldError('barcode')}
            <p className="text-xs text-muted-foreground">
              Ao ler esse código, o Fatia acha este alimento antes de procurar fora.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card px-4">
        <button
          type="button"
          aria-expanded={microOpen}
          onClick={() => setMicroOpen((open) => !open)}
          className="flex min-h-14 w-full items-center gap-3 text-left"
        >
          <span className="flex-1">
            <span className="block text-sm font-bold">Micronutrientes</span>
            <span className="block text-xs text-muted-foreground">
              {filledCount
                ? `${filledCount} preenchido${filledCount === 1 ? '' : 's'}`
                : 'Fibra, sódio, açúcar e outros'}
            </span>
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">opcional</span>
          <ChevronDown
            size={16}
            className={cn('text-muted-foreground transition-transform', microOpen && 'rotate-180')}
            aria-hidden
          />
        </button>
        {microOpen && (
          <div className="divide-y border-t pb-3">
            {fields.map((field) => (
              <div key={field.key} className="flex min-h-14 items-center gap-3">
                <label
                  htmlFor={`${id}-n-${field.key}`}
                  className="flex flex-1 items-center gap-2 text-sm"
                >
                  {field.label}
                  {field.mine && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                      sua meta
                    </span>
                  )}
                </label>
                <div className="flex w-32 items-center gap-1">
                  <Input
                    id={`${id}-n-${field.key}`}
                    inputMode="decimal"
                    placeholder="—"
                    className="text-right"
                    value={nutrients[field.key] ?? ''}
                    onChange={(e) => setNutrient(field.key, e.target.value)}
                    aria-invalid={errors.nutrients?.[field.key] ? true : undefined}
                    aria-describedby={
                      errors.nutrients?.[field.key] ? `${id}-n-${field.key}-erro` : undefined
                    }
                  />
                  <span className="w-6 text-xs text-muted-foreground">{field.unit}</span>
                </div>
                {errors.nutrients?.[field.key] && (
                  <p id={`${id}-n-${field.key}-erro`} className="sr-only">
                    {errors.nutrients[field.key]}
                  </p>
                )}
              </div>
            ))}
            {errors.nutrients && Object.keys(errors.nutrients).length > 0 && (
              <p role="alert" className="pt-2 text-xs text-danger">
                {Object.entries(errors.nutrients)
                  .map(([key, msg]) => `${fields.find((f) => f.key === key)?.label ?? key}: ${msg}`)
                  .join(' ')}
              </p>
            )}
            {more.length > 0 && (
              <div className="space-y-2 pt-3">
                <p className="text-xs text-muted-foreground">Adicionar outro do rótulo</p>
                <div className="flex flex-wrap gap-2">
                  {more.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => setExtraKeys((prev) => [...prev, field.key])}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full bg-muted px-3 text-sm"
                    >
                      <Plus size={14} aria-hidden />
                      {field.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {editing
          ? 'Micronutrientes por 100 g, como os macros.'
          : `Valores na mesma base dos macros (${byServing ? 'por porção' : 'por 100 g'}). Seus nutrientes personalizados aparecem primeiro.`}
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {saveOnly ? (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => {
              const input = parse();
              if (input) saveOnly.onSubmit(input);
            }}
          >
            {saveOnly.label}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" className="flex-[2]" disabled={pending}>
          {pending ? 'Salvando...' : submitLabel}
        </Button>
      </div>
      {saveOnly && (
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
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
        'inline-flex min-h-11 items-center rounded-full border px-3 text-sm transition-colors',
        checked
          ? 'border-primary bg-primary/15 font-medium text-primary'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
