'use client';

import { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Segmented, Switch } from '@/components/ui/selection';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { ExerciseGroupLine, ExerciseThumb } from './plan-exercise-row';

interface Props {
  item: WorkoutPlanExercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadUnit: LoadUnit;
  /** Para a faixa de batimentos do cardio; sem ela, a tela não inventa número. */
  birthDate: string | null;
  onSave: (input: PlanExerciseInput) => void;
  onRemove: () => void;
  saving?: boolean;
  removing?: boolean;
  error?: string | null;
}

/**
 * Configurar exercício do plano (#378). Variante A da prancha por padrão
 * (Al-T21), a tabela série por série da B atrás do interruptor (Al-T21b) e a D
 * para cardio (Al-T21d). Rascunho, validação e conversão vêm do api-client —
 * os mesmos do app.
 */
export function PlanExerciseSheet({ item, open, onOpenChange, ...rest }: Props) {
  return (
    <Drawer open={open && !!item} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        {/* Fechar sem salvar descarta o rascunho: nada é gravado até o Salvar. */}
        {item && <SheetForm key={item.id} item={item} {...rest} />}
      </DrawerContent>
    </Drawer>
  );
}

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function SheetForm({
  item,
  loadUnit,
  birthDate,
  onSave,
  onRemove,
  saving,
  removing,
  error,
}: Omit<Props, 'open' | 'item' | 'onOpenChange'> & { item: WorkoutPlanExercise }) {
  const [draft, setDraft] = useState<PlanExerciseDraft>(() =>
    draftFromPlanExercise(item, loadUnit),
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  const errors = validateDraft(draft);
  const valid = Object.keys(errors).length === 0;
  const set = (patch: Partial<PlanExerciseDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const unit = loadUnitLabel(loadUnit);
  const loadStep = loadUnit === 'LB' ? 5 : 2.5;
  const seconds = draft.repUnit === 'SECONDS';
  const repStep = { step: seconds ? 5 : 1, min: 1, max: PLAN_LIMITS.reps };

  function save() {
    if (!valid || saving) return;
    onSave(planDraftToInput(draft, loadUnit));
  }

  return (
    <>
      <DrawerHeader className="flex flex-row items-center gap-3 px-0 pt-3">
        <ExerciseThumb group={item.exercise.muscleGroup} />
        <span className="min-w-0 flex-1 space-y-1">
          <DrawerTitle className="font-display text-[22px] font-bold leading-tight">
            {item.exercise.name}
          </DrawerTitle>
          <DrawerDescription asChild>
            <span className="block">
              <ExerciseGroupLine
                group={item.exercise.muscleGroup}
                detail={item.exercise.equipment}
              />
            </span>
          </DrawerDescription>
        </span>
      </DrawerHeader>

      <div className="max-h-[62vh] space-y-4 overflow-y-auto py-3">
        {draft.cardio ? (
          <CardioFields draft={draft} set={set} error={errors.cardio} birthDate={birthDate} />
        ) : (
          <>
            {/* Como conta e em que carga (Al-T21, primeiro card). */}
            <div className="space-y-3 rounded-[20px] bg-muted p-4">
              <ConfigRow title="Repetição" hint="como você conta">
                <Segmented
                  label="Contar por"
                  className="w-44 bg-card"
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
                  className="w-56 bg-card"
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
            </div>

            {draft.perSet ? (
              <PerSetTable draft={draft} set={set} unit={unit} error={errors.rows} />
            ) : (
              <div className="rounded-[20px] bg-muted px-4">
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
                  <span className="flex min-w-0 items-center gap-0.5">
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
                    <span className="text-sm text-faint">a</span>
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
                  </span>
                </StepRow>
                <StepRow
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
              </div>
            )}

            <div className="space-y-2">
              <p className="px-1 text-[13px] text-muted-foreground">Descanso entre séries</p>
              <div className="grid grid-cols-5 gap-2">
                {REST_OPTIONS.map((sec) => {
                  const on = draft.rest.trim() === String(sec);
                  return (
                    <button
                      key={sec}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ rest: String(sec) })}
                      className={cn(
                        'anim-press h-[46px] rounded-[14px] text-[15px] font-semibold',
                        on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {formatRest(sec)}
                    </button>
                  );
                })}
              </div>
              {/* Além dos atalhos, o descanso é digitável (vazio = o padrão da sessão). */}
              <input
                aria-label="Descanso (segundos)"
                inputMode="numeric"
                placeholder="ou digite em segundos"
                value={draft.rest}
                onChange={(e) => set({ rest: e.target.value })}
                aria-invalid={!!errors.rest}
                className="h-11 w-full rounded-[14px] bg-muted px-4 text-sm text-foreground outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary"
              />
              {errors.rest && <FieldError>{errors.rest}</FieldError>}
            </div>

            <div className="space-y-2">
              <p className="px-1 text-[13px] text-muted-foreground">Técnica</p>
              <div className="flex flex-wrap gap-2">
                {TECHNIQUE_OPTIONS.map((t) => {
                  const on = draft.technique === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ technique: t.value })}
                      className={cn(
                        'anim-press h-[42px] rounded-[14px] px-4 text-[15px] font-semibold',
                        on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <p className="px-1 text-xs text-faint">
                {TECHNIQUE_OPTIONS.find((t) => t.value === draft.technique)?.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <input
                id="plan-exercise-notes"
                aria-label="Observação"
                value={draft.notes}
                maxLength={PLAN_LIMITS.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Observação: pegada, banco, cadência…"
                className="h-14 w-full rounded-[20px] bg-muted px-4 text-[15px] text-foreground outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary"
              />
              {errors.notes && <FieldError>{errors.notes}</FieldError>}
            </div>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          aria-label="Remover do plano"
          onClick={() => setConfirmRemove(true)}
          className="anim-press flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-danger/15 text-danger"
        >
          <Trash2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          disabled={!valid || saving}
          onClick={save}
          className="anim-press flex h-14 flex-1 items-center justify-center rounded-pill bg-foreground text-[15px] font-bold text-background disabled:opacity-40"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remover exercício?"
        description={`${item.exercise.name} sai deste plano. Os treinos já feitos continuam no histórico.`}
        pending={removing}
        onConfirm={() => {
          onRemove();
          setConfirmRemove(false);
        }}
      />
    </>
  );
}

function FieldError({ children }: { children: string }) {
  return <p className="text-xs font-semibold text-danger">{children}</p>;
}

/** Linha do primeiro card: nome e dica à esquerda, o controle à direita. */
function ConfigRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-xs text-faint">{hint}</span>
      </span>
      {children}
    </div>
  );
}

/** Linha do card dos números (Séries, Repetições, Carga), separada por um fio. */
function StepRow({
  title,
  hint,
  error,
  children,
}: {
  title: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-3.5 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0">
          <span className="block text-base font-bold">{title}</span>
          {hint && <span className="block text-xs text-faint">{hint}</span>}
        </span>
        {children}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

/**
 * O −/número/+ do canvas: botões redondos e o número no meio, que continua
 * digitável (teclado numérico, vírgula).
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
    'anim-press flex shrink-0 items-center justify-center rounded-full bg-card text-foreground',
    compact ? 'h-8 w-8' : 'h-11 w-11',
  );
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        aria-label={decLabel}
        onClick={() => onChange(stepDecimal(value, -1, { step, min, max }))}
        className={round}
      >
        <Minus size={18} aria-hidden />
      </button>
      <span className="flex items-baseline justify-center">
        <input
          aria-label={label}
          inputMode={numeric ? 'numeric' : 'decimal'}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          className={cn(
            'bg-transparent text-center text-lg font-bold tabular-nums text-foreground outline-none placeholder:text-faint focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary aria-[invalid=true]:text-danger',
            compact ? 'w-7' : 'w-12',
            // Com unidade, o número encosta nela ("20 min"), sem o vão do centro.
            suffix && value.trim() && 'text-right',
          )}
        />
        {suffix && value.trim() && <span className="ml-1 text-lg font-bold">{suffix.trim()}</span>}
      </span>
      <button
        type="button"
        aria-label={incLabel}
        onClick={() => onChange(stepDecimal(value, 1, { step, min, max }))}
        className={round}
      >
        <Plus size={18} aria-hidden />
      </button>
    </span>
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
    <div className="space-y-2">
      <div className="rounded-[20px] bg-muted px-4">
        <div className="grid grid-cols-[20px_72px_1fr_1fr] items-center gap-2 border-b border-border py-3 text-[13px] text-faint">
          <span>#</span>
          <span>tipo</span>
          <span className="text-center">{draft.repUnit === 'SECONDS' ? 'seg' : 'reps'}</span>
          <span className="text-center">{unit}</span>
        </div>
        {draft.rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[20px_72px_1fr_1fr] items-center gap-2 border-b border-border py-3"
          >
            <span className="text-sm text-faint tabular-nums">{i + 1}</span>
            <button
              type="button"
              aria-label={`Série ${i + 1}: ${SET_KIND_LABEL[row.kind]}`}
              onClick={() => update(i, { kind: nextSetKind(row.kind) })}
              className={cn(
                'h-8 rounded-pill text-[11px] font-extrabold uppercase tracking-[0.04em]',
                row.kind === 'NORMAL'
                  ? 'bg-brand text-brand-foreground'
                  : row.kind === 'DROP'
                    ? 'bg-[hsl(var(--warning)/0.16)] text-warning'
                    : 'text-muted-foreground',
              )}
            >
              {SET_KIND_LABEL[row.kind]}
            </button>
            <span className="flex justify-center">
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
            </span>
            <span className="flex justify-center">
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
            </span>
          </div>
        ))}
        <div className="flex min-h-14 items-center justify-between">
          <button
            type="button"
            aria-label="Adicionar série"
            disabled={draft.rows.length >= PLAN_LIMITS.perSetRows}
            onClick={() => {
              const prev = draft.rows[draft.rows.length - 1];
              set({
                rows: [
                  ...draft.rows,
                  prev ? { ...prev } : { kind: 'NORMAL', reps: '10', load: '' },
                ],
              });
            }}
            className="flex h-11 items-center gap-2 text-[15px] font-bold text-primary-text disabled:opacity-40"
          >
            <Plus size={16} aria-hidden />
            Série
          </button>
          <button
            type="button"
            aria-label={`Remover série ${last}`}
            disabled={last <= 1}
            onClick={() => set({ rows: draft.rows.slice(0, -1) })}
            className="flex h-11 items-center text-[15px] font-semibold text-muted-foreground disabled:opacity-40"
          >
            Tirar a última
          </button>
        </div>
      </div>
      {error && <FieldError>{error}</FieldError>}
      <p className="px-1 text-xs text-faint">
        Toque no tipo para trocar entre aquecimento, normal e drop. Pirâmide: cada série com sua
        meta.
      </p>
    </div>
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
      <div className="space-y-2">
        <p className="px-1 text-[13px] text-muted-foreground">Meta por</p>
        <Segmented
          label="Meta"
          options={[
            { value: 'TIME', label: 'Tempo' },
            { value: 'DISTANCE', label: 'Distância' },
          ]}
          value={draft.cardioTarget}
          onChange={(cardioTarget) => set({ cardioTarget })}
        />
      </div>
      <div className="rounded-[20px] bg-muted px-4">
        {draft.cardioTarget === 'TIME' ? (
          <StepRow title="Duração" error={error}>
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
          <StepRow title="Distância" error={error}>
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
      </div>
      <div className="space-y-2">
        <p className="px-1 text-[13px] text-muted-foreground">Intensidade</p>
        <div className="grid grid-cols-3 gap-2">
          {INTENSITY_OPTIONS.map((o) => {
            const on = draft.cardioIntensity === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => set({ cardioIntensity: on ? null : o.value })}
                className={cn(
                  'anim-press flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-[18px] px-2 py-2 text-base font-bold',
                  on
                    ? 'bg-primary-soft text-foreground shadow-[inset_0_0_0_2px_hsl(var(--primary))]'
                    : 'bg-muted text-foreground',
                )}
              >
                {o.label}
                {zones && (
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {`${zones[o.value][0]}–${zones[o.value][1]} bpm`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="px-1 text-xs text-faint">
          {zones
            ? 'Faixa de FC calculada pela sua idade. Aparece na sessão como guia.'
            : 'Para ver a faixa de batimentos de cada intensidade, informe sua data de nascimento no perfil.'}
        </p>
      </div>
      {/* Desvio do Al-T21d: o "Quando" (início ou fim) é a posição na lista do plano. */}
      <p className="px-1 text-xs text-faint">
        No início ou no fim do treino? Mova o cardio na lista do plano.
      </p>
    </>
  );
}
