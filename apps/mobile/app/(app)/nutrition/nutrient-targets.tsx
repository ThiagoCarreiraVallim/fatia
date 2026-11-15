import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import {
  NUTRIENT_PRESETS,
  NUTRIENT_UNITS,
  customNutrientKey,
  nutrientRangeError,
  nutrientStatusText,
  nutritionApi,
  parseTypedDecimal,
  type NutrientPreset,
  type NutrientProgress,
  type NutrientTarget,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  cn,
  useConfirm,
} from '@/components/ui';
import { NUMEROS_TABULARES, hojeIso, mensagemDeErro } from '@/components/nutrition/helpers';
import { colors } from '@/theme/colors';

/**
 * Seus nutrientes (prancha Al-N7). Réplica de
 * `apps/web/src/app/(app)/nutrition/nutrient-targets/page.tsx`: as metas com o
 * valor de hoje e o status, e o formulário de adicionar com mínimo e máximo
 * digitáveis. "Outro" pede só nome e unidade; a chave sai do nome.
 */

/** Campo preenchido da prancha: --s2 dentro do cartão, sem borda. */
const FIELD = 'h-12 rounded-field border-0 bg-muted text-base';

const PRESET_KEYS = new Set(NUTRIENT_PRESETS.map((p) => p.nutrientKey));
const CUSTOM = '__custom__';
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export default function NutrientTargetsScreen() {
  const confirm = useConfirm();
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

  const [chosen, setChosen] = useState<NutrientPreset | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [customUnit, setCustomUnit] = useState<(typeof NUTRIENT_UNITS)[number]>('mg');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const existingKeys = useMemo(
    () => new Set((targets.data ?? []).map((t) => t.nutrientKey)),
    [targets.data],
  );
  // Sem escolha, vale o primeiro da lista que a pessoa ainda não tem.
  const preset: NutrientPreset = chosen ??
    NUTRIENT_PRESETS.find((p) => !existingKeys.has(p.nutrientKey)) ?? {
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

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-targets'] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary'] });
  };

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
      invalidate();
      setMin('');
      setMax('');
      setCustomLabel('');
      setChosen(null);
    },
  });

  const remove = useMutation({
    mutationFn: (key: string) => nutritionApi.deleteNutrientTarget(key),
    onSuccess: invalidate,
  });

  const confirmRemove = (t: NutrientTarget) =>
    confirm({
      title: 'Remover meta',
      description: `A meta de ${t.label} será apagada.`,
      confirmLabel: 'Remover',
      destructive: true,
      onConfirm: () => remove.mutate(t.nutrientKey),
    });

  const pick = (p: NutrientPreset) => {
    setChosen(p);
    setMin(p.suggestMin ? String(p.suggestMin) : '');
    setMax(p.suggestMax ? String(p.suggestMax) : '');
  };

  return (
    <Screen onRefresh={() => void targets.refetch()} refreshing={targets.isRefetching}>
      <View className="gap-5 px-5 pb-28 pt-2">
        <Text className="text-[13px] text-muted-foreground">
          Além dos macros. Eles aparecem em Nutrição, no detalhe de cada refeição e nas Metas do
          dia. O valor de hoje soma o que você registra.
        </Text>

        {targets.isLoading ? <LoadingState label="Carregando metas…" /> : null}
        {targets.error ? (
          <ErrorState error={targets.error} onRetry={() => void targets.refetch()} />
        ) : null}
        {remove.error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {mensagemDeErro(remove.error, {
              alternativa: 'Não foi possível remover a meta. Tente de novo.',
            })}
          </Text>
        ) : null}

        {targets.data ? (
          <View className="gap-2">
            <Text accessibilityRole="header" className="px-1 text-[13px] text-muted-foreground">
              Hoje
            </Text>
            {targets.data.map((t) => (
              <TargetRow
                key={t.id}
                target={t}
                progress={progressByKey.get(t.nutrientKey)}
                onDelete={() => confirmRemove(t)}
              />
            ))}
            {targets.data.length === 0 ? (
              <EmptyState
                title="Nenhuma meta personalizada ainda."
                description="Adicione abaixo um alvo de fibra, sódio, açúcar ou outro nutriente."
              />
            ) : null}
          </View>
        ) : null}

        <View
          className="gap-4 rounded-card bg-card p-4"
          style={{ borderWidth: 1.5, borderColor: `${colors.primary}59` }}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="h-12 w-12 items-center justify-center rounded-field"
              style={{ backgroundColor: `${colors.primary}26` }}
            >
              <Plus size={20} color={colors.primaryText} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] text-muted-foreground">Adicionar nutriente</Text>
              <Text className="font-display-semibold text-[17px] text-foreground">{pickName}</Text>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-1.5">
            {/* Os que a pessoa já tem saem da lista, como na prancha. */}
            {NUTRIENT_PRESETS.filter((p) => !existingKeys.has(p.nutrientKey)).map((p) => {
              const on = preset.nutrientKey === p.nutrientKey;
              return (
                <ChipButton key={p.nutrientKey} label={p.label} on={on} onPress={() => pick(p)} />
              );
            })}
            <ChipButton
              label="Outro"
              on={isCustom}
              onPress={() => pick({ nutrientKey: CUSTOM, label: '', unit: customUnit })}
            />
          </View>

          {isCustom ? (
            <View className="gap-3">
              <View className="gap-1">
                <Label>Nome do nutriente</Label>
                <Input
                  accessibilityLabel="Nome do nutriente"
                  accessibilityHint={nameError ?? undefined}
                  maxLength={40}
                  value={customLabel}
                  onChangeText={setCustomLabel}
                  placeholder="Ex.: Vitamina D, Ômega 3, Creatina"
                  className={nameError ? 'border-destructive' : undefined}
                />
                {nameError ? (
                  <Text accessibilityRole="alert" className="text-xs text-destructive">
                    {nameError}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-muted-foreground">Unidade</Text>
                <View accessibilityRole="radiogroup" className="flex-row gap-1.5">
                  {NUTRIENT_UNITS.map((u) => (
                    <Pressable
                      key={u}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: customUnit === u }}
                      onPress={() => setCustomUnit(u)}
                      className={cn(
                        'min-h-11 min-w-11 items-center justify-center rounded-full px-3',
                        customUnit === u ? 'bg-foreground' : 'bg-muted',
                      )}
                    >
                      <Text
                        className={cn(
                          'text-xs font-bold',
                          customUnit === u ? 'text-background' : 'text-foreground',
                        )}
                      >
                        {u}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text className="text-xs text-muted-foreground">
                Os alimentos da base não trazem esse valor. Ele conta pelo que você informar nos
                seus alimentos e itens.
              </Text>
            </View>
          ) : null}

          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Label>Mínimo ({unit})</Label>
              <Input
                accessibilityLabel={`Mínimo (${unit})`}
                accessibilityHint={rangeError ?? undefined}
                keyboardType="decimal-pad"
                value={min}
                onChangeText={setMin}
                placeholder="quero pelo menos"
                className={cn(FIELD, rangeError && 'border border-destructive')}
              />
            </View>
            <View className="flex-1 gap-1">
              <Label>Máximo ({unit})</Label>
              <Input
                accessibilityLabel={`Máximo (${unit})`}
                accessibilityHint={rangeError ?? undefined}
                keyboardType="decimal-pad"
                value={max}
                onChangeText={setMax}
                placeholder="quero no máximo"
                className={cn(FIELD, rangeError && 'border border-destructive')}
              />
            </View>
          </View>
          {rangeError ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {rangeError}
            </Text>
          ) : null}

          <Button
            size="xl"
            className="rounded-pill bg-foreground"
            textClassName="text-background"
            onPress={() => save.mutate()}
            disabled={!canSave || save.isPending}
            loading={save.isPending}
          >
            {`Adicionar ${pickName}`}
          </Button>
          {save.error ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {mensagemDeErro(save.error, {
                conflito: 'Essa meta já existe.',
                alternativa: 'Não foi possível salvar a meta. Tente de novo.',
              })}
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function ChipButton({
  label,
  on,
  disabled = false,
  onPress,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-11 flex-row items-center justify-center gap-1.5 rounded-chip px-4',
        on ? 'bg-primary' : label === 'Outro' ? 'border border-border-strong' : 'bg-muted',
        disabled && 'opacity-30',
      )}
    >
      {label === 'Outro' ? (
        <Plus size={16} color={on ? colors.background : colors.foreground} />
      ) : null}
      <Text
        className={cn(
          'font-sans-semibold text-[15px]',
          on ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
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
  // Abaixo do mínimo hoje: o "MÍN" acende em laranja, como na prancha.
  const short = kind === 'mín' && status === 'under';
  return (
    <View className="gap-3 rounded-card bg-card p-4">
      <View className="flex-row items-center gap-2">
        <Text className="font-display-semibold text-[17px] text-foreground">{target.label}</Text>
        <View className={cn('rounded-pill px-2.5 py-0.5', short ? 'bg-warning' : 'bg-muted')}>
          <Text
            className={cn(
              'font-sans-extrabold text-[11px] uppercase',
              short ? 'text-background' : 'text-muted-foreground',
            )}
          >
            {kind}
          </Text>
        </View>
        {!PRESET_KEYS.has(target.nutrientKey) ? (
          <View className="rounded-full bg-primary/15 px-2 py-0.5">
            <Text className="text-[11px] font-bold text-primary">seu</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remover ${target.label}`}
          onPress={onDelete}
          hitSlop={8}
          className="-my-2 -mr-2 ml-auto h-11 w-11 items-center justify-center rounded-field active:bg-muted"
        >
          <Trash2 size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={target.label}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        className="h-2 overflow-hidden rounded-pill bg-muted"
      >
        <View
          className={cn(
            'h-full rounded-pill',
            status === 'over' ? 'bg-danger' : status === 'under' ? 'bg-protein' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </View>
      <View className="flex-row items-baseline justify-between">
        <Text style={NUMEROS_TABULARES} className="text-[15px] text-muted-foreground">
          <Text className="font-sans-bold text-foreground">
            {progress ? `${fmt(total)} ${target.unit}` : '—'}
          </Text>{' '}
          de {goal}
        </Text>
        {progress ? (
          <Text
            className={cn(
              'text-[15px]',
              status === 'over'
                ? 'text-destructive'
                : status === 'under'
                  ? 'text-protein'
                  : 'text-primary',
            )}
          >
            {nutrientStatusText(progress)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
