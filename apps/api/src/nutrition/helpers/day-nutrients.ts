import type { ItemMacros } from './calc-macros';

export type DayNutrientStatus = 'under' | 'ok' | 'over' | 'none';

/** Um nutriente no dia, com a faixa da meta e onde o dia está nela (#374). */
export interface DayNutrient {
  /** `kcal`, `protein_g`, `carbs_g`, `fat_g` ou a chave de `MealItem.nutrients`. */
  key: string;
  label: string;
  unit: string;
  value: number;
  min: number | null;
  max: number | null;
  status: DayNutrientStatus;
}

interface GoalsRange {
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
}

interface TargetRange {
  nutrientKey: string;
  label: string;
  unit: string;
  min: number | null;
  max: number | null;
}

/** Os três que a tela do dia mostra sempre, com ou sem meta (prancha Al-N1). */
const ALWAYS_SHOWN: ReadonlyArray<Pick<TargetRange, 'nutrientKey' | 'label' | 'unit'>> = [
  { nutrientKey: 'fiber_g', label: 'Fibra', unit: 'g' },
  { nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg' },
  { nutrientKey: 'caffeine_mg', label: 'Cafeína', unit: 'mg' },
];

export function classifyNutrient(
  value: number,
  min: number | null,
  max: number | null,
): DayNutrientStatus {
  if (min == null && max == null) return 'none';
  if (max != null && value > max) return 'over';
  if (min != null && value < min) return 'under';
  return 'ok';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function row(
  key: string,
  label: string,
  unit: string,
  value: number,
  min: number | null,
  max: number | null,
): DayNutrient {
  const v = round2(value);
  return { key, label, unit, value: v, min, max, status: classifyNutrient(v, min, max) };
}

/**
 * kcal e macros com a faixa das metas do dia; fibra, sódio e cafeína sempre;
 * depois as outras metas de nutriente da pessoa, pelo rótulo. Sem meta, a faixa
 * é nula e o estado `none`: a tela mostra o valor sem inventar limite.
 */
export function buildDayNutrients(input: {
  totals: ItemMacros;
  micros: Record<string, number>;
  goals: GoalsRange | null;
  targets: TargetRange[];
}): DayNutrient[] {
  const { totals, micros, goals: g, targets } = input;
  const byKey = new Map(targets.map((t) => [t.nutrientKey, t]));
  const out: DayNutrient[] = [
    row('kcal', 'Calorias', 'kcal', totals.kcal, g?.kcalMin ?? null, g?.kcalMax ?? null),
    row(
      'protein_g',
      'Proteína',
      'g',
      totals.proteinG,
      g?.proteinMinG ?? null,
      g?.proteinMaxG ?? null,
    ),
    row('carbs_g', 'Carboidrato', 'g', totals.carbsG, g?.carbsMinG ?? null, g?.carbsMaxG ?? null),
    row('fat_g', 'Gordura', 'g', totals.fatG, g?.fatMinG ?? null, g?.fatMaxG ?? null),
  ];
  for (const base of ALWAYS_SHOWN) {
    const t = byKey.get(base.nutrientKey);
    out.push(
      row(
        base.nutrientKey,
        t?.label ?? base.label,
        t?.unit ?? base.unit,
        micros[base.nutrientKey] ?? 0,
        t?.min ?? null,
        t?.max ?? null,
      ),
    );
  }
  const shown = new Set(ALWAYS_SHOWN.map((b) => b.nutrientKey));
  const others = targets
    .filter((t) => !shown.has(t.nutrientKey))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  for (const t of others) {
    out.push(row(t.nutrientKey, t.label, t.unit, micros[t.nutrientKey] ?? 0, t.min, t.max));
  }
  return out;
}
