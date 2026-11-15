'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Calculator, ChevronRight, Dumbbell, Droplet, Footprints, Plus } from 'lucide-react';
import {
  GOAL_RANGES,
  goalsToDraft,
  nutritionApi,
  parseGoalsDraft,
  type GoalErrorKey,
  type GoalsDraft,
  type NutrientProgress,
  type UserGoals,
} from '@fatia/api-client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from '@/components/nutrition/load-error';
import { errorMessage } from '@/components/nutrition/error-message';
import { hojeIso } from '@/lib/dias';

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
    <form onSubmit={onSubmit} noValidate className="space-y-5 p-4 pb-28">
      <p className="text-sm text-muted-foreground">
        Cada meta é uma faixa. Ajuste o mínimo e o máximo; dentro dela o dia conta como “na meta”.
      </p>

      <Link
        href="/onboarding?refazer=1"
        className="flex min-h-12 items-center gap-3 rounded-xl border border-subtle bg-card px-4 py-3 text-sm hover:bg-card/80"
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
      <fieldset disabled={goals.isLoading} className="contents">
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Calorias e macros
          </h2>
          {GOAL_RANGES.map((r) => {
            const error = errorOf(r.min);
            const errorId = `${r.min}-erro`;
            const inputMode = r.unit === 'kcal' ? 'numeric' : 'decimal';
            return (
              <fieldset
                key={r.min}
                aria-describedby={error ? errorId : undefined}
                className="space-y-3 rounded-2xl bg-card p-4"
              >
                <legend className="sr-only">{r.label}</legend>
                <div aria-hidden className="flex items-baseline justify-between">
                  <span className="text-sm font-bold">{r.label}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {draft[r.min] || '—'}–{draft[r.max] || '—'} {r.unit}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={r.min}>Mínimo</Label>
                    <Input
                      id={r.min}
                      aria-label={`Mínimo de ${r.label}`}
                      inputMode={inputMode}
                      autoComplete="off"
                      value={draft[r.min]}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      onChange={(e) => change(r.min, r.min)(e.target.value)}
                    />
                    <span className="block text-[11px] text-muted-foreground">
                      abaixo disso falta
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={r.max}>Máximo</Label>
                    <Input
                      id={r.max}
                      aria-label={`Máximo de ${r.label}`}
                      inputMode={inputMode}
                      autoComplete="off"
                      value={draft[r.max]}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      onChange={(e) => change(r.max, r.min)(e.target.value)}
                    />
                    <span className="block text-[11px] text-muted-foreground">
                      acima disso passou
                    </span>
                  </div>
                </div>
                {error && (
                  <p id={errorId} role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
              </fieldset>
            );
          })}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Água e movimento
          </h2>
          <div className="divide-y divide-subtle rounded-2xl bg-card">
            <SingleField
              id="waterL"
              icon={<Droplet size={18} className="text-info" aria-hidden />}
              label="Água por dia (L)"
              hint="conta no anel do Hoje"
              inputMode="decimal"
              value={draft.waterL}
              error={errorOf('water')}
              onChange={change('waterL', 'water')}
            />
            <SingleField
              id="weeklyWorkouts"
              icon={<Dumbbell size={18} className="text-muted-foreground" aria-hidden />}
              label="Treinos por semana"
              hint="dias que quer treinar"
              inputMode="numeric"
              value={draft.weeklyWorkouts}
              error={errorOf('workouts')}
              onChange={change('weeklyWorkouts', 'workouts')}
            />
            <SingleField
              id="dailyStepsTarget"
              icon={<Footprints size={18} className="text-primary" aria-hidden />}
              label="Passos por dia"
              hint="vem do celular"
              inputMode="numeric"
              value={draft.dailyStepsTarget}
              error={errorOf('steps')}
              onChange={change('dailyStepsTarget', 'steps')}
            />
          </div>
        </section>
      </fieldset>

      <YourNutrients />

      <Button type="submit" size="xl" full disabled={save.isPending}>
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

function SingleField({
  id,
  icon,
  label,
  hint,
  inputMode,
  value,
  error,
  onChange,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  inputMode: 'decimal' | 'numeric';
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-3">{icon}</span>
      <span className="min-w-0 flex-1 pt-1">
        <Label htmlFor={id} className="block text-sm font-bold">
          {label}
        </Label>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <div className="w-28">
        {/* O erro fica fora do Input: com `error` ele troca de árvore e o campo
          perde o foco no meio da digitação. */}
        <Input
          id={id}
          inputMode={inputMode}
          autoComplete="off"
          className="text-right tabular-nums"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-erro` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {error && (
          <p id={`${id}-erro`} role="alert" className="mt-1 text-right text-xs text-danger">
            {error}
          </p>
        )}
      </div>
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
        <h2
          id="seus-nutrientes"
          className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
        >
          Seus nutrientes
        </h2>
        <Link
          href="/nutrition/nutrient-targets"
          className="flex min-h-11 items-center text-sm font-bold text-primary"
        >
          Gerenciar
        </Link>
      </div>
      <div className="divide-y divide-subtle overflow-hidden rounded-2xl bg-card">
        {q.isLoading && <Skeleton className="m-4 h-10" />}
        {q.error && <LoadError error={q.error} onRetry={() => void q.refetch()} className="m-4" />}
        {nutrients.map((n) => (
          <NutrientLink key={n.nutrientKey} n={n} />
        ))}
        <Link
          href="/nutrition/nutrient-targets"
          className="flex min-h-12 items-center gap-2 px-4 py-3 text-sm font-bold text-primary"
        >
          <Plus size={16} aria-hidden />
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
  return (
    <Link
      href="/nutrition/nutrient-targets"
      className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{n.label}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          hoje {fmt(n.total)} {n.unit}
        </span>
      </span>
      <span className="text-sm tabular-nums">{kind ? `${kind} ${target}` : target}</span>
      <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
    </Link>
  );
}
