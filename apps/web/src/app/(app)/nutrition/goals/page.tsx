'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Calculator, ChevronRight, Dumbbell, Droplet, Footprints, Minus, Plus } from 'lucide-react';
import {
  GOAL_RANGES,
  GOAL_STEP,
  goalBand,
  goalsToDraft,
  stepGoalText,
  nutritionApi,
  parseGoalsDraft,
  type GoalErrorKey,
  type GoalsDraft,
  type NutrientProgress,
  type UserGoals,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from '@/components/nutrition/load-error';
import { errorMessage } from '@/components/nutrition/error-message';
import { hojeIso } from '@/lib/dias';
import { cn } from '@/lib/utils';

const empty: GoalsDraft = goalsToDraft({
  kcalMin: 1800,
  kcalMax: 2200,
  proteinMinG: 120,
  proteinMaxG: 160,
  carbsMinG: 180,
  carbsMaxG: 250,
  fatMinG: 50,
  fatMaxG: 80,
  weeklyWorkouts: 3,
  dailyStepsTarget: 8000,
  dailyWaterTargetMl: 2500,
});

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Metas do dia (prancha Al-N6). Cada meta é uma faixa: mínimo e máximo, cada
 * um no seu campo, digitáveis — a prancha usa "−/+", mas 1.800 kcal a passos
 * de 50 é muito toque. O erro de mínimo acima do máximo aparece na linha.
 */
export default function GoalsPage() {
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ['nutrition', 'goals'], queryFn: () => nutritionApi.goals() });
  const [draft, setDraft] = useState<GoalsDraft>(empty);
  // Como no app: sem um "salvo", o botão voltava ao normal e a pessoa não sabia
  // se tinha gravado. Mexer num campo apaga o aviso.
  const [saved, setSaved] = useState(false);
  // O erro de uma linha aparece quando ela foi mexida ou ao tentar salvar.
  const [touched, setTouched] = useState<Set<GoalErrorKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  // Ajuste durante o render, e não num efeito (#187): a resposta do React Query
  // muda de identidade só quando muda de verdade, e o formulário é reespelhado
  // antes de pintar.
  const [previousData, setPreviousData] = useState<typeof goals.data>(undefined);
  if (previousData !== goals.data && goals.data) {
    setPreviousData(goals.data);
    const { userId: _userId, ...rest } = goals.data as UserGoals;
    void _userId;
    setDraft(goalsToDraft(rest));
  }

  const { goals: parsed, errors } = parseGoalsDraft(draft);
  const errorOf = (key: GoalErrorKey) => (submitted || touched.has(key) ? errors[key] : undefined);

  const save = useMutation({
    mutationFn: (body: NonNullable<typeof parsed>) => nutritionApi.putGoals(body),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'goals'] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (parsed) save.mutate(parsed);
  };

  const change = (field: keyof GoalsDraft, row: GoalErrorKey) => (value: string) => {
    setSaved(false);
    setTouched((t) => new Set(t).add(row));
    setDraft((d) => ({ ...d, [field]: value }));
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 px-5 pb-28 pt-2">
      <p className="text-[13px] text-muted-foreground">
        Cada meta é uma faixa. Ajuste o mínimo e o máximo, cada um na sua linha; dentro dela o dia
        conta como “na meta”.
      </p>

      <Link
        href="/onboarding?refazer=1"
        className="flex min-h-12 items-center gap-3 rounded-card bg-card px-4 py-3 text-sm hover:bg-card/80"
      >
        <Calculator size={18} className="text-primary" aria-hidden />
        <span className="flex-1">
          <span className="block font-semibold">Recalcular com meus dados</span>
          <span className="block text-xs text-muted-foreground">
            Objetivo, peso e rotina viram uma sugestão de metas.
          </span>
        </span>
      </Link>

      {goals.isLoading && <Skeleton className="h-16" />}
      {goals.error && <LoadError error={goals.error} onRetry={() => void goals.refetch()} />}

      {/* Enquanto as metas carregam, digitar seria apagado pela resposta. */}
      <fieldset disabled={goals.isLoading} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <section className="space-y-2.5">
          <h2 className="px-1 text-[13px] text-muted-foreground">Calorias e macros</h2>
          {GOAL_RANGES.map((r) => {
            const error = errorOf(r.min);
            const errorId = `${r.min}-erro`;
            const inputMode = r.unit === 'kcal' ? 'numeric' : 'decimal';
            const band = goalBand(draft[r.min], draft[r.max]);
            const color = RANGE_COLOR[r.min];
            return (
              <fieldset
                key={r.min}
                aria-describedby={error ? errorId : undefined}
                className="rounded-card bg-card px-4 pb-1 pt-4"
              >
                <legend className="sr-only">{r.label}</legend>
                <div aria-hidden className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
                  <span className="flex-1 font-display text-[17px] font-semibold">{r.label}</span>
                  <span className="text-sm font-bold tabular-nums">
                    {draft[r.min] || '—'}–{draft[r.max] || '—'}{' '}
                    <span className="font-normal text-muted-foreground">{r.unit}</span>
                  </span>
                </div>
                <div aria-hidden className="relative mt-3 h-2 rounded-pill bg-muted">
                  {band && (
                    <span
                      className="absolute inset-y-0 rounded-pill"
                      style={{ left: `${band.left}%`, width: `${band.width}%`, background: color }}
                    />
                  )}
                </div>
                <StepRow
                  id={r.min}
                  label="Mínimo"
                  ariaLabel={`Mínimo de ${r.label}`}
                  hint="abaixo disso falta"
                  inputMode={inputMode}
                  value={draft[r.min]}
                  invalid={Boolean(error)}
                  describedBy={error ? errorId : undefined}
                  onChange={change(r.min, r.min)}
                  onStep={(d) =>
                    change(r.min, r.min)(stepGoalText(draft[r.min], GOAL_STEP[r.min], d))
                  }
                />
                <StepRow
                  id={r.max}
                  label="Máximo"
                  divider
                  ariaLabel={`Máximo de ${r.label}`}
                  hint="acima disso passou"
                  inputMode={inputMode}
                  value={draft[r.max]}
                  invalid={Boolean(error)}
                  describedBy={error ? errorId : undefined}
                  onChange={change(r.max, r.min)}
                  onStep={(d) =>
                    change(r.max, r.min)(stepGoalText(draft[r.max], GOAL_STEP[r.max], d))
                  }
                />
                {error && (
                  <p id={errorId} role="alert" className="pb-3 text-sm text-danger">
                    {error}
                  </p>
                )}
              </fieldset>
            );
          })}
        </section>

        <section className="space-y-2.5">
          <h2 className="px-1 text-[13px] text-muted-foreground">Água e movimento</h2>
          <div className="divide-y divide-border rounded-card bg-card px-4">
            <SingleField
              id="waterL"
              icon={<Droplet size={20} className="text-water" aria-hidden />}
              label="Água por dia"
              ariaLabel="Água por dia (L)"
              unit="L"
              hint="conta no anel do Hoje"
              inputMode="decimal"
              value={draft.waterL}
              error={errorOf('water')}
              onChange={change('waterL', 'water')}
              onStep={(d) =>
                change('waterL', 'water')(stepGoalText(draft.waterL, GOAL_STEP.waterL, d))
              }
            />
            <SingleField
              id="weeklyWorkouts"
              icon={<Dumbbell size={20} className="text-foreground" aria-hidden />}
              label="Treinos por semana"
              unit="dias"
              hint="dias que quer treinar"
              inputMode="numeric"
              value={draft.weeklyWorkouts}
              error={errorOf('workouts')}
              onChange={change('weeklyWorkouts', 'workouts')}
              onStep={(d) =>
                change(
                  'weeklyWorkouts',
                  'workouts',
                )(stepGoalText(draft.weeklyWorkouts, GOAL_STEP.weeklyWorkouts, d))
              }
            />
            <SingleField
              id="dailyStepsTarget"
              icon={<Footprints size={20} className="text-steps" aria-hidden />}
              label="Passos por dia"
              hint="vem do celular"
              inputMode="numeric"
              value={draft.dailyStepsTarget}
              error={errorOf('steps')}
              onChange={change('dailyStepsTarget', 'steps')}
              onStep={(d) =>
                change(
                  'dailyStepsTarget',
                  'steps',
                )(stepGoalText(draft.dailyStepsTarget, GOAL_STEP.dailyStepsTarget, d))
              }
            />
          </div>
        </section>
      </fieldset>

      <YourNutrients />

      <Button
        type="submit"
        size="xl"
        full
        disabled={save.isPending}
        className="rounded-pill bg-foreground text-background hover:bg-foreground/90"
      >
        {save.isPending ? 'Salvando…' : 'Salvar metas'}
      </Button>
      {submitted && !parsed && (
        <p role="alert" className="text-sm text-danger">
          Confira as linhas marcadas antes de salvar.
        </p>
      )}
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(save.error, {
            conflict: 'Suas metas já foram atualizadas.',
            fallback: 'Não foi possível salvar as metas. Tente de novo.',
          })}
        </p>
      )}
      {saved && !save.isPending && !save.error && (
        <p role="status" className="text-sm text-primary">
          Metas salvas.
        </p>
      )}
    </form>
  );
}

/** A cor de cada faixa, a mesma do cartão do dia. */
const RANGE_COLOR: Record<(typeof GOAL_RANGES)[number]['min'], string> = {
  kcalMin: 'hsl(var(--foreground))',
  proteinMinG: 'hsl(var(--protein))',
  carbsMinG: 'hsl(var(--carbs))',
  fatMinG: 'hsl(var(--fat))',
};

/**
 * "− 1.800 +" da prancha. O número continua um campo: digitar 1.850 é mais
 * rápido que tocar no + várias vezes.
 */
function Stepper({
  id,
  ariaLabel,
  inputMode,
  value,
  invalid,
  describedBy,
  unit,
  onChange,
  onStep,
}: {
  id: string;
  ariaLabel?: string;
  inputMode: 'decimal' | 'numeric';
  value: string;
  invalid?: boolean;
  describedBy?: string;
  unit?: string;
  onChange: (value: string) => void;
  onStep: (direction: 1 | -1) => void;
}) {
  const name = ariaLabel ?? id;
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`Diminuir ${name}`}
        onClick={() => onStep(-1)}
        className="anim-press flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Minus size={18} aria-hidden />
      </button>
      <span className="flex w-[68px] items-baseline justify-center gap-1">
        <input
          id={id}
          aria-label={ariaLabel}
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full min-w-0 rounded-chip bg-transparent text-center text-[17px] font-bold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:text-danger',
            unit && 'w-auto max-w-[56px] text-right',
          )}
          size={unit ? Math.max(value.length, 1) : undefined}
        />
        {unit && <span className="text-[17px] font-bold">{unit}</span>}
      </span>
      <button
        type="button"
        aria-label={`Aumentar ${name}`}
        onClick={() => onStep(1)}
        className="anim-press flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Plus size={18} aria-hidden />
      </button>
    </div>
  );
}

function StepRow({
  id,
  label,
  ariaLabel,
  hint,
  inputMode,
  value,
  invalid,
  describedBy,
  onChange,
  onStep,
  divider = false,
}: {
  id: string;
  label: string;
  ariaLabel: string;
  divider?: boolean;
  hint: string;
  inputMode: 'decimal' | 'numeric';
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[78px] items-center gap-3 py-3',
        divider ? 'border-t border-border' : 'mt-1',
      )}
    >
      <span className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-[15px]">
          {label}
        </label>
        <span className="block text-[13px] text-muted-foreground">{hint}</span>
      </span>
      <Stepper
        id={id}
        ariaLabel={ariaLabel}
        inputMode={inputMode}
        value={value}
        invalid={invalid}
        describedBy={describedBy}
        onChange={onChange}
        onStep={onStep}
      />
    </div>
  );
}

function SingleField({
  id,
  icon,
  label,
  ariaLabel,
  unit,
  hint,
  inputMode,
  value,
  error,
  onChange,
  onStep,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  ariaLabel?: string;
  unit?: string;
  hint: string;
  inputMode: 'decimal' | 'numeric';
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <div className="py-3">
      <div className="flex min-h-[64px] items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <label htmlFor={id} className="block text-[15px] font-semibold">
            {label}
          </label>
          <span className="block text-[13px] text-muted-foreground">{hint}</span>
        </span>
        {/* O erro fica fora do campo: trocar de árvore tiraria o foco no meio
          da digitação. */}
        <Stepper
          id={id}
          ariaLabel={ariaLabel ?? label}
          inputMode={inputMode}
          value={value}
          unit={unit}
          invalid={Boolean(error)}
          describedBy={error ? `${id}-erro` : undefined}
          onChange={onChange}
          onStep={onStep}
        />
      </div>
      {error && (
        <p id={`${id}-erro`} role="alert" className="text-right text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Seus nutrientes": o resumo de hoje e o atalho para a tela Al-N7. */
function YourNutrients() {
  const today = hojeIso();
  const q = useQuery({
    queryKey: ['nutrition', 'nutrient-summary', today],
    queryFn: () => nutritionApi.nutrientSummary(today),
  });
  const nutrients = q.data?.nutrients ?? [];
  return (
    <section aria-labelledby="seus-nutrientes" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="seus-nutrientes" className="px-1 text-[13px] text-muted-foreground">
          Seus nutrientes
        </h2>
        <Link
          href="/nutrition/nutrient-targets"
          className="flex min-h-11 items-center text-sm font-bold text-primary"
        >
          Gerenciar
        </Link>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-card bg-card px-4">
        {q.isLoading && <Skeleton className="m-4 h-10" />}
        {q.error && <LoadError error={q.error} onRetry={() => void q.refetch()} className="m-4" />}
        {nutrients.map((n) => (
          <NutrientLink key={n.nutrientKey} n={n} />
        ))}
        <Link
          href="/nutrition/nutrient-targets"
          className="flex min-h-14 items-center gap-2 py-3 text-[15px] font-bold text-primary"
        >
          <Plus size={18} aria-hidden />
          Adicionar nutriente
        </Link>
      </div>
    </section>
  );
}

function NutrientLink({ n }: { n: NutrientProgress }) {
  const kind =
    n.min != null && n.max == null ? 'mín' : n.max != null && n.min == null ? 'máx' : null;
  const target =
    kind === 'mín'
      ? `${fmt(n.min as number)} ${n.unit}`
      : kind === 'máx'
        ? `${fmt(n.max as number)} ${n.unit}`
        : n.min != null && n.max != null
          ? `${fmt(n.min)}–${fmt(n.max)} ${n.unit}`
          : '—';
  // Abaixo do mínimo hoje: o "MÍN" acende em laranja, como na prancha.
  const short = kind === 'mín' && n.total < (n.min as number);
  return (
    <Link
      href="/nutrition/nutrient-targets"
      aria-label={`${n.label}, hoje ${fmt(n.total)} ${n.unit}, ${kind ? `${kind} ` : ''}${target}`}
      className="flex min-h-[72px] items-center gap-3 py-3"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold">{n.label}</span>
        <span className="block text-[13px] text-muted-foreground tabular-nums">
          hoje {fmt(n.total)} {n.unit}
        </span>
      </span>
      {kind && (
        <span
          className={cn(
            'rounded-pill px-2.5 py-0.5 text-[11px] font-extrabold uppercase',
            short ? 'bg-warning text-background' : 'bg-muted text-muted-foreground',
          )}
        >
          {kind}
        </span>
      )}
      <span className="text-[17px] font-bold tabular-nums">{target}</span>
      <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
    </Link>
  );
}
