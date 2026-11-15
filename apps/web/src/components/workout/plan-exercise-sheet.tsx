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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Chip, Segmented, Switch } from '@/components/ui/selection';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

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

  function save() {
    if (!valid || saving) return;
    onSave(planDraftToInput(draft, loadUnit));
  }

  const subtitle = [item.exercise.muscleGroup, item.exercise.equipment].filter(Boolean).join(' · ');

  return (
    <>
      <DrawerHeader className="px-0">
        <DrawerTitle>{item.exercise.name}</DrawerTitle>
        <DrawerDescription className="capitalize">{subtitle}</DrawerDescription>
      </DrawerHeader>

      <div className="max-h-[62vh] space-y-5 overflow-y-auto py-2">
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

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Configurar série por série</span>
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
            </div>

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
                <div className="space-y-1.5">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    {draft.repUnit === 'SECONDS' ? 'Segundos por série' : 'Repetições'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={
                        draft.repUnit === 'SECONDS' ? 'Segundos mínimos' : 'Repetições mínimas'
                      }
                      inputMode="numeric"
                      value={draft.repsMin}
                      onChange={(e) => set({ repsMin: e.target.value })}
                      aria-invalid={!!errors.reps}
                      className="h-12 text-center text-lg font-bold"
                    />
                    <span className="text-muted-foreground">a</span>
                    <Input
                      aria-label={
                        draft.repUnit === 'SECONDS' ? 'Segundos máximos' : 'Repetições máximas'
                      }
                      inputMode="numeric"
                      value={draft.repsMax}
                      onChange={(e) => set({ repsMax: e.target.value })}
                      aria-invalid={!!errors.reps}
                      className="h-12 text-center text-lg font-bold"
                    />
                  </div>
                  {errors.reps && <FieldError>{errors.reps}</FieldError>}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Segmented
                label="Tipo de carga"
                options={[
                  { value: 'WEIGHT', label: unit },
                  { value: 'BODYWEIGHT', label: 'Peso do corpo' },
                ]}
                value={draft.loadMode}
                onChange={(loadMode) => set({ loadMode })}
              />
              {!draft.perSet && (
                <StepperField
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
                  decLabel="Diminuir carga"
                  incLabel="Aumentar carga"
                  placeholder="opcional"
                  error={errors.startLoad}
                />
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Descanso
              </p>
              <div className="flex flex-wrap gap-2">
                {REST_OPTIONS.map((sec) => (
                  <Chip
                    key={sec}
                    selected={draft.rest.trim() === String(sec)}
                    onClick={() => set({ rest: String(sec) })}
                  >
                    {formatRest(sec)}
                  </Chip>
                ))}
              </div>
              <Input
                aria-label="Descanso (segundos)"
                inputMode="numeric"
                placeholder="ou digite em segundos (vazio = padrão)"
                value={draft.rest}
                onChange={(e) => set({ rest: e.target.value })}
                aria-invalid={!!errors.rest}
                className="h-11"
              />
              {errors.rest && <FieldError>{errors.rest}</FieldError>}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Técnica
              </p>
              <div className="flex flex-wrap gap-2">
                {TECHNIQUE_OPTIONS.map((t) => (
                  <Chip
                    key={t.value}
                    selected={draft.technique === t.value}
                    onClick={() => set({ technique: t.value })}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {TECHNIQUE_OPTIONS.find((t) => t.value === draft.technique)?.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="plan-exercise-notes"
                className="text-xs font-bold tracking-wide text-muted-foreground uppercase"
              >
                Observação
              </label>
              <Textarea
                id="plan-exercise-notes"
                value={draft.notes}
                maxLength={PLAN_LIMITS.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Ex.: banco no 3, pegada aberta"
                rows={2}
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

      <Button
        className="mt-3 h-12 w-full rounded-full text-base font-bold"
        disabled={!valid || saving}
        onClick={save}
      >
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
      <Button
        variant="ghost"
        className="mt-1 w-full text-danger"
        onClick={() => setConfirmRemove(true)}
      >
        Remover do plano
      </Button>

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

/** Número digitável (teclado certo, vírgula) com −/+ de passo do lado. */
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
    <div className="space-y-1.5">
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="flex items-center gap-2 rounded-field bg-muted p-1">
        <button
          type="button"
          aria-label={decLabel}
          onClick={() => onChange(stepDecimal(value, -1, { step, min, max }))}
          className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-card"
        >
          <Minus size={18} />
        </button>
        <Input
          aria-label={label}
          inputMode={numeric ? 'numeric' : 'decimal'}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className="h-11 flex-1 border-0 bg-transparent text-center text-lg font-bold shadow-none"
        />
        <button
          type="button"
          aria-label={incLabel}
          onClick={() => onChange(stepDecimal(value, 1, { step, min, max }))}
          className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-primary text-primary-foreground"
        >
          <Plus size={18} />
        </button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
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
    <div className="space-y-2">
      <div className="grid grid-cols-[28px_76px_1fr_1fr_44px] gap-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        <span>#</span>
        <span>Tipo</span>
        <span>{draft.repUnit === 'SECONDS' ? 'Seg.' : 'Reps'}</span>
        <span>Carga ({unit})</span>
        <span />
      </div>
      {draft.rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[28px_76px_1fr_1fr_44px] items-center gap-2">
          <span className="text-sm font-bold tabular-nums">{i + 1}</span>
          <button
            type="button"
            aria-label={`Série ${i + 1}: ${SET_KIND_LABEL[row.kind]}`}
            onClick={() => update(i, { kind: nextSetKind(row.kind) })}
            className={cn(
              'h-11 rounded-[10px] text-xs font-bold',
              row.kind === 'WARMUP'
                ? 'bg-water/15 text-water'
                : row.kind === 'DROP'
                  ? 'bg-danger/15 text-danger'
                  : 'bg-muted',
            )}
          >
            {SET_KIND_LABEL[row.kind]}
          </button>
          <Input
            aria-label={`${repsWord} da série ${i + 1}`}
            inputMode="numeric"
            value={row.reps}
            onChange={(e) => update(i, { reps: e.target.value })}
            className="h-11 text-center"
          />
          <Input
            aria-label={`Carga da série ${i + 1} (${unit})`}
            inputMode="decimal"
            value={row.load}
            onChange={(e) => update(i, { load: e.target.value })}
            className="h-11 text-center"
          />
          <button
            type="button"
            aria-label={`Remover série ${i + 1}`}
            disabled={draft.rows.length <= 1}
            onClick={() => set({ rows: draft.rows.filter((_, k) => k !== i) })}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-danger disabled:opacity-30"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {error && <FieldError>{error}</FieldError>}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={draft.rows.length >= PLAN_LIMITS.perSetRows}
        onClick={() => {
          const last = draft.rows[draft.rows.length - 1];
          set({
            rows: [...draft.rows, last ? { ...last } : { kind: 'NORMAL', reps: '10', load: '' }],
          });
        }}
      >
        Adicionar série
      </Button>
      <p className="text-xs text-muted-foreground">
        Toque no tipo para alternar entre aquecimento, normal e drop.
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
      <div className="space-y-2">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Intensidade
        </p>
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
                  'flex min-h-14 flex-col items-center justify-center rounded-[12px] px-2 py-2 text-sm font-semibold',
                  on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                )}
              >
                {o.label}
                {zones && (
                  <span className="text-[11px] font-normal tabular-nums">
                    {`${zones[o.value][0]}–${zones[o.value][1]} bpm`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!zones && (
          <p className="text-xs text-muted-foreground">
            Para ver a faixa de batimentos de cada intensidade, informe sua data de nascimento no
            perfil.
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        No início ou no fim do treino? Mova o cardio na lista do plano.
      </p>
    </>
  );
}
