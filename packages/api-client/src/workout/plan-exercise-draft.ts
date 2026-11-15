import { parseDecimalInput } from '../meal-day';
import { formatDecimalInput } from '../nutrition-plan';
import { loadFieldValue, loadToKg, type LoadUnit } from '../units';
import type {
  CardioIntensity,
  CardioTargetKind,
  PlanExerciseInput,
  PlanLoadMode,
  PlanRepUnit,
  PlanSetKind,
  WorkoutPlanExercise,
} from '../workout';
import { isCardioExercise } from './is-cardio';
import { PLAN_LIMITS, repRangeError, splitRepRange, type TechniqueChoice } from './plan-config';

/**
 * O formulário do Configurar exercício (Al-T21 A, Al-T21b série por série e
 * Al-T21d cardio) como texto, do jeito que se digita: números com vírgula,
 * carga na unidade da pessoa. Web e app usam o mesmo rascunho, a mesma
 * validação e a mesma conversão para a API.
 */
export interface PerSetRow {
  kind: PlanSetKind;
  reps: string;
  load: string;
}

export interface PlanExerciseDraft {
  cardio: boolean;
  /** "Configurar série por série" (variante B) ligado. */
  perSet: boolean;
  repUnit: PlanRepUnit;
  loadMode: PlanLoadMode;
  sets: string;
  repsMin: string;
  repsMax: string;
  /** Na unidade da pessoa; com peso do corpo, o extra. */
  startLoad: string;
  /** Segundos; vazio = padrão da sessão. */
  rest: string;
  technique: TechniqueChoice;
  notes: string;
  rows: PerSetRow[];
  cardioTarget: CardioTargetKind;
  cardioMinutes: string;
  cardioKm: string;
  cardioIntensity: CardioIntensity | null;
}

export type DraftErrors = Partial<
  Record<'sets' | 'reps' | 'startLoad' | 'rest' | 'notes' | 'rows' | 'cardio', string>
>;

export function draftFromPlanExercise(pe: WorkoutPlanExercise, unit: LoadUnit): PlanExerciseDraft {
  const { min, max } = splitRepRange(pe.targetReps);
  const load = (kg: number | null) =>
    kg === null ? '' : formatDecimalInput(loadFieldValue(kg, unit));
  return {
    cardio: isCardioExercise(pe.exercise),
    perSet: pe.sets.length > 0,
    repUnit: pe.repUnit,
    loadMode: pe.loadMode,
    sets: String(pe.targetSets),
    repsMin: min || '8',
    repsMax: max || '12',
    startLoad: load(pe.startLoadKg),
    rest: pe.restSeconds === null ? '' : String(pe.restSeconds),
    technique: pe.biSetWithNext ? 'BI_SET' : pe.technique,
    notes: pe.notes ?? '',
    rows: pe.sets.map((s) => ({ kind: s.kind, reps: String(s.reps), load: load(s.loadKg) })),
    cardioTarget: pe.cardioTarget ?? 'TIME',
    cardioMinutes:
      pe.cardioDurationSeconds === null ? '20' : formatDecimalInput(pe.cardioDurationSeconds / 60),
    cardioKm:
      pe.cardioDistanceMeters === null ? '3' : formatDecimalInput(pe.cardioDistanceMeters / 1000),
    cardioIntensity: pe.cardioIntensity,
  };
}

const isInt = (v: string) => /^\s*\d+\s*$/.test(v);

/** Erros por campo, para mostrar embaixo de cada um enquanto se digita. Vazio = pode salvar. */
export function validateDraft(d: PlanExerciseDraft): DraftErrors {
  const e: DraftErrors = {};
  if (d.cardio) {
    if (d.cardioTarget === 'TIME') {
      const m = parseDecimalInput(d.cardioMinutes);
      if (!d.cardioMinutes.trim()) e.cardio = 'Informe a duração.';
      else if (m === null || m <= 0 || m > PLAN_LIMITS.cardioMinutes)
        e.cardio = `Duração de 1 a ${PLAN_LIMITS.cardioMinutes} min.`;
    } else {
      const km = parseDecimalInput(d.cardioKm);
      if (!d.cardioKm.trim()) e.cardio = 'Informe a distância.';
      else if (km === null || km <= 0 || km > PLAN_LIMITS.cardioKm)
        e.cardio = `Distância de 0,1 a ${PLAN_LIMITS.cardioKm} km.`;
    }
    return e;
  }
  if (d.perSet) {
    if (d.rows.length === 0) e.rows = 'Pelo menos uma série.';
    d.rows.some((r, i) => {
      const reps = Number(r.reps);
      if (!isInt(r.reps) || reps < 1 || reps > PLAN_LIMITS.reps) {
        e.rows = `Série ${i + 1}: repetições a partir de 1.`;
        return true;
      }
      const load = r.load.trim() ? parseDecimalInput(r.load) : 0;
      if (load === null || load > PLAN_LIMITS.loadKg) {
        e.rows = `Série ${i + 1}: carga inválida.`;
        return true;
      }
      return false;
    });
  } else {
    const sets = Number(d.sets);
    if (!isInt(d.sets) || sets < 1 || sets > PLAN_LIMITS.sets) {
      e.sets = `De 1 a ${PLAN_LIMITS.sets} séries.`;
    }
    const reps = repRangeError(d.repsMin, d.repsMax);
    if (reps) e.reps = reps;
  }
  if (d.startLoad.trim()) {
    const load = parseDecimalInput(d.startLoad);
    if (load === null) e.startLoad = 'Use só números, ex.: 12,5.';
    else if (load > PLAN_LIMITS.loadKg) e.startLoad = `Até ${PLAN_LIMITS.loadKg}.`;
  }
  if (d.rest.trim()) {
    const rest = Number(d.rest);
    if (!isInt(d.rest)) e.rest = 'Em segundos, ex.: 90.';
    else if (rest > PLAN_LIMITS.restSeconds) e.rest = `Até ${PLAN_LIMITS.restSeconds} s.`;
  }
  if (d.notes.length > PLAN_LIMITS.notes) e.notes = `Até ${PLAN_LIMITS.notes} caracteres.`;
  return e;
}

const kg2 = (value: number, unit: LoadUnit) => Math.round(loadToKg(value, unit) * 100) / 100;

/** O corpo do PATCH. Supõe `validateDraft` vazio. */
export function planDraftToInput(d: PlanExerciseDraft, unit: LoadUnit): PlanExerciseInput {
  if (d.cardio) {
    const byTime = d.cardioTarget === 'TIME';
    return {
      cardioTarget: d.cardioTarget,
      cardioDurationSeconds: byTime
        ? Math.round((parseDecimalInput(d.cardioMinutes) ?? 0) * 60)
        : null,
      cardioDistanceMeters: byTime ? null : Math.round((parseDecimalInput(d.cardioKm) ?? 0) * 1000),
      cardioIntensity: d.cardioIntensity,
    };
  }
  const load = d.startLoad.trim() ? parseDecimalInput(d.startLoad) : null;
  const common: PlanExerciseInput = {
    repUnit: d.repUnit,
    loadMode: d.loadMode,
    startLoadKg: load === null ? null : kg2(load, unit),
    restSeconds: d.rest.trim() ? Number(d.rest) : null,
    technique: d.technique === 'BI_SET' ? 'NORMAL' : d.technique,
    biSetWithNext: d.technique === 'BI_SET',
    notes: d.notes.trim() ? d.notes.trim() : null,
  };
  if (d.perSet) {
    return {
      ...common,
      sets: d.rows.map((r) => {
        const rowLoad = r.load.trim() ? parseDecimalInput(r.load) : null;
        return {
          kind: r.kind,
          reps: Number(r.reps),
          loadKg: rowLoad === null ? null : kg2(rowLoad, unit),
        };
      }),
    };
  }
  const min = d.repsMin.trim();
  const max = d.repsMax.trim();
  return {
    ...common,
    targetSets: Number(d.sets),
    targetReps: min === max ? min : `${min}-${max}`,
    sets: [],
  };
}

/** O "−" e o "+" ao lado do campo: anda pelo passo, sem sair do limite. */
export function stepDecimal(
  value: string,
  direction: 1 | -1,
  { step, min, max }: { step: number; min: number; max: number },
): string {
  const current = parseDecimalInput(value);
  const next = current === null ? min : current + direction * step;
  const clamped = Math.min(max, Math.max(min, Math.round(next * 100) / 100));
  return formatDecimalInput(clamped);
}

/** A tabela série por série a partir do modo simples: N séries iguais. */
export function rowsFromSimple(d: PlanExerciseDraft): PerSetRow[] {
  const n = Math.max(1, Math.min(PLAN_LIMITS.perSetRows, Number(d.sets) || 1));
  const reps = d.repsMax.trim() || d.repsMin.trim() || '10';
  return Array.from({ length: n }, () => ({ kind: 'NORMAL', reps, load: d.startLoad }));
}
