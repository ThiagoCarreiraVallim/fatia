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
  parseDecimalInput,
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

  const minValue = parseDecimalInput(min);
  const maxValue = parseDecimalInput(max);
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
      <View className="gap-5 p-4 pb-28">
        <Text className="text-sm text-muted-foreground">
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
            <Text
              accessibilityRole="header"
              className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
            >
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

        <View className="gap-4 rounded-2xl bg-card p-4">
          <View>
            <Text className="text-xs text-muted-foreground">Adicionar nutriente</Text>
            <Text className="text-base font-bold text-foreground">{pickName}</Text>
          </View>

          <View className="flex-row flex-wrap gap-1.5">
            {NUTRIENT_PRESETS.map((p) => {
              const exists = existingKeys.has(p.nutrientKey);
              const on = preset.nutrientKey === p.nutrientKey;
              return (
                <ChipButton
                  key={p.nutrientKey}
                  label={p.label}
                  on={on}
                  disabled={exists}
                  onPress={() => pick(p)}
                />
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
                className={rangeError ? 'border-destructive' : undefined}
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
                className={rangeError ? 'border-destructive' : undefined}
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
        'min-h-[44px] flex-row items-center justify-center gap-1 rounded-full px-3 py-1',
        on ? 'bg-primary' : 'bg-muted',
        disabled && 'opacity-30',
      )}
    >
      {label === 'Outro' ? (
        <Plus size={14} color={on ? colors.background : colors.mutedForeground} />
      ) : null}
      <Text
        className={cn(
          'text-xs font-bold',
          on ? 'text-primary-foreground' : 'text-muted-foreground',
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
  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm font-bold text-foreground">{target.label}</Text>
        <View className="rounded-full bg-muted px-2 py-0.5">
          <Text className="text-[11px] font-bold text-foreground">{kind}</Text>
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
          className="ml-auto h-11 w-11 items-center justify-center rounded-md active:bg-accent"
        >
          <Trash2 size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={target.label}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <View
          className={cn(
            'h-full',
            status === 'over' ? 'bg-danger' : status === 'under' ? 'bg-warning' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </View>
      <View className="flex-row items-baseline justify-between">
        <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
          <Text className="font-bold text-foreground">
            {progress ? `${fmt(total)} ${target.unit}` : '—'}
          </Text>{' '}
          de {goal}
        </Text>
        {progress ? (
          <Text className="text-xs font-bold text-foreground">{nutrientStatusText(progress)}</Text>
        ) : null}
      </View>
    </View>
  );
}
