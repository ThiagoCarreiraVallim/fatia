import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import {
  ageFromBirthDate,
  draftFromPlanExercise,
  formatRest,
  heartRateZones,
  INTENSITY_OPTIONS,
  loadUnitLabel,
  nextSetKind,
  PLAN_LIMITS,
  planDraftToInput,
  REST_OPTIONS,
  rowsFromSimple,
  SET_KIND_LABEL,
  stepDecimal,
  TECHNIQUE_OPTIONS,
  validateDraft,
  type LoadUnit,
  type PlanExerciseDraft,
  type PlanExerciseInput,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import {
  Button,
  Chip,
  cn,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTextInput,
  DrawerTitle,
  Segmented,
  Switch,
  useConfirm,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/components/workout/plan-exercise-sheet.tsx` (#378):
 * variante A por padrão, série por série (B) atrás do interruptor e cardio (D).
 * Rascunho, validação e conversão vêm do api-client.
 */

interface Props {
  item: WorkoutPlanExercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadUnit: LoadUnit;
  birthDate: string | null;
  onSave: (input: PlanExerciseInput) => void;
  onRemove: () => void;
  saving?: boolean;
  error?: string | null;
}

const FIELD =
  'min-h-12 rounded-md border border-input bg-transparent px-3 text-center text-lg font-bold text-foreground';

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PlanExerciseSheet({ item, open, onOpenChange, ...rest }: Props) {
  return (
    <Drawer open={open && !!item} onOpenChange={onOpenChange} snapPoints={['92%']}>
      {/* Fechar sem salvar descarta o rascunho: nada é gravado até o Salvar. */}
      {item ? <SheetForm key={item.id} item={item} {...rest} /> : null}
    </Drawer>
  );
}

function SheetForm({
  item,
  loadUnit,
  birthDate,
  onSave,
  onRemove,
  saving,
  error,
}: Omit<Props, 'open' | 'item' | 'onOpenChange'> & { item: WorkoutPlanExercise }) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<PlanExerciseDraft>(() =>
    draftFromPlanExercise(item, loadUnit),
  );
  const errors = validateDraft(draft);
  const valid = Object.keys(errors).length === 0;
  const set = (patch: Partial<PlanExerciseDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const unit = loadUnitLabel(loadUnit);
  const subtitle = [item.exercise.muscleGroup, item.exercise.equipment].filter(Boolean).join(' · ');

  function askRemove() {
    confirm({
      title: 'Remover exercício?',
      description: `${item.exercise.name} sai deste plano. Os treinos já feitos continuam no histórico.`,
      confirmLabel: 'Remover',
      destructive: true,
      onConfirm: onRemove,
    });
  }

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{item.exercise.name}</DrawerTitle>
        <DrawerDescription className="capitalize">{subtitle}</DrawerDescription>
      </DrawerHeader>

      <DrawerScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
        <View className="gap-5 pb-6">
          {draft.cardio ? (
            <CardioFields draft={draft} set={set} error={errors.cardio} birthDate={birthDate} />
          ) : (
            <>
              <Segmented
                label="Contar por"
                options={[
                  { value: 'REPS', label: 'Repetições' },
                  { value: 'SECONDS', label: 'Segundos' },
                ]}
                value={draft.repUnit}
                onChange={(repUnit) => set({ repUnit })}
              />
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-foreground">
                  Configurar série por série
                </Text>
                <Switch
                  label="Configurar série por série"
                  checked={draft.perSet}
                  onCheckedChange={(perSet) =>
                    set(
                      perSet
                        ? { perSet, rows: draft.rows.length ? draft.rows : rowsFromSimple(draft) }
                        : { perSet },
                    )
                  }
                />
              </View>

              {draft.perSet ? (
                <PerSetTable draft={draft} set={set} unit={unit} error={errors.rows} />
              ) : (
                <>
                  <StepperField
                    label="Séries"
                    value={draft.sets}
                    onChange={(sets) => set({ sets })}
                    step={1}
                    min={1}
                    max={PLAN_LIMITS.sets}
                    numeric
                    decLabel="Menos uma série"
                    incLabel="Mais uma série"
                    error={errors.sets}
                  />
                  <View className="gap-1.5">
                    <SectionLabel>
                      {draft.repUnit === 'SECONDS' ? 'Segundos por série' : 'Repetições'}
                    </SectionLabel>
                    <View className="flex-row items-center gap-2">
                      <DrawerTextInput
                        accessibilityLabel={
                          draft.repUnit === 'SECONDS' ? 'Segundos mínimos' : 'Repetições mínimas'
                        }
                        keyboardType="number-pad"
                        value={draft.repsMin}
                        onChangeText={(repsMin) => set({ repsMin })}
                        selectionColor={colors.primaryText}
                        className={cn(FIELD, 'flex-1')}
                      />
                      <Text className="text-muted-foreground">a</Text>
                      <DrawerTextInput
                        accessibilityLabel={
                          draft.repUnit === 'SECONDS' ? 'Segundos máximos' : 'Repetições máximas'
                        }
                        keyboardType="number-pad"
                        value={draft.repsMax}
                        onChangeText={(repsMax) => set({ repsMax })}
                        selectionColor={colors.primaryText}
                        className={cn(FIELD, 'flex-1')}
                      />
                    </View>
                    {errors.reps ? <FieldError>{errors.reps}</FieldError> : null}
                  </View>
                </>
              )}

              <View className="gap-2">
                <Segmented
                  label="Tipo de carga"
                  options={[
                    { value: 'WEIGHT', label: unit },
                    { value: 'BODYWEIGHT', label: 'Peso do corpo' },
                  ]}
                  value={draft.loadMode}
                  onChange={(loadMode) => set({ loadMode })}
                />
                {!draft.perSet ? (
                  <StepperField
                    label={
                      draft.loadMode === 'BODYWEIGHT'
                        ? `Carga extra (${unit})`
                        : `Carga inicial (${unit})`
                    }
                    value={draft.startLoad}
                    onChange={(startLoad) => set({ startLoad })}
                    step={loadUnit === 'LB' ? 5 : 2.5}
                    min={0}
                    max={PLAN_LIMITS.loadKg}
                    decLabel="Diminuir carga"
                    incLabel="Aumentar carga"
                    placeholder="opcional"
                    error={errors.startLoad}
                  />
                ) : null}
              </View>

              <View className="gap-2">
                <SectionLabel>Descanso</SectionLabel>
                <View className="flex-row flex-wrap gap-2">
                  {REST_OPTIONS.map((sec) => (
                    <Chip
                      key={sec}
                      label={formatRest(sec)}
                      selected={draft.rest.trim() === String(sec)}
                      onPress={() => set({ rest: String(sec) })}
                    />
                  ))}
                </View>
                <DrawerTextInput
                  accessibilityLabel="Descanso (segundos)"
                  keyboardType="number-pad"
                  placeholder="ou digite em segundos (vazio = padrão)"
                  placeholderTextColor={colors.placeholder}
                  value={draft.rest}
                  onChangeText={(rest) => set({ rest })}
                  selectionColor={colors.primaryText}
                  className="min-h-11 rounded-md border border-input px-3 text-sm text-foreground"
                />
                {errors.rest ? <FieldError>{errors.rest}</FieldError> : null}
              </View>

              <View className="gap-2">
                <SectionLabel>Técnica</SectionLabel>
                <View className="flex-row flex-wrap gap-2">
                  {TECHNIQUE_OPTIONS.map((t) => (
                    <Chip
                      key={t.value}
                      label={t.label}
                      selected={draft.technique === t.value}
                      onPress={() => set({ technique: t.value })}
                    />
                  ))}
                </View>
                <Text className="text-xs text-muted-foreground">
                  {TECHNIQUE_OPTIONS.find((t) => t.value === draft.technique)?.description}
                </Text>
              </View>

              <View className="gap-1.5">
                <SectionLabel>Observação</SectionLabel>
                <DrawerTextInput
                  accessibilityLabel="Observação"
                  multiline
                  maxLength={PLAN_LIMITS.notes}
                  value={draft.notes}
                  onChangeText={(notes) => set({ notes })}
                  placeholder="Ex.: banco no 3, pegada aberta"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.primaryText}
                  className="min-h-16 rounded-md border border-input px-3 py-2 text-sm text-foreground"
                />
              </View>
            </>
          )}
        </View>
      </DrawerScrollView>

      <DrawerFooter className="pb-4">
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {error}
          </Text>
        ) : null}
        <Button
          className="h-12 rounded-full"
          disabled={!valid}
          loading={saving}
          onPress={() => valid && !saving && onSave(planDraftToInput(draft, loadUnit))}
        >
          Salvar
        </Button>
        <Button variant="ghost" textClassName="text-danger" onPress={askRemove}>
          Remover do plano
        </Button>
      </DrawerFooter>
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

function FieldError({ children }: { children: string }) {
  return <Text className="text-xs font-semibold text-danger">{children}</Text>;
}

function StepperField({
  label,
  value,
  onChange,
  step,
  min,
  max,
  numeric,
  decLabel,
  incLabel,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  min: number;
  max: number;
  numeric?: boolean;
  decLabel: string;
  incLabel: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <View className="gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      <View className="flex-row items-center gap-2 rounded-field bg-muted p-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={decLabel}
          onPress={() => onChange(stepDecimal(value, -1, { step, min, max }))}
          className="h-11 w-11 items-center justify-center rounded-[12px] bg-card"
        >
          <Minus size={18} color={colors.foreground} />
        </Pressable>
        <DrawerTextInput
          accessibilityLabel={label}
          keyboardType={numeric ? 'number-pad' : 'decimal-pad'}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          onChangeText={onChange}
          selectionColor={colors.primaryText}
          className="min-h-11 flex-1 text-center text-lg font-bold text-foreground"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={incLabel}
          onPress={() => onChange(stepDecimal(value, 1, { step, min, max }))}
          className="h-11 w-11 items-center justify-center rounded-[12px] bg-primary"
        >
          <Plus size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

function PerSetTable({
  draft,
  set,
  unit,
  error,
}: {
  draft: PlanExerciseDraft;
  set: (p: Partial<PlanExerciseDraft>) => void;
  unit: string;
  error?: string;
}) {
  const update = (i: number, patch: Partial<PlanExerciseDraft['rows'][number]>) =>
    set({ rows: draft.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const repsWord = draft.repUnit === 'SECONDS' ? 'Segundos' : 'Repetições';
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <Text className="w-6 text-[10px] font-bold uppercase text-muted-foreground">#</Text>
        <Text className="w-20 text-[10px] font-bold uppercase text-muted-foreground">Tipo</Text>
        <Text className="flex-1 text-[10px] font-bold uppercase text-muted-foreground">
          {draft.repUnit === 'SECONDS' ? 'Seg.' : 'Reps'}
        </Text>
        <Text className="flex-1 text-[10px] font-bold uppercase text-muted-foreground">
          Carga ({unit})
        </Text>
        <View className="w-11" />
      </View>
      {draft.rows.map((row, i) => (
        <View key={i} className="flex-row items-center gap-2">
          <Text className="w-6 text-sm font-bold text-foreground">{i + 1}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Série ${i + 1}: ${SET_KIND_LABEL[row.kind]}`}
            accessibilityHint="Toque para trocar o tipo"
            onPress={() => update(i, { kind: nextSetKind(row.kind) })}
            className={cn(
              'h-11 w-20 items-center justify-center rounded-[10px]',
              row.kind === 'WARMUP'
                ? 'bg-water/15'
                : row.kind === 'DROP'
                  ? 'bg-danger/15'
                  : 'bg-muted',
            )}
          >
            <Text
              className={cn(
                'text-xs font-bold',
                row.kind === 'WARMUP'
                  ? 'text-water'
                  : row.kind === 'DROP'
                    ? 'text-danger'
                    : 'text-foreground',
              )}
            >
              {SET_KIND_LABEL[row.kind]}
            </Text>
          </Pressable>
          <DrawerTextInput
            accessibilityLabel={`${repsWord} da série ${i + 1}`}
            keyboardType="number-pad"
            value={row.reps}
            onChangeText={(reps) => update(i, { reps })}
            selectionColor={colors.primaryText}
            className="min-h-11 flex-1 rounded-md border border-input text-center text-foreground"
          />
          <DrawerTextInput
            accessibilityLabel={`Carga da série ${i + 1} (${unit})`}
            keyboardType="decimal-pad"
            value={row.load}
            onChangeText={(load) => update(i, { load })}
            selectionColor={colors.primaryText}
            className="min-h-11 flex-1 rounded-md border border-input text-center text-foreground"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remover série ${i + 1}`}
            accessibilityState={{ disabled: draft.rows.length <= 1 }}
            disabled={draft.rows.length <= 1}
            onPress={() => set({ rows: draft.rows.filter((_, k) => k !== i) })}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <Trash2 size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ))}
      {error ? <FieldError>{error}</FieldError> : null}
      <Button
        variant="outline"
        size="sm"
        disabled={draft.rows.length >= PLAN_LIMITS.perSetRows}
        onPress={() => {
          const last = draft.rows[draft.rows.length - 1];
          set({
            rows: [...draft.rows, last ? { ...last } : { kind: 'NORMAL', reps: '10', load: '' }],
          });
        }}
      >
        Adicionar série
      </Button>
      <Text className="text-xs text-muted-foreground">
        Toque no tipo para alternar entre aquecimento, normal e drop.
      </Text>
    </View>
  );
}

function CardioFields({
  draft,
  set,
  error,
  birthDate,
}: {
  draft: PlanExerciseDraft;
  set: (p: Partial<PlanExerciseDraft>) => void;
  error?: string;
  birthDate: string | null;
}) {
  const zones = heartRateZones(birthDate ? ageFromBirthDate(birthDate, todayLocal()) : null);
  return (
    <>
      <Segmented
        label="Meta"
        options={[
          { value: 'TIME', label: 'Tempo' },
          { value: 'DISTANCE', label: 'Distância' },
        ]}
        value={draft.cardioTarget}
        onChange={(cardioTarget) => set({ cardioTarget })}
      />
      {draft.cardioTarget === 'TIME' ? (
        <StepperField
          label="Duração (min)"
          value={draft.cardioMinutes}
          onChange={(cardioMinutes) => set({ cardioMinutes })}
          step={5}
          min={1}
          max={PLAN_LIMITS.cardioMinutes}
          decLabel="Menos 5 minutos"
          incLabel="Mais 5 minutos"
          error={error}
        />
      ) : (
        <StepperField
          label="Distância (km)"
          value={draft.cardioKm}
          onChange={(cardioKm) => set({ cardioKm })}
          step={0.5}
          min={0.5}
          max={PLAN_LIMITS.cardioKm}
          decLabel="Menos meio quilômetro"
          incLabel="Mais meio quilômetro"
          error={error}
        />
      )}
      <View className="gap-2">
        <SectionLabel>Intensidade</SectionLabel>
        <View className="flex-row gap-2">
          {INTENSITY_OPTIONS.map((o) => {
            const on = draft.cardioIntensity === o.value;
            const bpm = zones ? `${zones[o.value][0]}–${zones[o.value][1]} bpm` : null;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                accessibilityLabel={bpm ? `${o.label}, ${bpm}` : o.label}
                accessibilityState={{ selected: on }}
                onPress={() => set({ cardioIntensity: on ? null : o.value })}
                className={cn(
                  'min-h-14 flex-1 items-center justify-center rounded-[12px] px-2 py-2',
                  on ? 'bg-foreground' : 'bg-muted',
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-semibold',
                    on ? 'text-background' : 'text-muted-foreground',
                  )}
                >
                  {o.label}
                </Text>
                {bpm ? (
                  <Text
                    className={cn('text-[11px]', on ? 'text-background' : 'text-muted-foreground')}
                  >
                    {bpm}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {!zones ? (
          <Text className="text-xs text-muted-foreground">
            Para ver a faixa de batimentos de cada intensidade, informe sua data de nascimento no
            perfil.
          </Text>
        ) : null}
      </View>
      <Text className="text-xs text-muted-foreground">
        No início ou no fim do treino? Mova o cardio na lista do plano.
      </Text>
    </>
  );
}
