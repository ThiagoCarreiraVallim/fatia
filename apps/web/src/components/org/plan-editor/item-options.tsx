'use client';

import { useId } from 'react';
import {
  CIRCUIT_FORMAT_HINT,
  CIRCUIT_FORMAT_LABEL,
  circuitProblem,
  newCircuitBlock,
  type CardioTargetKind,
  type DocumentCircuitView,
  type DocumentExerciseView,
  type PlanCircuitFormat,
  type PlanLoadMode,
  type PlanRepUnit,
  type PlanTechnique,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented, Switch } from '@/components/ui/selection';
import { Textarea } from '@/components/ui/textarea';
import { NumField } from './num-field';

const REP_UNITS: { value: PlanRepUnit; label: string }[] = [
  { value: 'REPS', label: 'Reps' },
  { value: 'SECONDS', label: 'Segundos' },
  { value: 'METERS', label: 'Metros' },
  { value: 'MAX', label: 'Máx.' },
];
const LOAD_MODES: { value: PlanLoadMode; label: string }[] = [
  { value: 'WEIGHT', label: 'Kg' },
  { value: 'PERCENT_1RM', label: '% 1RM' },
  { value: 'BODYWEIGHT', label: 'Corpo' },
  { value: 'BAND', label: 'Elástico' },
];
const TECHNIQUES: { value: PlanTechnique; label: string }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'DROP_SET', label: 'Drop-set' },
  { value: 'TO_FAILURE', label: 'Até a falha' },
];
const CARDIO_TARGETS: { value: CardioTargetKind; label: string }[] = [
  { value: 'TIME', label: 'Tempo' },
  { value: 'DISTANCE', label: 'Distância' },
  { value: 'CALORIES', label: 'Calorias' },
];
const ZONES = [1, 2, 3, 4, 5].map((z) => ({ value: String(z), label: `Zona ${z}` }));
const FORMATS = (Object.keys(CIRCUIT_FORMAT_LABEL) as PlanCircuitFormat[]).map((f) => ({
  value: f,
  label: CIRCUIT_FORMAT_LABEL[f],
}));

type Row = DocumentExerciseView;

/** Segmentado do tamanho do texto (a prancha), não da largura do painel. */
const COMPACT = 'w-fit max-w-full flex-wrap [&>button]:flex-none [&>button]:px-3';

/** Tira as chaves com `undefined` (o documento não carrega campo vazio). */
function patch<T extends object>(row: T, changes: Partial<T>): T {
  const out = { ...row, ...changes } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
}

function Panel({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="mt-2 space-y-4 rounded-xl border border-subtle bg-muted/50 p-3 sm:p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      {children}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onClose}>
          Pronto
        </Button>
      </div>
    </section>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-medium text-muted-foreground">{children}</span>;
}

/** Ritmo "5:30" ↔ 330 s/km. */
function PaceField({ value, onChange }: { value?: number; onChange: (v?: number) => void }) {
  const id = useId();
  const text = value ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}` : '';
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Ritmo (min/km)
      </Label>
      <Input
        id={id}
        key={text}
        defaultValue={text}
        placeholder="5:30"
        inputMode="numeric"
        className="h-10"
        onBlur={(e) => {
          const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(e.target.value.trim());
          if (!e.target.value.trim()) return onChange(undefined);
          if (m) onChange(Number(m[1]) * 60 + Number(m[2] ?? 0));
        }}
      />
    </div>
  );
}

/** As opções do exercício (Pn-09b): carga, % 1RM, aquecimento, cardio. */
export function ExerciseOptions({
  row,
  onChange,
  onClose,
  hint,
}: {
  row: Row;
  onChange: (next: Row) => void;
  onClose: () => void;
  /** "última da Ana: 62,5 kg × 8", na cópia. */
  hint?: string | null;
}) {
  const set = (changes: Partial<Row>) => onChange(patch(row, changes));
  const label = `Opções de ${row.name}`;

  if (row.isCardio) {
    const target = row.cardioTarget ?? 'TIME';
    return (
      <Panel label={label} onClose={onClose}>
        <div className="space-y-1.5">
          <GroupLabel>Meta</GroupLabel>
          <Segmented
            className={COMPACT}
            label="Meta do cardio"
            options={CARDIO_TARGETS}
            value={target}
            onChange={(t) =>
              set({
                cardioTarget: t,
                cardioDurationSeconds:
                  t === 'TIME' ? (row.cardioDurationSeconds ?? 1200) : undefined,
                cardioDistanceMeters:
                  t === 'DISTANCE' ? (row.cardioDistanceMeters ?? 5000) : undefined,
                cardioCalories: t === 'CALORIES' ? (row.cardioCalories ?? 200) : undefined,
              })
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {target === 'TIME' && (
            <NumField
              label="Duração (min)"
              value={row.cardioDurationSeconds}
              scale={60}
              min={1}
              onChange={(v) => set({ cardioDurationSeconds: v })}
            />
          )}
          {target === 'DISTANCE' && (
            <NumField
              label="Distância (km)"
              value={row.cardioDistanceMeters}
              scale={1000}
              integer={false}
              min={1}
              onChange={(v) => set({ cardioDistanceMeters: v })}
            />
          )}
          {target === 'CALORIES' && (
            <NumField
              label="Calorias (kcal)"
              value={row.cardioCalories}
              min={1}
              onChange={(v) => set({ cardioCalories: v })}
            />
          )}
          <NumField
            label="Inclinação (%)"
            value={row.cardioInclinePercent}
            integer={false}
            max={40}
            onChange={(v) => set({ cardioInclinePercent: v })}
          />
        </div>
        <div className="space-y-1.5">
          <GroupLabel>Intensidade: uma só, zona, ritmo ou esforço</GroupLabel>
          <Segmented
            className={COMPACT}
            label="Zona de frequência"
            options={ZONES}
            value={row.cardioZone ? String(row.cardioZone) : ''}
            onChange={(z) =>
              set(
                String(row.cardioZone) === z
                  ? { cardioZone: undefined }
                  : {
                      cardioZone: Number(z),
                      cardioPaceSecondsPerKm: undefined,
                      cardioRpe: undefined,
                    },
              )
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <PaceField
              value={row.cardioPaceSecondsPerKm}
              onChange={(v) =>
                set(
                  v === undefined
                    ? { cardioPaceSecondsPerKm: undefined }
                    : { cardioPaceSecondsPerKm: v, cardioZone: undefined, cardioRpe: undefined },
                )
              }
            />
            <NumField
              label="Esforço (1 a 10)"
              value={row.cardioRpe}
              min={1}
              max={10}
              onChange={(v) =>
                set(
                  v === undefined
                    ? { cardioRpe: undefined }
                    : { cardioRpe: v, cardioZone: undefined, cardioPaceSecondsPerKm: undefined },
                )
              }
            />
          </div>
        </div>
        <NotesField row={row} onChange={(notes) => set({ notes })} />
      </Panel>
    );
  }

  const mode = row.loadMode ?? 'WEIGHT';
  return (
    <Panel label={label} onClose={onClose}>
      {hint && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{hint}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <GroupLabel>Repetições em</GroupLabel>
            <Segmented
              className={COMPACT}
              label="Unidade das repetições"
              options={REP_UNITS}
              value={row.repUnit ?? 'REPS'}
              onChange={(u) => set({ repUnit: u === 'REPS' ? undefined : u })}
            />
          </div>
          <div className="space-y-1.5">
            <GroupLabel>Carga</GroupLabel>
            <Segmented
              className={COMPACT}
              label="Carga"
              options={LOAD_MODES}
              value={mode}
              onChange={(m) =>
                set({
                  loadMode: m === 'WEIGHT' ? undefined : m,
                  loadPercent: m === 'PERCENT_1RM' ? (row.loadPercent ?? 70) : undefined,
                  startLoadKg: m === 'WEIGHT' || m === 'BODYWEIGHT' ? row.startLoadKg : undefined,
                })
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {mode === 'PERCENT_1RM' ? (
              <NumField
                label="% do 1RM"
                value={row.loadPercent}
                min={1}
                max={120}
                onChange={(v) => set({ loadPercent: v })}
              />
            ) : mode !== 'BAND' ? (
              <NumField
                label={mode === 'BODYWEIGHT' ? 'Carga extra (kg)' : 'Carga inicial (kg)'}
                value={row.startLoadKg}
                integer={false}
                onChange={(v) => set({ startLoadKg: v })}
              />
            ) : null}
            <NumField
              label="Descanso (s)"
              value={row.restSeconds}
              max={900}
              onChange={(v) => set({ restSeconds: v })}
            />
          </div>
          {mode === 'PERCENT_1RM' && (
            <p className="text-xs text-muted-foreground">
              O aluno vê em kg, a partir do melhor 1RM estimado dele; sem histórico, vê &quot;sem
              1RM&quot;.
            </p>
          )}
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <GroupLabel>Técnica</GroupLabel>
            <Segmented
              className={COMPACT}
              label="Técnica"
              options={TECHNIQUES}
              value={row.technique ?? 'NORMAL'}
              onChange={(t) => set({ technique: t === 'NORMAL' ? undefined : t })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Série de aquecimento antes</span>
            <Switch
              label="Série de aquecimento antes"
              checked={row.warmupBefore === true}
              onCheckedChange={(on) => set({ warmupBefore: on || undefined })}
            />
          </div>
        </div>
      </div>
      <NotesField row={row} onChange={(notes) => set({ notes })} />
    </Panel>
  );
}

function NotesField({ row, onChange }: { row: Row; onChange: (v?: string) => void }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Observação
      </Label>
      <Textarea
        id={id}
        rows={2}
        maxLength={500}
        value={row.notes ?? ''}
        placeholder="Pegada, amplitude, cadência..."
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

/** As opções do circuito (Pn-09c): o formato e os tempos dele. */
export function CircuitOptions({
  block,
  onChange,
  onClose,
  children,
}: {
  block: DocumentCircuitView;
  onChange: (next: DocumentCircuitView) => void;
  onClose: () => void;
  /** A busca "Adicionar ao circuito". */
  children: React.ReactNode;
}) {
  const set = (changes: Partial<DocumentCircuitView>) => onChange(patch(block, changes));
  const problem = circuitProblem(block);
  return (
    <Panel label="Opções do circuito" onClose={onClose}>
      <div className="space-y-1.5">
        <GroupLabel>Formato</GroupLabel>
        <Segmented
          className={COMPACT}
          label="Formato do circuito"
          options={FORMATS}
          value={block.format}
          onChange={(f) => {
            if (f === block.format) return;
            const fresh = newCircuitBlock(f, block.exercises);
            onChange(block.name ? { ...fresh, name: block.name } : fresh);
          }}
        />
        <p className="text-xs text-muted-foreground">{CIRCUIT_FORMAT_HINT[block.format]}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(block.format === 'AMRAP' || block.format === 'EMOM') && (
          <NumField
            label="Duração (min)"
            value={block.durationSeconds}
            scale={60}
            min={60}
            onChange={(v) => set({ durationSeconds: v })}
          />
        )}
        {block.format === 'TABATA' && (
          <>
            <NumField
              label="Trabalho (s)"
              value={block.workSeconds}
              min={1}
              onChange={(v) => set({ workSeconds: v })}
            />
            <NumField
              label="Descanso (s)"
              value={block.restSeconds}
              onChange={(v) => set({ restSeconds: v })}
            />
            <NumField
              label="Intervalos"
              value={block.intervals}
              min={1}
              onChange={(v) => set({ intervals: v })}
            />
          </>
        )}
        {(block.format === 'FOR_TIME' || block.format === 'ROUNDS') && (
          <NumField
            label="Rounds"
            value={block.rounds}
            min={1}
            onChange={(v) => set({ rounds: v })}
          />
        )}
        {block.format === 'FOR_TIME' && (
          <NumField
            label="Limite (min)"
            value={block.timeCapSeconds}
            scale={60}
            onChange={(v) => set({ timeCapSeconds: v })}
          />
        )}
        {block.format === 'ROUNDS' && (
          <NumField
            label="Descanso entre rounds (s)"
            value={block.restBetweenRoundsSeconds}
            onChange={(v) => set({ restBetweenRoundsSeconds: v })}
          />
        )}
      </div>
      {children}
      {problem && <p className="text-xs text-danger">{problem}</p>}
    </Panel>
  );
}
