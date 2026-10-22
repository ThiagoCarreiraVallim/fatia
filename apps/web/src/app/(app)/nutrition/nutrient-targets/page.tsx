'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, FlaskConical } from 'lucide-react';
import { nutritionApi, type NutrientTarget } from '@fatia/api-client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from '@/components/nutrition/load-error';
import { errorMessage } from '@/components/nutrition/error-message';

interface Preset {
  nutrientKey: string;
  label: string;
  unit: string;
  suggestMax?: number;
  suggestMin?: number;
}

const PRESETS: Preset[] = [
  { nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg', suggestMax: 2000 },
  { nutrientKey: 'sugar_g', label: 'Açúcar', unit: 'g', suggestMax: 50 },
  { nutrientKey: 'fiber_g', label: 'Fibra', unit: 'g', suggestMin: 25 },
  { nutrientKey: 'saturated_fat_g', label: 'Gordura saturada', unit: 'g', suggestMax: 22 },
  { nutrientKey: 'caffeine_mg', label: 'Cafeína', unit: 'mg', suggestMax: 400 },
  { nutrientKey: 'cholesterol_mg', label: 'Colesterol', unit: 'mg', suggestMax: 300 },
  { nutrientKey: 'potassium_mg', label: 'Potássio', unit: 'mg', suggestMin: 3500 },
];

export default function NutrientTargetsPage() {
  const qc = useQueryClient();
  const targets = useQuery({
    queryKey: ['nutrition', 'nutrient-targets'],
    queryFn: () => nutritionApi.nutrientTargets(),
  });

  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [customLabel, setCustomLabel] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [customUnit, setCustomUnit] = useState('mg');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const isCustom = preset.nutrientKey === '__custom__';

  const save = useMutation({
    mutationFn: () => {
      const body = isCustom
        ? { nutrientKey: customKey.trim(), label: customLabel.trim(), unit: customUnit.trim() }
        : { nutrientKey: preset.nutrientKey, label: preset.label, unit: preset.unit };
      return nutritionApi.upsertNutrientTarget({
        ...body,
        min: min.trim() ? Number(min) : undefined,
        max: max.trim() ? Number(max) : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-targets'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary'] });
      setMin('');
      setMax('');
      setCustomLabel('');
      setCustomKey('');
    },
  });

  // Remover pede confirmação, como no app: a API não desfaz, e o lixo fica ao
  // lado da linha que a pessoa toca para ler a meta.
  const [pendingDelete, setPendingDelete] = useState<NutrientTarget | null>(null);
  const remove = useMutation({
    mutationFn: (key: string) => nutritionApi.deleteNutrientTarget(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-targets'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary'] });
    },
    onSettled: () => setPendingDelete(null),
  });

  const existingKeys = useMemo(
    () => new Set((targets.data ?? []).map((t) => t.nutrientKey)),
    [targets.data],
  );

  const canSave = isCustom
    ? customLabel.trim() && customKey.trim() && customUnit.trim() && (min.trim() || max.trim())
    : !!(min.trim() || max.trim());

  return (
    <div className="space-y-5 p-4">
      <p className="text-sm text-muted-foreground">
        Controle nutrientes além dos macros — sódio, açúcar, fibra... Defina um limite (máx) e/ou
        uma meta (mín). O valor do dia soma o que você registra nas refeições.
      </p>

      {targets.isLoading && <Skeleton className="h-16" />}
      {targets.error && <LoadError error={targets.error} onRetry={() => void targets.refetch()} />}
      {remove.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(remove.error, {
            fallback: 'Não foi possível remover a meta. Tente de novo.',
          })}
        </p>
      )}

      {/* Lista atual */}
      <div className="space-y-2">
        {targets.data?.map((t) => (
          <TargetRow key={t.id} target={t} onDelete={() => setPendingDelete(t)} />
        ))}
        {targets.data && targets.data.length === 0 && (
          <EmptyState
            icon={FlaskConical}
            title="Nenhuma meta personalizada ainda"
            description="Defina abaixo um alvo de fibra, sódio, açúcar ou outro nutriente."
          />
        )}
      </div>

      {/* Adicionar */}
      <div className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
        <h2 className="text-sm font-bold">Adicionar meta</h2>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.nutrientKey}
              type="button"
              disabled={existingKeys.has(p.nutrientKey)}
              aria-pressed={preset.nutrientKey === p.nutrientKey}
              onClick={() => {
                setPreset(p);
                setMin(p.suggestMin ? String(p.suggestMin) : '');
                setMax(p.suggestMax ? String(p.suggestMax) : '');
              }}
              className={`min-h-11 rounded-full px-3 py-1 text-xs font-bold transition-colors disabled:opacity-30 ${
                preset.nutrientKey === p.nutrientKey
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset({ nutrientKey: '__custom__', label: '', unit: 'mg' })}
            aria-pressed={isCustom}
            className={`min-h-11 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              isCustom ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            Outro
          </button>
        </div>

        {isCustom && (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="clabel">Nome</Label>
              <Input
                id="clabel"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Ômega-3"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ckey">Chave</Label>
              <Input
                id="ckey"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="omega3_g"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cunit">Unidade</Label>
              <Input
                id="cunit"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="g"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="min">Mínimo {!isCustom && `(${preset.unit})`}</Label>
            <Input
              id="min"
              type="number"
              min={0}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max">Máximo {!isCustom && `(${preset.unit})`}</Label>
            <Input
              id="max"
              type="number"
              min={0}
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="—"
            />
          </div>
        </div>

        <Button
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending}
          className="w-full gap-2"
        >
          <Plus size={16} />
          {save.isPending ? 'Salvando…' : 'Salvar meta'}
        </Button>
        {save.error && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(save.error, {
              conflict: 'Essa meta já existe.',
              fallback: 'Não foi possível salvar a meta. Tente de novo.',
            })}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remover meta"
        description={pendingDelete ? `A meta de ${pendingDelete.label} será apagada.` : ''}
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.nutrientKey)}
      />
    </div>
  );
}

function TargetRow({ target, onDelete }: { target: NutrientTarget; onDelete: () => void }) {
  const range =
    target.min != null && target.max != null
      ? `${target.min}–${target.max} ${target.unit}`
      : target.max != null
        ? `máx ${target.max} ${target.unit}`
        : target.min != null
          ? `mín ${target.min} ${target.unit}`
          : '—';
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{target.label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{range}</p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Remover ${target.label}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-danger"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
