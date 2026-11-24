import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Minus, Plus, Square } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
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
import { Button, DrawerScrollView, DrawerTextInput, cn } from '@/components/ui';
import { colors } from '@/theme/colors';
import { DrawerInput } from './drawer-input';

/**
 * Réplica de `apps/web/src/components/nutrition/custom-food-form.tsx` (Al-N11).
 *
 * Copia o rótulo como ele vem ("porção de 30 g"); a conta para 100 g, os
 * micronutrientes inclusive, é a de `customFoodFromForm`, a mesma do PWA. Os
 * nutrientes personalizados da pessoa (#376) vêm primeiro.
 */

const LABEL = 'font-sans-semibold text-sm text-muted-foreground';

/** Cor do rótulo de cada macro, como na prancha. */
const MACRO_TONE: Record<string, string> = {
  kcal: 'text-muted-foreground',
  protein: 'text-protein',
  carbs: 'text-carbs',
  fat: 'text-fat',
};

const MACRO_FIELDS = [
  ['kcal', 'Calorias (kcal)'],
  ['protein', 'Proteína (g)'],
  ['carbs', 'Carboidrato (g)'],
  ['fat', 'Gordura (g)'],
] as const;

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
  footer,
}: {
  initial: FormValues;
  /** Na edição os valores ficam por 100 g, como estão guardados. */
  editing?: boolean;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (input: CustomFoodInput) => void;
  onCancel: () => void;
  cancelLabel?: string;
  /** "Só salvar" ao lado de "Salvar e registrar" (Al-N11). */
  saveOnly?: { label: string; onSubmit: (input: CustomFoodInput) => void };
  /** O "Apagar alimento" da edição, dentro da mesma rolagem. */
  footer?: ReactNode;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<CustomFoodErrors>({});
  const [linkBarcode, setLinkBarcode] = useState(Boolean(initial.barcode));
  const [microOpen, setMicroOpen] = useState(
    Object.values(initial.nutrients ?? {}).some((v) => v.trim() !== ''),
  );
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

  const stepServing = (direction: 1 | -1) =>
    setValues((prev) => {
      const current = Number(prev.servingGrams.replace(',', '.'));
      const base = Number.isFinite(current) ? current : 0;
      const next = Math.max(10, Math.round((base + direction * 10) / 10) * 10);
      return { ...prev, servingGrams: String(next) };
    });
  const set = (key: keyof FormValues) => (value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
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

  type Key = Exclude<keyof CustomFoodErrors, 'nutrients'>;
  const fieldError = (key: Key) =>
    errors[key] ? (
      <Text accessibilityRole="alert" className="text-xs text-destructive">
        {errors[key]}
      </Text>
    ) : null;

  return (
    <DrawerScrollView
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <DrawerInput
          label="Nome"
          autoFocus={!initial.name}
          value={values.name}
          onChangeText={set('name')}
          placeholder="Ex.: granola da marca X"
          maxLength={160}
          filled
          labelClassName={LABEL}
        />
        {fieldError('name')}
      </View>

      {editing ? null : (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm text-muted-foreground">Valores do rótulo</Text>
          <View accessibilityRole="radiogroup" className="flex-row gap-1 rounded-field bg-card p-1">
            <BasisChip checked={byServing} onPress={() => setBasis('serving')}>
              Porção
            </BasisChip>
            <BasisChip checked={!byServing} onPress={() => setBasis('100g')}>
              100 g
            </BasisChip>
          </View>
        </View>
      )}

      {editing ? null : (
        <View className="gap-1">
          <Text className={LABEL}>
            {byServing ? 'Tamanho da porção (g)' : 'Porção do rótulo (g, opcional)'}
          </Text>
          {/* "− 40 g +" da prancha: o número é digitável, os passos são de 10 g. */}
          <View className="h-[52px] flex-row items-center rounded-field bg-card px-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Porção menos 10 g"
              onPress={() => stepServing(-1)}
              className="h-11 w-11 items-center justify-center"
            >
              <Minus size={18} color={colors.foreground} />
            </Pressable>
            <DrawerTextInput
              accessibilityLabel={byServing ? 'Tamanho da porção (g)' : 'Porção do rótulo (g)'}
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={values.servingGrams}
              onChangeText={set('servingGrams')}
              placeholder="Ex.: 30"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.primaryText}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 18,
                fontFamily: 'Manrope_700Bold',
                color: colors.foreground,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Porção mais 10 g"
              onPress={() => stepServing(1)}
              className="h-11 w-11 items-center justify-center"
            >
              <Plus size={18} color={colors.foreground} />
            </Pressable>
          </View>
          {fieldError('servingGrams')}
        </View>
      )}

      <View className="flex-row flex-wrap gap-2">
        {MACRO_FIELDS.map(([key, label]) => (
          <View key={key} className="w-[48%] gap-1">
            <DrawerInput
              label={label}
              labelClassName={cn('font-sans-semibold text-sm', MACRO_TONE[key])}
              filled
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={values[key]}
              onChangeText={set(key)}
              placeholder={key === 'kcal' ? '' : '0'}
            />
            {fieldError(key)}
          </View>
        ))}
      </View>
      {fieldError('macros')}

      {!editing && preview ? (
        <View className="flex-row items-center gap-2 rounded-pill bg-card px-4 py-2.5">
          <Check size={16} color={colors.primaryText} />
          <Text className="flex-1 text-[13px] text-foreground">{preview}</Text>
        </View>
      ) : null}

      <View className="gap-1">
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: linkBarcode }}
          accessibilityLabel="Vincular a um código de barras"
          onPress={() => {
            setLinkBarcode((on) => !on);
            setErrors((prev) => ({ ...prev, barcode: undefined }));
          }}
          className="min-h-[44px] flex-row items-center gap-2"
        >
          {linkBarcode ? (
            <Check size={20} color={colors.primaryText} />
          ) : (
            <Square size={20} color={colors.placeholder} />
          )}
          <Text className="text-sm text-foreground">Vincular a um código de barras</Text>
        </Pressable>
        {linkBarcode ? (
          <>
            <DrawerInput
              label="Código de barras (números embaixo das barras)"
              labelClassName="text-xs text-muted-foreground"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={14}
              value={values.barcode ?? ''}
              onChangeText={set('barcode')}
              placeholder="Ex.: 7891000100103"
              filled
            />
            {fieldError('barcode')}
            <Text className="text-xs text-muted-foreground">
              Ao ler esse código, o Fatia acha este alimento antes de procurar fora.
            </Text>
          </>
        ) : null}
      </View>

      <View className="rounded-card bg-card px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: microOpen }}
          onPress={() => setMicroOpen((open) => !open)}
          className="min-h-14 flex-row items-center gap-3"
        >
          <View className="flex-1">
            <Text className="text-sm font-bold text-foreground">Micronutrientes</Text>
            <Text className="text-xs text-muted-foreground">
              {filledCount
                ? `${filledCount} preenchido${filledCount === 1 ? '' : 's'}`
                : 'Fibra, sódio, açúcar e outros'}
            </Text>
          </View>
          <Text className="rounded-pill bg-muted px-2.5 py-0.5 font-sans-extrabold text-[11px] uppercase tracking-[0.4px] text-muted-foreground">
            opcional
          </Text>
          <ChevronDown size={16} color={colors.placeholder} />
        </Pressable>
        {microOpen ? (
          <View className="gap-2 border-t border-border pb-3 pt-2">
            {fields.map((field) => (
              <View key={field.key} className="min-h-14 flex-row items-center gap-3">
                <View className="flex-1 flex-row flex-wrap items-center gap-2">
                  <Text className="text-sm text-foreground">{field.label}</Text>
                  {field.mine ? (
                    <Text className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                      sua meta
                    </Text>
                  ) : null}
                </View>
                <View className="w-32 flex-row items-center gap-1">
                  <View className="flex-1">
                    <DrawerInput
                      label={field.label}
                      labelClassName="hidden"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="—"
                      value={nutrients[field.key] ?? ''}
                      onChangeText={(text) => setNutrient(field.key, text)}
                      style={{
                        borderWidth: 0,
                        borderRadius: 14,
                        backgroundColor: colors.muted,
                        textAlign: 'right',
                        fontFamily: 'Manrope_700Bold',
                      }}
                    />
                  </View>
                  <Text className="w-6 text-xs text-muted-foreground">{field.unit}</Text>
                </View>
              </View>
            ))}
            {errors.nutrients && Object.keys(errors.nutrients).length > 0 ? (
              <Text accessibilityRole="alert" className="text-xs text-destructive">
                {Object.entries(errors.nutrients)
                  .map(([key, msg]) => `${fields.find((f) => f.key === key)?.label ?? key}: ${msg}`)
                  .join(' ')}
              </Text>
            ) : null}
            {more.length > 0 ? (
              <View className="gap-2 pt-2">
                <Text className="text-xs text-muted-foreground">Adicionar outro do rótulo</Text>
                <View className="flex-row flex-wrap gap-2">
                  {more.map((field) => (
                    <Pressable
                      key={field.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Adicionar ${field.label}`}
                      onPress={() => setExtraKeys((prev) => [...prev, field.key])}
                      className="h-9 flex-row items-center gap-1.5 rounded-chip bg-muted px-3.5"
                    >
                      <Plus size={14} color={colors.placeholder} />
                      <Text className="font-sans-semibold text-sm text-foreground">
                        {field.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <Text className="text-xs text-muted-foreground">
        {editing
          ? 'Micronutrientes por 100 g, como os macros.'
          : `Valores na mesma base dos macros (${byServing ? 'por porção' : 'por 100 g'}).`}
      </Text>

      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      ) : null}

      <View className="flex-row gap-2">
        {saveOnly ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: pending }}
            disabled={pending}
            onPress={() => {
              const input = parse();
              if (input) saveOnly.onSubmit(input);
            }}
            className="h-14 flex-1 items-center justify-center rounded-pill bg-card"
          >
            <Text className="font-sans-bold text-[15px]">{saveOnly.label}</Text>
          </Pressable>
        ) : (
          <Button variant="outline" className="flex-1" onPress={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button
          className={cn(saveOnly ? 'h-14 flex-[1.6] rounded-pill' : 'flex-1')}
          onPress={() => {
            const input = parse();
            if (input) onSubmit(input);
          }}
          disabled={pending}
          loading={pending}
        >
          {submitLabel}
        </Button>
      </View>
      {footer}
    </DrawerScrollView>
  );
}

function BasisChip({
  checked,
  onPress,
  children,
}: {
  checked: boolean;
  onPress: () => void;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={children}
      onPress={onPress}
      className={cn(
        'h-11 min-w-[88px] items-center justify-center rounded-[10px] px-4',
        checked && 'bg-muted',
      )}
    >
      <Text
        className={cn(
          'font-sans-semibold text-[15px]',
          checked ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
}
