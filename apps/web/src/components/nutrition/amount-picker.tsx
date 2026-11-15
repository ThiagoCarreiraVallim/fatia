'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  amountGrams,
  MAX_QUANTITY,
  parseDecimalInput,
  stepQuantity,
  type Amount,
  type FoodPortion,
} from '@fatia/api-client';

interface Props {
  portions: FoodPortion[];
  amount: Amount;
  onChange: (amount: Amount) => void;
  /** Cria a medida no servidor; a nova já vem selecionada. */
  onCreatePortion: (label: string, grams: number) => Promise<FoodPortion>;
  /** id do campo de gramas, para quem tem dois pickers na mesma página. */
  gramsId?: string;
}

/**
 * Quanto comeu: gramas digitadas ou medida caseira × quantidade. Chips e
 * passos com alvo de 44 px, como no seletor do app (`seletor-de-quantidade`).
 *
 * As medidas são chips de escolha única ("g" é uma delas) porque a pessoa pensa
 * em "2 colheres" antes de pensar em gramas, e a conta em gramas aparece ao lado
 * para ela poder conferir.
 */
export function AmountPicker({
  portions,
  amount,
  onChange,
  onCreatePortion,
  gramsId = 'grams',
}: Props) {
  const [creating, setCreating] = useState(false);
  const grams = amountGrams(amount, portions);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Unidade">
        <Chip
          checked={amount.kind === 'grams'}
          label="gramas"
          onSelect={() =>
            onChange({ kind: 'grams', grams: grams !== null ? String(Math.round(grams)) : '100' })
          }
        >
          g
        </Chip>
        {portions.map((p) => (
          <Chip
            key={p.id}
            checked={amount.kind === 'portion' && amount.portionId === p.id}
            onSelect={() =>
              onChange({
                kind: 'portion',
                portionId: p.id,
                quantity: amount.kind === 'portion' ? amount.quantity : 1,
              })
            }
          >
            {p.label} · {Math.round(p.grams)} g
          </Chip>
        ))}
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus size={14} aria-hidden />
            Nova medida
          </button>
        )}
      </div>

      {creating && (
        <NewPortionForm
          onCancel={() => setCreating(false)}
          onSave={async (label, g) => {
            const created = await onCreatePortion(label, g);
            setCreating(false);
            onChange({ kind: 'portion', portionId: created.id, quantity: 1 });
          }}
        />
      )}

      {amount.kind === 'grams' ? (
        <div className="space-y-1">
          <label htmlFor={gramsId} className="text-sm font-medium">
            Quantidade (g)
          </label>
          <div className="flex items-center gap-2">
            <StepButton
              direction={-1}
              label="Menos 10 g"
              onClick={() => onChange({ kind: 'grams', grams: stepGrams(amount.grams, -1) })}
            />
            {/* Texto com teclado decimal, e não `type="number"`: o campo numérico
              recusa a vírgula em parte dos navegadores e some com o que foi digitado. */}
            <Input
              id={gramsId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount.grams}
              aria-invalid={grams === null}
              onChange={(e) => onChange({ kind: 'grams', grams: e.target.value })}
              className="text-center text-lg font-semibold tabular-nums"
            />
            <StepButton
              direction={1}
              label="Mais 10 g"
              onClick={() => onChange({ kind: 'grams', grams: stepGrams(amount.grams, 1) })}
            />
          </div>
          {grams === null && (
            <p role="alert" className="text-sm text-danger">
              Digite os gramas, como 120 ou 120,5.
            </p>
          )}
        </div>
      ) : (
        <QuantityField amount={amount} grams={grams} onChange={onChange} />
      )}
    </div>
  );
}

/** ±10 g a partir do que está no campo; vazio ou ilegível começa de 0. */
function stepGrams(text: string, direction: 1 | -1): string {
  const current = parseDecimalInput(text) ?? 0;
  const next = Math.max(10, Math.round((current + direction * 10) / 10) * 10);
  return String(next);
}

function StepButton({
  direction,
  label,
  onClick,
}: {
  direction: 1 | -1;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-11 w-11 shrink-0"
      aria-label={label}
      onClick={onClick}
    >
      {direction > 0 ? <Plus size={16} aria-hidden /> : <Minus size={16} aria-hidden />}
    </Button>
  );
}

/** "1,5" no campo: a vírgula é como a pessoa escreve; o ponto também vale. */
function quantityText(quantity: number): string {
  return String(quantity).replace('.', ',');
}

/**
 * Quantas medidas: digitável (1,5; 0,25) e com − e + de meio em meio. O campo
 * guarda o texto enquanto a pessoa digita; o número só sobe quando dá para ler.
 */
function QuantityField({
  amount,
  grams,
  onChange,
}: {
  amount: Extract<Amount, { kind: 'portion' }>;
  grams: number | null;
  onChange: (amount: Amount) => void;
}) {
  const [text, setText] = useState(quantityText(amount.quantity));
  const [synced, setSynced] = useState(amount.quantity);
  // O − e + (ou outra medida) mudam o número por fora: o campo acompanha.
  if (synced !== amount.quantity && Number.isFinite(amount.quantity)) {
    setSynced(amount.quantity);
    setText(quantityText(amount.quantity));
  }
  const parsed = parseDecimalInput(text);
  const invalid = parsed === null || parsed <= 0 || parsed > MAX_QUANTITY;

  const step = (direction: 1 | -1) => {
    const base = Number.isFinite(amount.quantity) ? amount.quantity : 1;
    onChange({ ...amount, quantity: stepQuantity(base, direction) });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <StepButton direction={-1} label="Menos" onClick={() => step(-1)} />
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label="Quantas medidas"
          aria-invalid={invalid}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const value = parseDecimalInput(next);
            const quantity = value !== null && value > 0 && value <= MAX_QUANTITY ? value : NaN;
            setSynced(quantity);
            onChange({ ...amount, quantity });
          }}
          className="w-20 text-center text-lg font-semibold tabular-nums"
        />
        <StepButton direction={1} label="Mais" onClick={() => step(1)} />
        {grams !== null && (
          <span
            aria-live="polite"
            className="text-sm tabular-nums text-muted-foreground"
          >{`= ${grams.toLocaleString('pt-BR')} g`}</span>
        )}
      </div>
      {invalid && (
        <p role="alert" className="text-sm text-danger">
          {`Digite um número, como 1,5 (até ${MAX_QUANTITY}).`}
        </p>
      )}
    </div>
  );
}

function Chip({
  checked,
  label,
  onSelect,
  children,
}: {
  checked: boolean;
  label?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
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

function NewPortionForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (label: string, grams: number) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [grams, setGrams] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const g = Number(grams.replace(',', '.'));
  const valid = label.trim().length > 0 && Number.isFinite(g) && g > 0;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor="portion-label" className="text-xs font-medium">
            Nome da medida
          </label>
          <Input
            id="portion-label"
            value={label}
            maxLength={40}
            placeholder="Ex.: concha"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="w-24 space-y-1">
          <label htmlFor="portion-grams" className="text-xs font-medium">
            Gramas da medida
          </label>
          <Input
            id="portion-grams"
            type="number"
            inputMode="decimal"
            value={grams}
            min={0}
            onChange={(e) => setGrams(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onSave(label.trim(), g);
            } catch (err) {
              setError((err as Error).message);
              setSaving(false);
            }
          }}
        >
          {saving ? 'Salvando...' : 'Salvar medida'}
        </Button>
      </div>
    </div>
  );
}
