'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import {
  ACTIVITY_OPTIONS,
  GOAL_RANGES,
  GOAL_SINGLES,
  OBJECTIVE_OPTIONS,
  ONBOARDING_STEPS,
  SEX_OPTIONS,
  bodyFromForm,
  goalsFromForm,
  goalsToForm,
  initialBodyForm,
  nutritionApi,
  progressApi,
  usersApi,
  type ActivityLevel,
  type BodyErrors,
  type BodyForm,
  type BodyObjective,
  type GoalSuggestion,
  type GoalsErrors,
  type GoalsForm,
  type GoalsInput,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hojeIso } from '@/lib/dias';
import { cn } from '@/lib/utils';

const kcal = (n: number) => n.toLocaleString('pt-BR');

/**
 * Assistente de primeira vez: objetivo → corpo → rotina → metas sugeridas.
 *
 * A conta é da API (a mesma do `suggest_nutrition_goals`); a tela só junta os
 * dados e deixa a pessoa editar o resultado antes de salvar. "Pular" fica em
 * todo passo: ninguém é obrigado a informar nascimento para registrar um café.
 */
export function OnboardingWizard({ redo = false }: { redo?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [objective, setObjective] = useState<BodyObjective | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [body, setBody] = useState<BodyForm | null>(null);
  const [bodyErrors, setBodyErrors] = useState<BodyErrors>({});
  const [suggestion, setSuggestion] = useState<GoalSuggestion | null>(null);
  const [goals, setGoals] = useState<GoalsForm | null>(null);
  const [goalsErrors, setGoalsErrors] = useState<GoalsErrors>({});

  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const weights = useQuery({
    queryKey: ['progress', 'weights', 'latest'],
    queryFn: () => progressApi.listWeights(),
  });

  // Preenche uma vez, quando os dois chegam: o que a pessoa digitar depois manda.
  // Objetivo e atividade só entram se ainda não há escolha: o passo 1 aparece
  // antes do perfil chegar, e um toque feito nesse meio-tempo não pode ser
  // trocado pelo valor salvo.
  const ready = me.isFetched && weights.isFetched;
  if (ready && body === null) {
    setBody(initialBodyForm(me.data, weights.data?.logs[0]?.weightKg ?? null));
    const salvo = me.data;
    if (salvo?.objective) setObjective((atual) => atual ?? salvo.objective);
    if (salvo?.activityLevel) setActivity((atual) => atual ?? salvo.activityLevel);
  }

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['users', 'me'] });
    router.replace(redo ? '/nutrition/goals' : '/');
  };

  const suggest = useMutation({
    mutationFn: () => {
      const parsed = bodyFromForm(body!, hojeIso());
      if (!parsed.ok) throw new Error('corpo inválido');
      return nutritionApi.suggestGoals({
        ...parsed.body,
        objective: objective!,
        activityLevel: activity!,
      });
    },
    onSuccess: (s) => {
      setSuggestion(s);
      setGoals(goalsToForm(s.goals));
      setGoalsErrors({});
      setStep(3);
    },
  });

  const complete = useMutation({
    mutationFn: (accepted: GoalsInput) => {
      const parsed = bodyFromForm(body!, hojeIso());
      if (!parsed.ok) throw new Error('corpo inválido');
      return usersApi.completeOnboarding({
        ...parsed.body,
        objective: objective!,
        activityLevel: activity!,
        goals: accepted,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
      done();
    },
  });

  const skip = useMutation({
    mutationFn: () => usersApi.skipOnboarding(),
    onSuccess: done,
  });

  const onSkip = () => {
    if (redo) router.replace('/nutrition/goals');
    else skip.mutate();
  };

  const next = () => {
    if (step === 1) {
      const parsed = bodyFromForm(body!, hojeIso());
      if (!parsed.ok) {
        setBodyErrors(parsed.errors);
        return;
      }
      setBodyErrors({});
    }
    if (step === 2) {
      suggest.mutate();
      return;
    }
    setStep((s) => s + 1);
  };

  const save = () => {
    const parsed = goalsFromForm(goals!);
    if (!parsed.ok) {
      setGoalsErrors(parsed.errors);
      return;
    }
    setGoalsErrors({});
    complete.mutate(parsed.goals);
  };

  const current = ONBOARDING_STEPS[step];
  const canAdvance =
    (step === 0 && objective !== null) ||
    (step === 1 && body !== null) ||
    (step === 2 && activity !== null);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex items-center gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              aria-label="Voltar"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft size={22} />
            </button>
          ) : (
            <span className="h-11 w-11" aria-hidden />
          )}
          <div
            role="progressbar"
            aria-label="Progresso"
            aria-valuemin={1}
            aria-valuemax={ONBOARDING_STEPS.length}
            aria-valuenow={step + 1}
            aria-valuetext={`Passo ${step + 1} de ${ONBOARDING_STEPS.length}`}
            className="flex flex-1 gap-1.5"
          >
            {ONBOARDING_STEPS.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  i <= step ? 'bg-primary' : 'bg-secondary',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onSkip}
            disabled={skip.isPending}
            className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            {redo ? 'Cancelar' : 'Pular por agora'}
          </button>
        </div>
        <h1 className="text-2xl font-extrabold">{current.title}</h1>
      </header>

      {step === 0 && (
        <Choices
          label="Objetivo"
          options={OBJECTIVE_OPTIONS}
          value={objective}
          onChange={setObjective}
        />
      )}

      {step === 1 && body && <BodyStep body={body} errors={bodyErrors} onChange={setBody} />}
      {step === 1 && !body && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {step === 2 && (
        <Choices
          label="Nível de atividade"
          options={ACTIVITY_OPTIONS}
          value={activity}
          onChange={setActivity}
        />
      )}

      {step === 3 && suggestion && goals && (
        <GoalsStep suggestion={suggestion} goals={goals} errors={goalsErrors} onChange={setGoals} />
      )}

      {(suggest.error || complete.error || skip.error) && (
        <p role="alert" className="text-sm text-danger">
          {((suggest.error ?? complete.error ?? skip.error) as Error).message}
        </p>
      )}

      {step < 3 ? (
        <Button
          type="button"
          className="h-12 w-full text-base font-bold"
          disabled={!canAdvance || suggest.isPending}
          onClick={next}
        >
          {step === 2 ? (suggest.isPending ? 'Calculando…' : 'Calcular minhas metas') : 'Continuar'}
        </Button>
      ) : (
        <Button
          type="button"
          className="h-12 w-full text-base font-bold"
          disabled={complete.isPending}
          onClick={save}
        >
          {complete.isPending ? 'Salvando…' : 'Usar estas metas'}
        </Button>
      )}
    </div>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; description: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-3">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex w-full flex-col items-start gap-1 rounded-2xl border bg-card px-4 py-4 text-left transition-colors',
              selected ? 'border-primary ring-1 ring-primary' : 'border-subtle hover:bg-card/80',
            )}
          >
            <span className="text-base font-bold">{o.label}</span>
            <span className="text-sm text-muted-foreground">{o.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-erro`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function BodyStep({
  body,
  errors,
  onChange,
}: {
  body: BodyForm;
  errors: BodyErrors;
  onChange: (b: BodyForm) => void;
}) {
  const set = (patch: Partial<BodyForm>) => onChange({ ...body, ...patch });
  const input = (key: 'birthDate' | 'heightCm' | 'weightKg') => ({
    id: key,
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${key}-erro` : undefined,
    className: 'h-12 text-base',
  });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Usados só para estimar quanto o seu corpo gasta. Ninguém mais vê.
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Sexo biológico</legend>
        <div role="radiogroup" aria-label="Sexo biológico" className="grid grid-cols-2 gap-3">
          {SEX_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={body.sex === o.value}
              onClick={() => set({ sex: o.value })}
              className={cn(
                'h-12 rounded-xl border bg-card text-sm font-semibold',
                body.sex === o.value ? 'border-primary ring-1 ring-primary' : 'border-subtle',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {errors.sex && <p className="text-xs text-danger">{errors.sex}</p>}
      </fieldset>
      <Field id="birthDate" label="Data de nascimento" error={errors.birthDate}>
        <Input
          {...input('birthDate')}
          type="date"
          max={hojeIso()}
          value={body.birthDate}
          onChange={(e) => set({ birthDate: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="heightCm" label="Altura (cm)" error={errors.heightCm}>
          <Input
            {...input('heightCm')}
            inputMode="decimal"
            value={body.heightCm}
            onChange={(e) => set({ heightCm: e.target.value })}
          />
        </Field>
        <Field id="weightKg" label="Peso (kg)" error={errors.weightKg}>
          <Input
            {...input('weightKg')}
            inputMode="decimal"
            value={body.weightKg}
            onChange={(e) => set({ weightKg: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function GoalsStep({
  suggestion,
  goals,
  errors,
  onChange,
}: {
  suggestion: GoalSuggestion;
  goals: GoalsForm;
  errors: GoalsErrors;
  onChange: (g: GoalsForm) => void;
}) {
  const set = (key: keyof GoalsForm, value: string) => onChange({ ...goals, [key]: value });
  const goalInput = (key: keyof GoalsForm, label: string, accessibleName = label) => (
    <div className="space-y-1">
      <Label htmlFor={key} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={key}
        aria-label={accessibleName}
        inputMode="numeric"
        className="h-11"
        value={goals[key]}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${key}-erro` : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {errors[key] && (
        <p id={`${key}-erro`} className="text-xs text-danger">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <section aria-label="Estimativa" className="rounded-2xl border border-subtle bg-card p-4">
        <p className="text-xs font-bold tracking-wide text-muted-foreground">SEU GASTO ESTIMADO</p>
        <p className="mt-1 text-3xl font-extrabold">
          {kcal(suggestion.tdee)} <span className="text-base font-semibold">kcal/dia</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Para o seu objetivo, a sugestão é em torno de{' '}
          <strong className="text-foreground">{kcal(suggestion.targetKcal)} kcal</strong>. É um
          ponto de partida: ajuste o que quiser, e reveja daqui a umas semanas.
        </p>
      </section>

      {GOAL_RANGES.map((r) => (
        <fieldset key={r.min} className="space-y-2">
          <legend className="text-sm font-semibold">
            {r.label} ({r.unit} por dia)
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {goalInput(r.min, 'Mínimo', `${r.label}: mínimo`)}
            {goalInput(r.max, 'Máximo', `${r.label}: máximo`)}
          </div>
        </fieldset>
      ))}

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Atividade e hidratação</legend>
        <div className="grid grid-cols-3 gap-3">
          {GOAL_SINGLES.map((s) => (
            <div key={s.key}>{goalInput(s.key, s.label)}</div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
