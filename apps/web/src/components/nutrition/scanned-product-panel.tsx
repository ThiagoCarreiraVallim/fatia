'use client';

import { useId, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  baseUnit,
  customFoodFromProduct,
  customFoodFromProductForm,
  findSavedProduct,
  incompleteProductMessage,
  mealItemFromProduct,
  mealItemFromProductForm,
  productFormFromPartial,
  productName,
  productPreview,
  servingOptions,
  type BarcodeLookup,
  type CustomFoodErrors,
  type CustomFoodInput,
  type CustomFoodParse,
  type Food,
  type OffAttribution,
  type ProductForm,
  type ProductPreview,
  type ScannedMealItem,
  type ScannedProduct,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ScannedChoice {
  item: ScannedMealItem;
  /** Alimento já guardado com esse nome: o item entra ligado a ele. */
  saved?: Food;
  /** O que criar em Meus alimentos, quando a caixa está marcada e nada foi guardado ainda. */
  save?: CustomFoodInput;
}

interface Props {
  lookup: BarcodeLookup;
  customFoods: Food[];
  pending: boolean;
  error?: string;
  onSubmit: (choice: ScannedChoice) => void;
  onBack: () => void;
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Produto lido, pronto para entrar na refeição — a versão web do
 * `ScannedProductDrawer` do app, com as mesmas regras de `@fatia/api-client`.
 *
 * O produto não vira `Food` sozinho (ADR 017): entra como item livre, com os
 * macros do rótulo. "Guardar em Meus alimentos" é escolha da pessoa.
 */
export function ScannedProductPanel(props: Props) {
  return props.lookup.status === 'ok' ? (
    <CompleteProduct {...props} product={props.lookup.product} />
  ) : (
    <IncompleteProduct {...props} lookup={props.lookup} />
  );
}

function CompleteProduct({
  product,
  lookup,
  customFoods,
  pending,
  error,
  onSubmit,
  onBack,
}: Props & { product: ScannedProduct }) {
  const id = useId();
  const options = servingOptions(product);
  const unit = baseUnit(product.basis);
  const [amount, setAmount] = useState(String(options[0].amount));
  const [save, setSave] = useState(false);
  const preview = productPreview(product, amount);
  const name = productName(product);
  const saved = findSavedProduct(customFoods, name);
  const parsed = save && !saved ? customFoodFromProduct(product) : null;

  const submit = () => {
    if (!preview || (parsed && !parsed.ok)) return;
    const grams = Number(amount.replace(',', '.'));
    onSubmit({
      item: mealItemFromProduct(product, grams),
      saved,
      save: parsed?.ok ? parsed.input : undefined,
    });
  };

  return (
    <div className="my-3 space-y-4">
      <div className="rounded-lg border px-3 py-3">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {fmt(product.kcalPer100g)} kcal · P {fmt(product.proteinPer100g)} · C{' '}
          {fmt(product.carbsPer100g)} · G {fmt(product.fatPer100g)} por 100 {unit}
        </p>
      </div>

      {unit === 'ml' && (
        <p className="text-xs text-warning">
          O rótulo é por 100 ml. O volume entra como gramas (1 ml ≈ 1 g).
        </p>
      )}

      <div className="space-y-2">
        <div role="radiogroup" aria-label="Quantidade sugerida" className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Chip
              key={option.label}
              checked={Number(amount.replace(',', '.')) === option.amount}
              onSelect={() => setAmount(String(option.amount))}
            >
              {option.label}
            </Chip>
          ))}
        </div>
        <label htmlFor={`${id}-amount`} className="text-sm font-medium">
          Quantidade ({unit})
        </label>
        <Input
          id={`${id}-amount`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <Preview preview={preview} />
      <SaveOption id={id} saved={saved} save={save} onSaveChange={setSave} parsed={parsed} />
      <Attribution attribution={lookup.attribution} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Actions
        onBack={onBack}
        onSubmit={submit}
        disabled={!preview || (parsed !== null && !parsed.ok)}
        pending={pending}
      />
    </div>
  );
}

const FORM_MACROS = [
  ['kcal', 'Calorias (kcal)'],
  ['proteinG', 'Proteína (g)'],
  ['carbsG', 'Carboidrato (g)'],
  ['fatG', 'Gordura (g)'],
] as const;

function IncompleteProduct({
  lookup,
  customFoods,
  pending,
  error,
  onSubmit,
  onBack,
}: Props & { lookup: Extract<BarcodeLookup, { status: 'incomplete' }> }) {
  const id = useId();
  const unit = baseUnit(lookup.partial.basis);
  const [values, setValues] = useState<ProductForm>(() => productFormFromPartial(lookup.partial));
  const [save, setSave] = useState(false);
  const item = mealItemFromProductForm(values);
  const saved = values.name.trim() ? findSavedProduct(customFoods, values.name) : undefined;
  const parsed = save && !saved ? customFoodFromProductForm(values) : null;

  const set = (key: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = () => {
    if (!item || (parsed && !parsed.ok)) return;
    onSubmit({ item, saved, save: parsed?.ok ? parsed.input : undefined });
  };

  return (
    <div className="my-3 space-y-3">
      <p role="status" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
        {incompleteProductMessage(lookup.missing)}
      </p>
      <div className="space-y-1">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Nome
        </label>
        <Input id={`${id}-name`} value={values.name} onChange={set('name')} maxLength={160} />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-grams`} className="text-sm font-medium">
          Quantidade ({unit})
        </label>
        <Input
          id={`${id}-grams`}
          inputMode="decimal"
          value={values.grams}
          onChange={set('grams')}
        />
      </div>
      <p className="text-xs text-muted-foreground">Valores por 100 {unit}, como no rótulo:</p>
      <div className="grid grid-cols-2 gap-2">
        {FORM_MACROS.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <label htmlFor={`${id}-${key}`} className="text-xs font-medium text-muted-foreground">
              {label}
            </label>
            <Input
              id={`${id}-${key}`}
              inputMode="decimal"
              value={values[key]}
              onChange={set(key)}
              aria-invalid={values[key].trim() === '' ? true : undefined}
            />
          </div>
        ))}
      </div>
      {item ? (
        <Preview preview={item} />
      ) : (
        // Sem isto o botão ficava desabilitado sem dizer por quê. Como no app.
        <p className="text-sm text-muted-foreground">
          Complete os quatro valores do rótulo para registrar.
        </p>
      )}
      <SaveOption id={id} saved={saved} save={save} onSaveChange={setSave} parsed={parsed} />
      <Attribution attribution={lookup.attribution} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Actions
        onBack={onBack}
        onSubmit={submit}
        disabled={!item || (parsed !== null && !parsed.ok)}
        pending={pending}
      />
    </div>
  );
}

function Preview({ preview }: { preview: ProductPreview | null }) {
  if (!preview) return null;
  return (
    <p className="text-sm tabular-nums text-muted-foreground">
      Total: {preview.kcal} kcal · P {fmt(preview.proteinG)} · C {fmt(preview.carbsG)} · G{' '}
      {fmt(preview.fatG)}
    </p>
  );
}

function saveErrors(errors: CustomFoodErrors): string {
  return Object.values(errors).filter(Boolean).join(' ');
}

function SaveOption({
  id,
  saved,
  save,
  onSaveChange,
  parsed,
}: {
  id: string;
  saved: Food | undefined;
  save: boolean;
  onSaveChange: (save: boolean) => void;
  parsed: CustomFoodParse | null;
}) {
  if (saved) {
    return (
      <p className="text-xs text-muted-foreground">
        Já está em Meus alimentos: o item entra ligado a ele.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <label htmlFor={`${id}-save`} className="flex min-h-9 items-center gap-2 text-sm">
        <input
          id={`${id}-save`}
          type="checkbox"
          checked={save}
          onChange={(e) => onSaveChange(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Guardar em Meus alimentos
      </label>
      <p className="text-xs text-muted-foreground">
        Na próxima vez, ele aparece na busca sem precisar ler o código.
      </p>
      {parsed && !parsed.ok && (
        <p role="alert" className="text-xs text-danger">
          {`Não dá para guardar: ${saveErrors(parsed.errors)}`}
        </p>
      )}
    </div>
  );
}

function Attribution({ attribution }: { attribution: OffAttribution }) {
  return (
    <p className="text-xs text-muted-foreground">
      Dados:{' '}
      <a
        href={attribution.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 underline"
      >
        {attribution.source}
        <ExternalLink size={12} aria-hidden />
      </a>{' '}
      ({attribution.license})
    </p>
  );
}

function Actions({
  onBack,
  onSubmit,
  disabled,
  pending,
}: {
  onBack: () => void;
  onSubmit: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1" onClick={onBack}>
        Voltar
      </Button>
      <Button className="flex-1" onClick={onSubmit} disabled={disabled || pending}>
        {pending ? 'Salvando...' : 'Adicionar'}
      </Button>
    </div>
  );
}

function Chip({
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
