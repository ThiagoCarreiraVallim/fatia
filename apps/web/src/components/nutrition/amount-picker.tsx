'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  amountGrams,
  formatQuantity,
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
 * Quanto comeu: gramas digitadas ou medida caseira × quantidade.
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
            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:text-foreground"
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
          <Input
            id={gramsId}
            type="number"
            inputMode="decimal"
            value={amount.grams}
            onChange={(e) => onChange({ kind: 'grams', grams: e.target.value })}
            min={0}
            step={1}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Menos"
            onClick={() => onChange({ ...amount, quantity: stepQuantity(amount.quantity, -1) })}
          >
            <Minus size={16} aria-hidden />
          </Button>
          <output
            aria-label="Quantas medidas"
            className="min-w-10 text-center text-lg font-semibold tabular-nums"
          >
            {formatQuantity(amount.quantity)}
          </output>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Mais"
            onClick={() => onChange({ ...amount, quantity: stepQuantity(amount.quantity, 1) })}
          >
            <Plus size={16} aria-hidden />
          </Button>
          {grams !== null && (
            <span className="text-sm tabular-nums text-muted-foreground">
              = {grams.toLocaleString('pt-BR')} g
            </span>
          )}
        </div>
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
      {error && <p className="text-sm text-danger">{error}</p>}
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
