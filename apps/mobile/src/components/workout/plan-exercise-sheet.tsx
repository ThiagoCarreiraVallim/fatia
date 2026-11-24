import { useState, type ReactNode } from 'react';
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
  useDiscardGuard,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { ExerciseGroupLine, ExerciseThumb } from './plan-exercise-row';

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

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PlanExerciseSheet({ item, open, onOpenChange, ...rest }: Props) {
  return (
    <Drawer open={open && !!item} onOpenChange={onOpenChange} snapPoints={['85%']}>
      {/* Nada é gravado até o Salvar; fechar com mudança pergunta antes (`useDiscardGuard`). */}
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
  const [initial] = useState<PlanExerciseDraft>(() => draftFromPlanExercise(item, loadUnit));
  const [draft, setDraft] = useState<PlanExerciseDraft>(initial);
  // Mexeu e não salvou: arrastar para baixo ou tocar fora pergunta antes (#483).
  useDiscardGuard(JSON.stringify(draft) !== JSON.stringify(initial));
  const errors = validateDraft(draft);
  const valid = Object.keys(errors).length === 0;
  const set = (patch: Partial<PlanExerciseDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const unit = loadUnitLabel(loadUnit);
  const loadStep = loadUnit === 'LB' ? 5 : 2.5;
  const seconds = draft.repUnit === 'SECONDS';
  const repStep = { step: seconds ? 5 : 1, min: 1, max: PLAN_LIMITS.reps };

  function askRemove() {
    confirm({
      title: 'Remover exercício?',
      description: `${item.exercise.name} sai deste plano. Os treinos já feitos continuam no histórico.`,
      confirmLabel: 'Remover',
      destructive: true,
      onConfirm: onRemove,
    });
  }

  function save() {
    if (!valid || saving) return;
    onSave(planDraftToInput(draft, loadUnit));
  }

  return (
    <>
      <DrawerHeader>
        <View className="flex-row items-center gap-3">
          <ExerciseThumb group={item.exercise.muscleGroup} />
          <View className="min-w-0 flex-1 gap-1">
            <DrawerTitle className="font-display text-[22px] leading-7">
              {item.exercise.name}
            </DrawerTitle>
            <ExerciseGroupLine group={item.exercise.muscleGroup} detail={item.exercise.equipment} />
          </View>
        </View>
        <DrawerDescription className="h-0 opacity-0">
          {[item.exercise.muscleGroup, item.exercise.equipment].filter(Boolean).join(' · ')}
        </DrawerDescription>
      </DrawerHeader>

      <DrawerScrollView
        showsVerticalScrollIndicator={false}
        className="flex-1 px-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4 pb-6 pt-1">
          {draft.cardio ? (
            <CardioFields draft={draft} set={set} error={errors.cardio} birthDate={birthDate} />
          ) : (
            <>
              {/* Como conta e em que carga (Al-T21, primeiro card). */}
              <View className="gap-3 rounded-[20px] bg-card p-4">
                <ConfigRow title="Repetição" hint="como você conta">
                  <Segmented
                    label="Contar por"
                    className="w-40 bg-muted"
                    options={[
                      { value: 'REPS', label: 'reps' },
                      { value: 'SECONDS', label: 'tempo' },
                    ]}
                    value={draft.repUnit}
                    onChange={(repUnit) => set({ repUnit })}
                  />
                </ConfigRow>
                <ConfigRow title="Carga" hint="unidade">
                  <Segmented
                    label="Tipo de carga"
                    className="w-52 bg-muted"
                    options={[
                      { value: 'WEIGHT', label: unit },
                      { value: 'BODYWEIGHT', label: 'peso do corpo' },
                    ]}
                    value={draft.loadMode}
                    onChange={(loadMode) => set({ loadMode })}
                  />
                </ConfigRow>
                <ConfigRow title="Série por série" hint="cada série com sua meta">
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
                </ConfigRow>
              </View>

              {draft.perSet ? (
                <PerSetTable draft={draft} set={set} unit={unit} error={errors.rows} />
              ) : (
                <View className="rounded-[20px] bg-card px-4">
                  <StepRow title="Séries" error={errors.sets}>
                    <Stepper
                      label="Séries"
                      value={draft.sets}
                      onChange={(sets) => set({ sets })}
                      step={1}
                      min={1}
                      max={PLAN_LIMITS.sets}
                      numeric
                      decLabel="Menos uma série"
                      incLabel="Mais uma série"
                      invalid={!!errors.sets}
                    />
                  </StepRow>
                  <StepRow
                    title={seconds ? 'Tempo' : 'Repetições'}
                    hint={seconds ? 'segundos por série' : 'faixa alvo'}
                    error={errors.reps}
                  >
                    <View className="flex-row items-center gap-0.5">
                      <Stepper
                        label={seconds ? 'Segundos mínimos' : 'Repetições mínimas'}
                        value={draft.repsMin}
                        onChange={(repsMin) => set({ repsMin })}
                        {...repStep}
                        numeric
                        compact
                        decLabel="Diminuir o mínimo"
                        incLabel="Aumentar o mínimo"
                        invalid={!!errors.reps}
                      />
                      <Text className="text-sm text-faint">a</Text>
                      <Stepper
                        label={seconds ? 'Segundos máximos' : 'Repetições máximas'}
                        value={draft.repsMax}
                        onChange={(repsMax) => set({ repsMax })}
                        {...repStep}
                        numeric
                        compact
                        decLabel="Diminuir o máximo"
                        incLabel="Aumentar o máximo"
                        invalid={!!errors.reps}
                      />
                    </View>
                  </StepRow>
                  <StepRow
                    last
                    title={draft.loadMode === 'BODYWEIGHT' ? 'Carga extra' : 'Carga inicial'}
                    hint={draft.loadMode === 'BODYWEIGHT' ? 'peso do corpo + extra' : 'opcional'}
                    error={errors.startLoad}
                  >
                    <Stepper
                      label={
                        draft.loadMode === 'BODYWEIGHT'
                          ? `Carga extra (${unit})`
                          : `Carga inicial (${unit})`
                      }
                      value={draft.startLoad}
                      onChange={(startLoad) => set({ startLoad })}
                      step={loadStep}
                      min={0}
                      max={PLAN_LIMITS.loadKg}
                      suffix={` ${unit}`}
                      placeholder="—"
                      decLabel="Diminuir carga"
                      incLabel="Aumentar carga"
                      invalid={!!errors.startLoad}
                    />
                  </StepRow>
                </View>
              )}

              <View className="gap-2">
                <Text className="px-1 text-[13px] text-muted-foreground">
                  Descanso entre séries
                </Text>
                <View className="flex-row gap-2">
                  {REST_OPTIONS.map((sec) => {
                    const on = draft.rest.trim() === String(sec);
                    return (
                      <Pressable
                        key={sec}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => set({ rest: String(sec) })}
                        className={cn(
                          'h-[46px] flex-1 items-center justify-center rounded-[14px] active:opacity-80',
                          on ? 'bg-foreground' : 'bg-card',
                        )}
                      >
                        <Text
                          className={cn(
                            'font-sans-semibold text-[15px]',
                            on ? 'text-background' : 'text-muted-foreground',
                          )}
                        >
                          {formatRest(sec)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* Além dos atalhos, o descanso é digitável (vazio = o padrão da sessão). */}
                <DrawerTextInput
                  accessibilityLabel="Descanso (segundos)"
                  keyboardType="number-pad"
                  placeholder="ou digite em segundos"
                  placeholderTextColor={colors.placeholder}
                  value={draft.rest}
                  onChangeText={(rest) => set({ rest })}
                  selectionColor={colors.primaryText}
                  className="min-h-11 rounded-[14px] bg-card px-4 text-sm text-foreground"
                />
                {errors.rest ? <FieldError>{errors.rest}</FieldError> : null}
              </View>

              <View className="gap-2">
                <Text className="px-1 text-[13px] text-muted-foreground">Técnica</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TECHNIQUE_OPTIONS.map((t) => {
                    const on = draft.technique === t.value;
                    return (
                      <Pressable
                        key={t.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => set({ technique: t.value })}
                        className={cn(
                          'h-[42px] items-center justify-center rounded-[14px] px-4 active:opacity-80',
                          on ? 'bg-foreground' : 'bg-card',
                        )}
                      >
                        <Text
                          className={cn(
                            'font-sans-semibold text-[15px]',
                            on ? 'text-background' : 'text-muted-foreground',
                          )}
                        >
                          {t.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="px-1 text-xs text-faint">
                  {TECHNIQUE_OPTIONS.find((t) => t.value === draft.technique)?.description}
                </Text>
              </View>

              <View className="gap-1.5">
                <DrawerTextInput
                  accessibilityLabel="Observação"
                  maxLength={PLAN_LIMITS.notes}
                  value={draft.notes}
                  onChangeText={(notes) => set({ notes })}
                  placeholder="Observação: pegada, banco, cadência…"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.primaryText}
                  className="min-h-14 rounded-[20px] bg-card px-4 text-[15px] text-foreground"
                />
                {errors.notes ? <FieldError>{errors.notes}</FieldError> : null}
              </View>
            </>
          )}
        </View>
      </DrawerScrollView>

      <DrawerFooter className="pb-8">
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {error}
          </Text>
        ) : null}
        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remover do plano"
            onPress={askRemove}
            className="h-14 w-14 items-center justify-center rounded-[16px] active:opacity-80"
            style={{ backgroundColor: `${colors.danger}26` }}
          >
            <Trash2 size={18} color={colors.danger} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid || !!saving }}
            disabled={!valid || saving}
            onPress={save}
            className={cn(
              'h-14 flex-1 items-center justify-center rounded-pill bg-foreground active:opacity-80',
              (!valid || saving) && 'opacity-40',
            )}
          >
            <Text className="font-sans-bold text-[15px] text-background">
              {saving ? 'Salvando...' : 'Salvar'}
            </Text>
          </Pressable>
        </View>
      </DrawerFooter>
    </>
  );
}

function FieldError({ children }: { children: string }) {
  return <Text className="font-sans-semibold text-xs text-danger">{children}</Text>;
}

/** Linha do primeiro card: nome e dica à esquerda, o controle à direita. */
function ConfigRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 shrink">
        <Text className="font-sans-bold text-[15px] text-foreground">{title}</Text>
        <Text className="text-xs text-faint">{hint}</Text>
      </View>
      {children}
    </View>
  );
}

/** Linha do card dos números (Séries, Repetições, Carga), separada por um fio. */
function StepRow({
  title,
  hint,
  error,
  last,
  children,
}: {
  title: string;
  hint?: string;
  error?: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <View className={cn('py-3.5', !last && 'border-b border-border')}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="shrink-0">
          <Text className="font-sans-bold text-base text-foreground">{title}</Text>
          {hint ? <Text className="text-xs text-faint">{hint}</Text> : null}
        </View>
        {children}
      </View>
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

/**
 * O −/número/+ do canvas: botões redondos e o número no meio, que continua
 * digitável (teclado numérico). Igual ao `Stepper` do PWA.
 */
function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  numeric,
  compact,
  decLabel,
  incLabel,
  placeholder,
  suffix,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  min: number;
  max: number;
  numeric?: boolean;
  compact?: boolean;
  decLabel: string;
  incLabel: string;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
}) {
  const round = cn(
    'items-center justify-center rounded-full bg-muted active:opacity-80',
    compact ? 'h-8 w-8' : 'h-11 w-11',
  );
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decLabel}
        onPress={() => onChange(stepDecimal(value, -1, { step, min, max }))}
        hitSlop={compact ? 4 : 0}
        className={round}
      >
        <Minus size={compact ? 16 : 18} color={colors.foreground} />
      </Pressable>
      <View className="flex-row items-baseline justify-center">
        <DrawerTextInput
          accessibilityLabel={label}
          keyboardType={numeric ? 'number-pad' : 'decimal-pad'}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          onChangeText={onChange}
          selectionColor={colors.primaryText}
          className={cn(
            'min-h-10 bg-transparent p-0 text-center font-sans-bold text-lg',
            invalid ? 'text-danger' : 'text-foreground',
            compact ? 'w-8' : 'w-12',
            // Com unidade, o número encosta nela ("20 min"), sem o vão do centro.
            suffix && value.trim() && 'text-right',
          )}
        />
        {suffix && value.trim() ? (
          <Text className="ml-1 font-sans-bold text-lg text-foreground">{suffix.trim()}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={incLabel}
        onPress={() => onChange(stepDecimal(value, 1, { step, min, max }))}
        hitSlop={compact ? 4 : 0}
        className={round}
      >
        <Plus size={compact ? 16 : 18} color={colors.foreground} />
      </Pressable>
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
  const loadStep = unit === 'lb' ? 5 : 2.5;
  const last = draft.rows.length;
  return (
    <View className="gap-2">
      <View className="rounded-[20px] bg-card px-3">
        <View className="flex-row items-center gap-2 border-b border-border py-3">
          <Text className="w-5 text-[13px] text-faint">#</Text>
          <Text className="w-[68px] text-[13px] text-faint">tipo</Text>
          <Text className="flex-1 text-center text-[13px] text-faint">
            {draft.repUnit === 'SECONDS' ? 'seg' : 'reps'}
          </Text>
          <Text className="flex-1 text-center text-[13px] text-faint">{unit}</Text>
        </View>
        {draft.rows.map((row, i) => (
          <View key={i} className="flex-row items-center gap-2 border-b border-border py-3">
            <Text className="w-5 text-sm text-faint">{i + 1}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Série ${i + 1}: ${SET_KIND_LABEL[row.kind]}`}
              accessibilityHint="Toque para trocar o tipo"
              onPress={() => update(i, { kind: nextSetKind(row.kind) })}
              className={cn(
                'h-8 w-[68px] items-center justify-center rounded-pill',
                row.kind === 'NORMAL' && 'bg-brand',
              )}
              style={row.kind === 'DROP' ? { backgroundColor: `${colors.warning}29` } : undefined}
            >
              <Text
                className={cn(
                  'font-sans-extrabold text-[10px] uppercase tracking-[0.4px]',
                  row.kind === 'NORMAL'
                    ? 'text-brand-foreground'
                    : row.kind === 'DROP'
                      ? 'text-warning'
                      : 'text-muted-foreground',
                )}
              >
                {SET_KIND_LABEL[row.kind]}
              </Text>
            </Pressable>
            <View className="flex-1 items-center">
              <Stepper
                label={`${repsWord} da série ${i + 1}`}
                value={row.reps}
                onChange={(reps) => update(i, { reps })}
                step={1}
                min={1}
                max={PLAN_LIMITS.reps}
                numeric
                compact
                decLabel={`Menos na série ${i + 1}`}
                incLabel={`Mais na série ${i + 1}`}
              />
            </View>
            <View className="flex-1 items-center">
              <Stepper
                label={`Carga da série ${i + 1} (${unit})`}
                value={row.load}
                onChange={(load) => update(i, { load })}
                step={loadStep}
                min={0}
                max={PLAN_LIMITS.loadKg}
                compact
                placeholder="—"
                decLabel={`Menos carga na série ${i + 1}`}
                incLabel={`Mais carga na série ${i + 1}`}
              />
            </View>
          </View>
        ))}
        <View className="min-h-14 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adicionar série"
            accessibilityState={{ disabled: last >= PLAN_LIMITS.perSetRows }}
            disabled={last >= PLAN_LIMITS.perSetRows}
            onPress={() => {
              const prev = draft.rows[draft.rows.length - 1];
              set({
                rows: [
                  ...draft.rows,
                  prev ? { ...prev } : { kind: 'NORMAL', reps: '10', load: '' },
                ],
              });
            }}
            className={cn(
              'h-11 flex-row items-center gap-2',
              last >= PLAN_LIMITS.perSetRows && 'opacity-40',
            )}
          >
            <Plus size={16} color={colors.primaryText} />
            <Text className="font-sans-bold text-[15px] text-primary">Série</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remover série ${last}`}
            accessibilityState={{ disabled: last <= 1 }}
            disabled={last <= 1}
            onPress={() => set({ rows: draft.rows.slice(0, -1) })}
            className={cn('h-11 justify-center', last <= 1 && 'opacity-40')}
          >
            <Text className="font-sans-semibold text-[15px] text-muted-foreground">
              Tirar a última
            </Text>
          </Pressable>
        </View>
      </View>
      {error ? <FieldError>{error}</FieldError> : null}
      <Text className="px-1 text-xs text-faint">
        Toque no tipo para trocar entre aquecimento, normal e drop. Pirâmide: cada série com sua
        meta.
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
      <View className="gap-2">
        <Text className="px-1 text-[13px] text-muted-foreground">Meta por</Text>
        <Segmented
          label="Meta"
          className="bg-card"
          options={[
            { value: 'TIME', label: 'Tempo' },
            { value: 'DISTANCE', label: 'Distância' },
          ]}
          value={draft.cardioTarget}
          onChange={(cardioTarget) => set({ cardioTarget })}
        />
      </View>
      <View className="rounded-[20px] bg-card px-4">
        {draft.cardioTarget === 'TIME' ? (
          <StepRow last title="Duração" error={error}>
            <Stepper
              label="Duração (min)"
              value={draft.cardioMinutes}
              onChange={(cardioMinutes) => set({ cardioMinutes })}
              step={5}
              min={1}
              max={PLAN_LIMITS.cardioMinutes}
              suffix=" min"
              decLabel="Menos 5 minutos"
              incLabel="Mais 5 minutos"
              invalid={!!error}
            />
          </StepRow>
        ) : (
          <StepRow last title="Distância" error={error}>
            <Stepper
              label="Distância (km)"
              value={draft.cardioKm}
              onChange={(cardioKm) => set({ cardioKm })}
              step={0.5}
              min={0.5}
              max={PLAN_LIMITS.cardioKm}
              suffix=" km"
              decLabel="Menos meio quilômetro"
              incLabel="Mais meio quilômetro"
              invalid={!!error}
            />
          </StepRow>
        )}
      </View>
      <View className="gap-2">
        <Text className="px-1 text-[13px] text-muted-foreground">Intensidade</Text>
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
                className="min-h-[60px] flex-1 items-center justify-center gap-0.5 rounded-[18px] px-2 py-2 active:opacity-80"
                style={
                  on
                    ? {
                        backgroundColor: `${colors.primary}1f`,
                        borderWidth: 2,
                        borderColor: colors.primary,
                      }
                    : { backgroundColor: colors.card }
                }
              >
                <Text className="font-sans-bold text-base text-foreground">{o.label}</Text>
                {bpm ? <Text className="text-xs text-muted-foreground">{bpm}</Text> : null}
              </Pressable>
            );
          })}
        </View>
        <Text className="px-1 text-xs text-faint">
          {zones
            ? 'Faixa de FC calculada pela sua idade. Aparece na sessão como guia.'
            : 'Para ver a faixa de batimentos de cada intensidade, informe sua data de nascimento no perfil.'}
        </Text>
      </View>
      {/* Desvio do Al-T21d: o "Quando" (início ou fim) é a posição na lista do plano. */}
      <Text className="px-1 text-xs text-faint">
        No início ou no fim do treino? Mova o cardio na lista do plano.
      </Text>
    </>
  );
}
