'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, FlaskConical } from 'lucide-react';
import {
  customNutrientKey,
  NUTRIENT_PRESETS,
  NUTRIENT_UNITS,
  nutrientRangeError,
  nutrientStatusText,
  nutritionApi,
  parseTypedDecimal,
  type NutrientPreset,
  type NutrientProgress,
  type NutrientTarget,
} from '@fatia/api-client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from '@/components/nutrition/load-error';
import { errorMessage } from '@/components/nutrition/error-message';
import { hojeIso } from '@/lib/dias';
import { cn } from '@/lib/utils';

type Preset = NutrientPreset;
const PRESETS = NUTRIENT_PRESETS;
const PRESET_KEYS = new Set(PRESETS.map((p) => p.nutrientKey));
const UNITS = NUTRIENT_UNITS;
const CUSTOM = '__custom__';

/** Campo preenchido da prancha: --s2 dentro do cartão, sem borda. */
const FIELD = 'h-12 rounded-field border-0 bg-muted text-base';

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Seus nutrientes (prancha Al-N7): as metas além dos macros, com o valor de
 * hoje, e o formulário de adicionar. Mínimo e máximo são digitáveis (a prancha
 * usa "−/+"), e "Outro" pede só nome e unidade — a chave sai do nome.
 */
export default function NutrientTargetsPage() {
  const qc = useQueryClient();
  const today = hojeIso();
  const targets = useQuery({
    queryKey: ['nutrition', 'nutrient-targets'],
    queryFn: () => nutritionApi.nutrientTargets(),
  });
  const summary = useQuery({
    queryKey: ['nutrition', 'nutrient-summary', today],
    queryFn: () => nutritionApi.nutrientSummary(today),
  });
  const progressByKey = useMemo(
    () => new Map((summary.data?.nutrients ?? []).map((n) => [n.nutrientKey, n])),
    [summary.data],
  );

  // Sem escolha, vale o primeiro da lista que a pessoa ainda não tem.
  const [chosen, setPreset] = useState<Preset | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [customUnit, setCustomUnit] = useState<(typeof UNITS)[number]>('mg');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const existingKeys = useMemo(
    () => new Set((targets.data ?? []).map((t) => t.nutrientKey)),
    [targets.data],
  );
  const preset: Preset = chosen ??
    PRESETS.find((p) => !existingKeys.has(p.nutrientKey)) ?? {
      nutrientKey: CUSTOM,
      label: '',
      unit: customUnit,
    };
  const isCustom = preset.nutrientKey === CUSTOM;

  const minValue = parseTypedDecimal(min);
  const maxValue = parseTypedDecimal(max);
  const rangeError = min.trim() || max.trim() ? nutrientRangeError(minValue, maxValue) : null;
  const customKey = customNutrientKey(customLabel, customUnit);
  const nameError =
    isCustom && customKey && existingKeys.has(customKey)
      ? 'Já existe um nutriente com esse nome.'
      : null;
  const pickName = isCustom ? customLabel.trim() || 'novo nutriente' : preset.label;
  const unit = isCustom ? customUnit : preset.unit;
  const canSave =
    !rangeError &&
    !nameError &&
    (minValue != null || maxValue != null) &&
    (!isCustom || (customKey !== '' && customLabel.trim() !== ''));

  const save = useMutation({
    mutationFn: () => {
      const body = isCustom
        ? { nutrientKey: customKey, label: customLabel.trim(), unit: customUnit }
        : { nutrientKey: preset.nutrientKey, label: preset.label, unit: preset.unit };
      return nutritionApi.upsertNutrientTarget({
        ...body,
        min: minValue ?? undefined,
        max: maxValue ?? undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-targets'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary'] });
      setMin('');
      setMax('');
      setCustomLabel('');
      setPreset(null);
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

  const pick = (p: Preset) => {
    setPreset(p);
    setMin(p.suggestMin ? String(p.suggestMin) : '');
    setMax(p.suggestMax ? String(p.suggestMax) : '');
  };

  return (
    <div className="space-y-5 px-5 pb-28 pt-2">
      <p className="text-[13px] text-muted-foreground">
        Além dos macros. Eles aparecem em Nutrição, no detalhe de cada refeição e nas Metas do dia.
        O valor de hoje soma o que você registra.
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

      <section aria-labelledby="hoje" className="space-y-2">
        <h2 id="hoje" className="px-1 text-[13px] text-muted-foreground">
          Hoje
        </h2>
        {targets.data?.map((t) => (
          <TargetRow
            key={t.id}
            target={t}
            progress={progressByKey.get(t.nutrientKey)}
            onDelete={() => setPendingDelete(t)}
          />
        ))}
        {targets.data && targets.data.length === 0 && (
          <EmptyState
            icon={FlaskConical}
            title="Nenhuma meta personalizada ainda"
            description="Adicione abaixo um alvo de fibra, sódio, açúcar ou outro nutriente."
          />
        )}
      </section>

      <section
        aria-labelledby="adicionar"
        className="space-y-4 rounded-card bg-card p-4 shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.35)]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-field bg-primary-soft text-primary">
            <Plus size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="adicionar" className="text-[13px] text-muted-foreground">
              Adicionar nutriente
            </h2>
            <b className="block font-display text-[17px] font-semibold">{pickName}</b>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {/* Os que a pessoa já tem saem da lista, como na prancha. */}
          {PRESETS.filter((p) => !existingKeys.has(p.nutrientKey)).map((p) => (
            <button
              key={p.nutrientKey}
              type="button"
              aria-pressed={preset.nutrientKey === p.nutrientKey}
              onClick={() => pick(p)}
              className={cn(
                'h-11 rounded-chip px-4 text-[15px] font-semibold transition-colors',
                preset.nutrientKey === p.nutrientKey
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick({ nutrientKey: CUSTOM, label: '', unit: customUnit })}
            aria-pressed={isCustom}
            className={cn(
              'flex h-11 items-center gap-1.5 rounded-chip px-4 text-[15px] font-semibold transition-colors',
              isCustom
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-strong))]',
            )}
          >
            <Plus size={16} aria-hidden />
            Outro
          </button>
        </div>

        {isCustom && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="clabel">Nome do nutriente</Label>
              <Input
                id="clabel"
                maxLength={40}
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Ex.: Vitamina D, Ômega 3, Creatina"
                className={FIELD}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? 'clabel-erro' : undefined}
              />
              {nameError && (
                <p id="clabel-erro" role="alert" className="text-xs text-danger">
                  {nameError}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span id="cunit" className="text-xs text-muted-foreground">
                Unidade
              </span>
              <div role="radiogroup" aria-labelledby="cunit" className="flex gap-1.5">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={customUnit === u}
                    onClick={() => setCustomUnit(u)}
                    className={cn(
                      'min-h-11 min-w-11 rounded-full px-3 text-xs font-bold',
                      customUnit === u
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-foreground',
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Os alimentos da base não trazem esse valor. Ele conta pelo que você informar nos seus
              alimentos e itens.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="min" className="text-[13px] text-muted-foreground">
              Mínimo ({unit})
            </Label>
            <Input
              id="min"
              inputMode="decimal"
              autoComplete="off"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="quero pelo menos"
              className={FIELD}
              aria-invalid={rangeError ? true : undefined}
              aria-describedby={rangeError ? 'faixa-erro' : undefined}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max" className="text-[13px] text-muted-foreground">
              Máximo ({unit})
            </Label>
            <Input
              id="max"
              inputMode="decimal"
              autoComplete="off"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="quero no máximo"
              className={FIELD}
              aria-invalid={rangeError ? true : undefined}
              aria-describedby={rangeError ? 'faixa-erro' : undefined}
            />
          </div>
        </div>
        {rangeError && (
          <p id="faixa-erro" role="alert" className="text-sm text-danger">
            {rangeError}
          </p>
        )}

        <Button
          size="xl"
          full
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending}
          className="rounded-pill bg-foreground text-background hover:bg-foreground/90"
        >
          {save.isPending ? 'Salvando…' : `Adicionar ${pickName}`}
        </Button>
        {save.error && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(save.error, {
              conflict: 'Essa meta já existe.',
              fallback: 'Não foi possível salvar a meta. Tente de novo.',
            })}
          </p>
        )}
      </section>

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

function TargetRow({
  target,
  progress,
  onDelete,
}: {
  target: NutrientTarget;
  progress: NutrientProgress | undefined;
  onDelete: () => void;
}) {
  const kind =
    target.min != null && target.max == null
      ? 'mín'
      : target.max != null && target.min == null
        ? 'máx'
        : 'faixa';
  const goal =
    kind === 'mín'
      ? `${fmt(target.min as number)} ${target.unit}`
      : kind === 'máx'
        ? `${fmt(target.max as number)} ${target.unit}`
        : `${fmt(target.min ?? 0)}–${fmt(target.max ?? 0)} ${target.unit}`;
  const ref = target.max ?? target.min ?? 0;
  const total = progress?.total ?? 0;
  const pct = ref > 0 ? Math.min(100, Math.round((total / ref) * 100)) : 0;
  const status = progress?.status ?? 'none';
  const headingId = `meta-${target.nutrientKey}`;
  return (
    <div role="group" aria-labelledby={headingId} className="space-y-3 rounded-card bg-card p-4">
      <div className="flex items-center gap-2">
        <p id={headingId} className="font-display text-[17px] font-semibold text-foreground">
          {target.label}
        </p>
        <span
          className={cn(
            'rounded-pill px-2.5 py-0.5 text-[11px] font-extrabold uppercase',
            status === 'under' && kind === 'mín'
              ? 'bg-warning text-background'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {kind}
        </span>
        {!PRESET_KEYS.has(target.nutrientKey) && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
            seu
          </span>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remover ${target.label}`}
          className="-my-2 -mr-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-muted-foreground hover:bg-muted hover:text-danger"
        >
          <Trash2 size={18} />
        </button>
      </div>
      <div
        className="h-2 overflow-hidden rounded-pill bg-muted"
        role="progressbar"
        aria-label={target.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn(
            'h-full transition-all',
            'rounded-pill',
            status === 'over' ? 'bg-danger' : status === 'under' ? 'bg-protein' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between text-[15px]">
        <span className="tabular-nums text-muted-foreground">
          <b className="text-foreground">{progress ? `${fmt(total)} ${target.unit}` : '—'}</b>{' '}
          <span>de {goal}</span>
        </span>
        {progress && (
          <span
            className={
              status === 'over'
                ? 'text-danger'
                : status === 'under'
                  ? 'text-protein'
                  : 'text-primary'
            }
          >
            {nutrientStatusText(progress)}
          </span>
        )}
      </div>
    </div>
  );
}
