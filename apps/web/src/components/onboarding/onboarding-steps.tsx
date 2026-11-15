'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AI_COMMUNITY_COPY,
  BODY_REASONS,
  BODY_STEPPERS,
  CODE_STEP_COPY,
  HEALTH_STEP_COPY,
  KCAL_BAR,
  KCAL_STEP,
  NOTIFICATIONS_STEP_COPY,
  ONBOARDING_ACTIVITIES,
  ONBOARDING_OBJECTIVES,
  ONBOARDING_SEX,
  SHARE_SCOPE_ROWS,
  SHARE_STEP_COPY,
  TRIAL_BENEFITS,
  WEEKLY_WORKOUT_CHIPS,
  communityCodeHint,
  decimalLabel,
  firstNameOf,
  initialsOf,
  kcalBarPosition,
  kcalLabel,
  maskBrDate,
  namesLine,
  notificationsPreview,
  onboardingReminderOptions,
  rangeLabel,
  remindersCta,
  parseTypedBody,
  stepValue,
  stepsLabel,
  teamGoalsSummary,
  teamLine,
  waterLabel,
  welcomeHighlights,
  type ActivityLevel,
  type BiologicalSex,
  type BodyObjective,
  type CodeLookup,
  type GoalsInput,
  type OnboardingProgress,
  type OnboardingReminderKey,
  type ShareScope,
  type TeamMember,
} from '@fatia/api-client';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import {
  AVATAR_TONES,
  Avatar,
  Check,
  GhostButton,
  OnbChipIcon,
  PrimaryButton,
  ProgressBar,
  Spacer,
  StepHeader,
  StepScreen,
  StepperButton,
  Toggle,
  choiceCardClass,
  stagger,
} from './onboarding-ui';

/** O que toda etapa recebe do fluxo para o topo. */
export interface StepNav {
  segment: number;
  onBack: (() => void) | null;
  onSkip?: (() => void) | null;
}

// --- Onb-02 · Boas-vindas ------------------------------------------------------

export function WelcomeStep({
  groupName,
  team,
  sponsored,
  activeChallenge,
  segment,
  onContinue,
}: {
  groupName: string;
  team: TeamMember[];
  sponsored: boolean;
  activeChallenge: { title: string; participants: number } | null;
  segment: number;
  onContinue: () => void;
}) {
  const highlights = welcomeHighlights({ groupName, sponsored, activeChallenge });
  return (
    <StepScreen className="gap-4">
      <div className="-mx-5 -mt-6 h-[190px] bg-[linear-gradient(160deg,hsl(var(--brand)),#1a0c02)] px-6 pt-14">
        <ProgressBar segment={segment} onBrand />
      </div>
      <div className="-mt-[50px] flex">
        <span
          aria-hidden
          className="anim-pop inline-flex h-[72px] w-[72px] items-center justify-center rounded-[24px] bg-brand font-display text-xl font-bold text-brand-foreground ring-4 ring-background"
        >
          {initialsOf(groupName)}
        </span>
      </div>
      <div className="anim-up flex flex-col gap-1.5">
        <h1 className="font-display text-h1">Bem-vinda à {groupName}</h1>
        {team.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex">
              {team.slice(0, 3).map((m, i) => (
                <Avatar key={m.name} initials={initialsOf(m.name)} tone={AVATAR_TONES[i % 3]} />
              ))}
            </div>
            <span className="text-b2 text-muted-foreground">
              {namesLine(team.map((m) => m.name))}
            </span>
          </div>
        )}
      </div>
      <p className="text-eb uppercase text-faint">O que você ganha</p>
      <ul className="flex flex-col gap-3">
        {highlights.map((h, i) => (
          <li key={h.title} className="anim-up flex items-center gap-3" style={stagger(i + 1)}>
            <OnbChipIcon icon={h.icon} tone="brand" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{h.title}</p>
              <p className="text-xs text-faint">{h.subtitle}</p>
            </div>
            {h.badge && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                {h.badge}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Spacer />
      <PrimaryButton onClick={onContinue} className="bg-brand text-brand-foreground shadow-none">
        Continuar
      </PrimaryButton>
    </StepScreen>
  );
}

// --- Onb-03 · O que você compartilha ------------------------------------------

export function ShareStep({
  nav,
  team,
  required,
  pending,
  error,
  onAccept,
  onDecline,
  declineLabel = SHARE_STEP_COPY.decline,
}: {
  nav: StepNav;
  team: TeamMember[];
  required: readonly ShareScope[];
  pending: boolean;
  error: string | null;
  onAccept: (consent: { scopes: ShareScope[]; statsOptIn: boolean }) => void;
  onDecline: () => void;
  declineLabel?: string;
}) {
  // Nada vem marcado além do obrigatório (ADR 026): consentimento é escolha.
  const [chosen, setChosen] = useState<ShareScope[]>([]);
  const [aggregate, setAggregate] = useState(false);
  const lockedRows = SHARE_SCOPE_ROWS.filter((r) => required.includes(r.scope));
  const optionalRows = SHARE_SCOPE_ROWS.filter((r) => !required.includes(r.scope));
  const flip = (s: ShareScope) =>
    setChosen((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));

  return (
    <StepScreen>
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-h1">{SHARE_STEP_COPY.title}</h1>
        {team.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex">
              {team.slice(0, 2).map((m, i) => (
                <Avatar key={m.name} initials={initialsOf(m.name)} tone={AVATAR_TONES[i % 3]} />
              ))}
            </div>
            <span className="text-b2 text-muted-foreground">{teamLine(team)}</span>
          </div>
        )}
      </div>
      {lockedRows.length > 0 && (
        <>
          <p className="text-eb uppercase text-faint">{SHARE_STEP_COPY.required}</p>
          <ul className="overflow-hidden rounded-card bg-card">
            {lockedRows.map((r) => (
              <li key={r.scope}>
                <button
                  type="button"
                  aria-disabled
                  onClick={() => toast(SHARE_STEP_COPY.required)}
                  className="flex min-h-[60px] w-full items-center gap-3.5 px-[18px] py-3.5 text-left"
                >
                  <Icon name={r.icon} className="text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.label}</p>
                    <p className="text-[13px] text-muted-foreground">{r.subtitle}</p>
                  </div>
                  <Icon name="lock" size={16} className="text-faint" label="Obrigatório" />
                  <Toggle on dim />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-eb uppercase text-faint">{SHARE_STEP_COPY.optional}</p>
      <ul className="overflow-hidden rounded-card bg-card">
        {optionalRows.map((r) => {
          const on = chosen.includes(r.scope);
          return (
            <li
              key={r.scope}
              className="shadow-[inset_0_1px_0_hsl(var(--border-subtle))] first:shadow-none"
            >
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => flip(r.scope)}
                className="flex min-h-[60px] w-full items-center gap-3.5 px-[18px] py-3.5 text-left"
              >
                <Icon name={r.icon} className="text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.label}</p>
                  <p className="text-[13px] text-muted-foreground">{r.subtitle}</p>
                </div>
                <Toggle on={on} />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        role="checkbox"
        aria-checked={aggregate}
        onClick={() => setAggregate((a) => !a)}
        className="flex items-center gap-3 rounded-card bg-card px-[18px] py-4 text-left"
      >
        <Check on={aggregate} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{SHARE_STEP_COPY.aggregate}</p>
          <p className="text-xs text-faint">{SHARE_STEP_COPY.aggregateNote}</p>
        </div>
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Spacer />
      <PrimaryButton
        pending={pending}
        onClick={() =>
          onAccept({ scopes: [...new Set([...required, ...chosen])], statsOptIn: aggregate })
        }
      >
        {SHARE_STEP_COPY.accept}
      </PrimaryButton>
      <GhostButton onClick={onDecline} disabled={pending} className="text-muted-foreground">
        {declineLabel}
      </GhostButton>
    </StepScreen>
  );
}

// --- Onb-04 · Objetivo ---------------------------------------------------------

export function ObjectiveStep({
  nav,
  value,
  onChange,
  onContinue,
}: {
  nav: StepNav;
  value: BodyObjective | null;
  onChange: (v: BodyObjective) => void;
  onContinue: () => void;
}) {
  return (
    <StepScreen>
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <h1 className="mt-4 font-display text-h1">Qual é o seu objetivo?</h1>
      <div role="radiogroup" aria-label="Objetivo" className="flex flex-col gap-3">
        {ONBOARDING_OBJECTIVES.map((o, i) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={choiceCardClass(on)}
              style={stagger(i)}
            >
              <OnbChipIcon icon={o.icon} size={52} />
              <div className="min-w-0 flex-1">
                <p className="text-h3">{o.label}</p>
                <p className="text-b2 text-muted-foreground">{o.description}</p>
              </div>
              <Check on={on} round />
            </button>
          );
        })}
      </div>
      <Spacer />
      <PrimaryButton disabled={value === null} onClick={onContinue}>
        Continuar
      </PrimaryButton>
    </StepScreen>
  );
}

// --- Onb-05 · Sobre você --------------------------------------------------------

export interface BodyDraft {
  sex: BiologicalSex | null;
  /** dd/mm/aaaa enquanto se digita. */
  birthDate: string;
  heightCm: number;
  weightKg: number;
}

export function BodyStep({
  nav,
  value,
  error,
  onChange,
  onContinue,
}: {
  nav: StepNav;
  value: BodyDraft;
  error: string | null;
  onChange: (v: BodyDraft) => void;
  onContinue: () => void;
}) {
  const set = (patch: Partial<BodyDraft>) => onChange({ ...value, ...patch });
  const H = BODY_STEPPERS.height;
  const W = BODY_STEPPERS.weight;
  return (
    <StepScreen className="gap-3">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <div className="mt-2 flex flex-col gap-1">
        <h1 className="font-display text-h1">Sobre você</h1>
        <p className="text-b2 text-muted-foreground">{BODY_REASONS.intro}</p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <legend className="text-[13px] font-semibold text-muted-foreground">
            Sexo biológico
          </legend>
          <span className="text-xs text-faint">{BODY_REASONS.sex}</span>
        </div>
        <div
          role="radiogroup"
          aria-label="Sexo biológico"
          className="flex gap-1 rounded-[16px] bg-card p-1"
        >
          {ONBOARDING_SEX.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value.sex === o.value}
              onClick={() => set({ sex: o.value })}
              className={cn(
                'h-11 flex-1 rounded-[12px] text-sm font-semibold transition-colors duration-fast',
                value.sex === o.value ? 'bg-foreground text-background' : 'text-muted-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="onb-nasc" className="text-[13px] font-semibold text-muted-foreground">
            Nascimento
          </label>
          <span className="text-xs text-faint">{BODY_REASONS.birthDate}</span>
        </div>
        <input
          id="onb-nasc"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="dd/mm/aaaa"
          value={value.birthDate}
          onChange={(e) => set({ birthDate: maskBrDate(e.target.value) })}
          className="h-[52px] w-full rounded-field border-[1.5px] border-transparent bg-card px-[18px] text-base font-bold text-foreground outline-none focus:border-primary focus:shadow-[0_0_0_4px_hsl(var(--primary-soft))]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <BodyStepper
          label="Altura"
          unit="cm"
          display={String(value.heightCm)}
          onMinus={() => set({ heightCm: stepValue(value.heightCm, -H.step, H) })}
          onPlus={() => set({ heightCm: stepValue(value.heightCm, H.step, H) })}
          minusLabel="Menos altura"
          plusLabel="Mais altura"
          limits={H}
          onType={(n) => set({ heightCm: n })}
        />
        <BodyStepper
          label="Peso"
          unit="kg"
          display={decimalLabel(value.weightKg)}
          onMinus={() => set({ weightKg: stepValue(value.weightKg, -W.step, W) })}
          onPlus={() => set({ weightKg: stepValue(value.weightKg, W.step, W) })}
          minusLabel="Menos peso"
          plusLabel="Mais peso"
          limits={W}
          onType={(n) => set({ weightKg: n })}
        />
      </div>
      <p className="flex items-center gap-2 text-xs text-faint">
        <Icon name="info" size={16} />
        {BODY_REASONS.size}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Spacer />
      <div className="flex items-center gap-2.5 rounded-card bg-surface-3/60 px-[18px] py-4">
        <Icon name="shield" className="text-muted-foreground" />
        <span className="flex-1 text-xs text-faint">{BODY_REASONS.privacy}</span>
      </div>
      <PrimaryButton
        disabled={value.sex === null || value.birthDate.length < 10}
        onClick={onContinue}
      >
        Continuar
      </PrimaryButton>
    </StepScreen>
  );
}

/**
 * Altura e peso: o número é um campo de verdade (dá para digitar), e o − e o +
 * ficam para o ajuste fino. A prancha só tinha os botões; digitar é mais rápido
 * para quem sabe o próprio peso.
 */
function BodyStepper({
  label,
  unit,
  display,
  limits,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
  onType,
}: {
  label: string;
  unit: string;
  display: string;
  limits: { min: number; max: number; step: number };
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
  onType: (n: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const commit = () => {
    const n = parseTypedBody(editing ?? '', limits);
    if (n !== null) onType(n);
    setEditing(null);
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <div className="flex flex-col items-center gap-2.5 rounded-card bg-card px-2.5 py-3.5">
        <label className="flex items-baseline gap-1 rounded-[12px] border-[1.5px] border-transparent bg-background px-2 py-1 focus-within:border-primary">
          <span className="sr-only">{`${label} em ${unit}`}</span>
          <input
            inputMode={limits.step >= 1 ? 'numeric' : 'decimal'}
            enterKeyHint="done"
            value={editing ?? display}
            onFocus={(e) => {
              setEditing(display);
              e.currentTarget.select();
            }}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setEditing(null);
                e.currentTarget.blur();
              }
            }}
            onBlur={commit}
            className="w-[4.5ch] bg-transparent text-center font-display text-d3 tabular-nums outline-none"
          />
          <span className="text-sm font-semibold text-muted-foreground">{unit}</span>
        </label>
        <div className="flex gap-2">
          <StepperButton kind="minus" label={minusLabel} onClick={onMinus} />
          <StepperButton kind="plus" label={plusLabel} onClick={onPlus} />
        </div>
      </div>
    </div>
  );
}

// --- Onb-06 · Rotina -------------------------------------------------------------

export function ActivityStep({
  nav,
  value,
  pending,
  error,
  onChange,
  onContinue,
  resumed,
}: {
  nav: StepNav;
  value: ActivityLevel | null;
  pending: boolean;
  error: string | null;
  onChange: (v: ActivityLevel) => void;
  onContinue: () => void;
  /** Onb-Retomada: o aviso "Salvo a cada passo" embaixo das opções. */
  resumed?: ReactNode;
}) {
  return (
    <StepScreen className="gap-3">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <h1 className="mt-2 font-display text-h1">Como é seu dia a dia?</h1>
      <p className="-mt-1.5 text-b2 text-muted-foreground">
        Conta treino e trabalho. Entra no cálculo do gasto.
      </p>
      <div role="radiogroup" aria-label="Nível de atividade" className="flex flex-col gap-2">
        {ONBOARDING_ACTIVITIES.map((o, i) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={choiceCardClass(on, true)}
              style={stagger(i)}
            >
              <span aria-hidden className="flex h-6 w-9 items-end gap-[3px]">
                {[28, 46, 64, 82, 100].map((h, bar) => (
                  <i
                    key={h}
                    style={{ height: `${h}%` }}
                    className={cn(
                      'flex-1 rounded-[2px]',
                      bar < o.level ? 'bg-primary' : 'bg-surface-3',
                    )}
                  />
                ))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{o.label}</p>
                <p className="text-xs text-faint">{o.description}</p>
              </div>
            </button>
          );
        })}
      </div>
      {resumed}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Spacer />
      <PrimaryButton disabled={value === null} pending={pending} onClick={onContinue}>
        {pending ? 'Calculando…' : 'Calcular minhas metas'}
      </PrimaryButton>
    </StepScreen>
  );
}

// --- Onb-07 e Onb-07b · Metas ----------------------------------------------------

export function GoalsStep({
  nav,
  goals,
  tdee,
  team,
  source,
  pending,
  error,
  onShift,
  onWorkouts,
  onSource,
  onContinue,
}: {
  nav: StepNav;
  /** As do app (a faixa da régua). */
  goals: GoalsInput;
  tdee: number | null;
  team: OnboardingProgress['teamSuggestion'];
  source: 'app' | 'team';
  pending: boolean;
  error: string | null;
  onShift: (delta: number) => void;
  onWorkouts: (n: number) => void;
  onSource: (s: 'app' | 'team') => void;
  onContinue: () => void;
}) {
  const shown = source === 'team' && team ? { ...goals, ...team.goals } : goals;
  const bar = kcalBarPosition(goals);
  const author = firstNameOf(team?.authorName) ?? team?.groupName ?? 'equipe';
  const summary = team ? teamGoalsSummary(team.goals) : null;
  return (
    <StepScreen className="gap-3">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <div className="mt-1.5 flex flex-col gap-1">
        <span className="text-b2 text-muted-foreground">Calorias por dia</span>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2" aria-live="polite">
            <span className="font-display text-d2 tabular-nums">{kcalLabel(goals.kcalMin)}</span>
            <span className="text-h3 text-faint">–</span>
            <span className="font-display text-d2 tabular-nums">{kcalLabel(goals.kcalMax)}</span>
          </div>
          <div className="flex gap-1.5">
            <StepperButton
              kind="minus"
              label="Diminuir calorias"
              onClick={() => onShift(-KCAL_STEP)}
              disabled={goals.kcalMin <= KCAL_BAR.min}
            />
            <StepperButton
              kind="plus"
              label="Aumentar calorias"
              onClick={() => onShift(KCAL_STEP)}
              disabled={goals.kcalMax >= KCAL_BAR.max}
            />
          </div>
        </div>
        <span className="text-xs text-faint">
          kcal{tdee ? ` · gasto estimado ${kcalLabel(tdee)}` : ''}
        </span>
      </div>
      <div aria-hidden className="relative mb-[18px] mt-1 h-3.5 rounded-[7px] bg-card">
        <div
          className="absolute inset-y-0 rounded-[7px] bg-primary transition-[left,width] duration-base ease-ds"
          style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
        />
        <span className="absolute left-0 top-[18px] text-xs text-faint">
          {kcalLabel(KCAL_BAR.min)}
        </span>
        <span className="absolute right-0 top-[18px] text-xs text-faint">
          {kcalLabel(KCAL_BAR.max)}
        </span>
      </div>
      {team && summary && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-faint">Qual meta usar?</span>
          <div role="radiogroup" aria-label="Qual meta usar" className="flex gap-2">
            <SourceCard
              selected={source === 'app'}
              onClick={() => onSource('app')}
              kicker="Calculado pelo app"
              value={`${kcalLabel(goals.kcalMin)}–${kcalLabel(goals.kcalMax)}`}
              note="pelo seu objetivo"
            />
            <SourceCard
              selected={source === 'team'}
              onClick={() => onSource('team')}
              kicker={`Sugerido por ${author}`}
              value={summary.kcal}
              note={summary.macros}
              initials={team.authorName ? initialsOf(team.authorName) : undefined}
            />
          </div>
        </div>
      )}
      <ul className="overflow-hidden rounded-card bg-card">
        {(
          [
            ['Proteína', 'bg-protein', shown.proteinMinG, shown.proteinMaxG],
            ['Carboidrato', 'bg-carbs', shown.carbsMinG, shown.carbsMaxG],
            ['Gordura', 'bg-fat', shown.fatMinG, shown.fatMaxG],
          ] as const
        ).map(([label, dot, min, max]) => (
          <li
            key={label}
            className="flex min-h-[60px] items-center gap-3.5 px-[18px] shadow-[inset_0_1px_0_hsl(var(--border-subtle))] first:shadow-none"
          >
            <span aria-hidden className={cn('h-2 w-2 rounded-full', dot)} />
            <span className="flex-1 font-semibold">{label}</span>
            <span className="font-bold tabular-nums">{rangeLabel(min, max, 'g')}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <span className="font-semibold">Treinos por semana</span>
        <div role="radiogroup" aria-label="Treinos por semana" className="flex gap-1.5">
          {WEEKLY_WORKOUT_CHIPS.map((n) => {
            const on =
              (goals.weeklyWorkouts ?? 3) === n || (n === 5 && (goals.weeklyWorkouts ?? 0) > 5);
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onWorkouts(n)}
                className={cn(
                  'flex h-9 w-11 items-center justify-center rounded-[10px] text-sm font-semibold transition-colors duration-fast',
                  on ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
                )}
              >
                {n === 5 ? '5+' : n}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2 rounded-card bg-card px-[18px] py-4">
          <Icon name="drop" className="text-water" />
          <span className="font-bold tabular-nums">{waterLabel(goals.dailyWaterTargetMl)}</span>
        </div>
        <div className="flex flex-col gap-2 rounded-card bg-card px-[18px] py-4">
          <Icon name="steps" className="text-steps" />
          <span className="font-bold tabular-nums">{stepsLabel(goals.dailyStepsTarget)}</span>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Spacer />
      <PrimaryButton pending={pending} onClick={onContinue}>
        {pending
          ? 'Salvando…'
          : source === 'team' && team
            ? `Usar a meta de ${author}`
            : 'Usar estas metas'}
      </PrimaryButton>
    </StepScreen>
  );
}

function SourceCard({
  selected,
  onClick,
  kicker,
  value,
  note,
  initials,
}: {
  selected: boolean;
  onClick: () => void;
  kicker: string;
  value: string;
  note: string;
  initials?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col gap-1 rounded-card px-3.5 py-3 text-left transition-shadow duration-fast',
        selected ? 'bg-card shadow-[inset_0_0_0_2px_hsl(var(--primary))]' : 'bg-card/70',
      )}
    >
      <span className="flex items-center gap-1.5">
        {initials && (
          <span
            aria-hidden
            className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#2f4a7a] font-display text-[9px] font-bold text-[#dbe6ff]"
          >
            {initials}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{kicker}</span>
      </span>
      <b className="text-[17px] tabular-nums">{value}</b>
      <span className="text-xs text-faint">{note}</span>
    </button>
  );
}

// --- Onb-08 · Lembretes ------------------------------------------------------------

export function RemindersStep({
  nav,
  weeklyWorkouts,
  pending,
  onContinue,
}: {
  nav: StepNav;
  weeklyWorkouts: number;
  pending: boolean;
  onContinue: (selected: OnboardingReminderKey[]) => void;
}) {
  const options = onboardingReminderOptions(weeklyWorkouts);
  const [selected, setSelected] = useState<OnboardingReminderKey[]>(
    options.filter((o) => o.initial).map((o) => o.key),
  );
  const flip = (k: OnboardingReminderKey) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  return (
    <StepScreen>
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <div className="mt-2 flex flex-col gap-3">
        <OnbChipIcon icon="clock" size={64} className="anim-pop" />
        <h1 className="font-display text-h1">Um empurrãozinho na hora certa?</h1>
      </div>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => {
          const on = selected.includes(o.key);
          return (
            <button
              key={o.key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => flip(o.key)}
              className={cn(
                'anim-up flex items-center gap-3 rounded-card bg-card p-5 text-left transition-shadow duration-fast',
                on && 'shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
              )}
              style={stagger(i)}
            >
              <OnbChipIcon icon={o.icon} tone={o.tone} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{o.title}</p>
                <p className="text-xs text-faint">{o.subtitle}</p>
              </div>
              <Toggle on={on} />
            </button>
          );
        })}
      </div>
      <p className="text-xs text-faint">Ajuste horários e dias depois, em Lembretes.</p>
      <Spacer />
      <PrimaryButton pending={pending} onClick={() => onContinue(selected)}>
        {remindersCta(selected.length)}
      </PrimaryButton>
    </StepScreen>
  );
}

// --- Onb-09 · Notificações -----------------------------------------------------------

export function NotificationsStep({
  nav,
  communityName,
  pending,
  onEnable,
  onLater,
}: {
  nav: StepNav;
  communityName: string | null;
  pending: boolean;
  onEnable: () => void;
  onLater: () => void;
}) {
  const preview = notificationsPreview(communityName);
  const styles = [
    'top-0 scale-[.92] bg-card opacity-55',
    'top-14 scale-[.96] bg-surface-3/70',
    'top-[118px] bg-surface-3 shadow-[0_20px_40px_-12px_rgba(0,0,0,.8)]',
  ];
  return (
    <StepScreen>
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <div aria-hidden className="relative mt-5 h-[200px]">
        {preview.map((p, i) => (
          <div
            key={p.body}
            style={stagger(i + 1)}
            className={cn(
              'anim-up absolute inset-x-0 flex items-start gap-3 rounded-[18px] px-4 py-3',
              styles[i],
            )}
          >
            {p.brand ? (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-brand text-[11px] font-bold text-brand-foreground">
                {initialsOf(communityName ?? 'Fatia')}
              </span>
            ) : (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
                <Icon name="spark" size={16} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold">{p.title}</p>
              <p className="text-b2">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
      <h1 className="font-display text-h1">{NOTIFICATIONS_STEP_COPY.title}</h1>
      <p className="text-b2 text-muted-foreground">{NOTIFICATIONS_STEP_COPY.body}</p>
      <Spacer />
      <PrimaryButton pending={pending} onClick={onEnable}>
        Ativar notificações
      </PrimaryButton>
      <GhostButton onClick={onLater}>Agora não</GhostButton>
    </StepScreen>
  );
}

// --- Onb-Codigo · Tem código de uma comunidade? -------------------------------------

export function CodeStep({
  nav,
  lookup,
  onCode,
  onScan,
  scanAvailable,
  onJoin,
  onNoCode,
}: {
  nav: StepNav;
  lookup: CodeLookup;
  onCode: (code: string) => void;
  onScan: () => void;
  scanAvailable: boolean;
  onJoin: () => void;
  onNoCode: () => void;
}) {
  const ok = lookup.status === 'found';
  return (
    <StepScreen>
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <div className="mt-3 flex flex-col gap-3">
        <OnbChipIcon icon="users" tone="brand" size={64} className="anim-pop" />
        <h1 className="font-display text-h1">{CODE_STEP_COPY.title}</h1>
        <p className="text-b2 text-muted-foreground">{CODE_STEP_COPY.body}</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">
          Código da comunidade
        </span>
        <input
          value={lookup.code}
          onChange={(e) => onCode(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="EX.: DEMO30"
          className="h-16 w-full rounded-field border-[1.5px] border-transparent bg-card px-4 text-center font-display text-[28px] font-bold uppercase tracking-[0.3em] text-foreground outline-none placeholder:text-faint focus:border-primary"
        />
      </label>
      <span role="status" className="text-xs text-faint">
        {communityCodeHint(lookup)}
      </span>
      {scanAvailable && (
        <button
          type="button"
          onClick={onScan}
          className="flex h-11 items-center gap-2 self-start rounded-[12px] bg-card px-[18px] text-sm font-bold"
        >
          <Icon name="qr" size={16} />
          Ler QR da recepção
        </button>
      )}
      <Spacer />
      {ok && <span className="text-xs text-faint">{CODE_STEP_COPY.ready}</span>}
      <PrimaryButton disabled={!ok} onClick={onJoin}>
        Entrar na comunidade
      </PrimaryButton>
      <GhostButton onClick={onNoCode}>Não tenho código</GhostButton>
    </StepScreen>
  );
}

// --- Onb-10a · IA pela comunidade ---------------------------------------------------

export interface PhotoResult {
  items: { name: string; grams: number }[];
  kcal: number;
  macros: string;
}

export function AiCommunityStep({
  nav,
  groupName,
  phase,
  result,
  error,
  onTest,
  onSave,
  onLater,
  onOtherCode,
  saving,
}: {
  nav: StepNav;
  groupName: string;
  phase: 'idle' | 'scanning' | 'done';
  result: PhotoResult | null;
  error: string | null;
  onTest: () => void;
  onSave: () => void;
  onLater: () => void;
  onOtherCode: () => void;
  saving: boolean;
}) {
  const positions = ['left-[18px] top-[30px]', 'right-5 top-[70px]', 'bottom-7 left-[60px]'];
  return (
    <StepScreen>
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <span className="mt-1 self-start rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand">
        PRO · {groupName}
      </span>
      <h1 className="font-display text-h1">Você tem a IA pela {groupName}</h1>
      <div className="overflow-hidden rounded-card bg-card">
        <div className="relative flex h-[200px] items-center justify-center bg-surface-3 text-sm text-faint">
          {phase === 'idle' && 'foto do prato'}
          {phase === 'scanning' && (
            <span
              aria-hidden
              className="absolute inset-x-0 h-0.5 animate-[onb-scan_1.2s_ease-in-out_infinite] bg-primary shadow-[0_0_14px_hsl(var(--primary))] motion-reduce:animate-none"
            />
          )}
          {phase === 'done' &&
            result?.items.slice(0, 3).map((it, i) => (
              <span
                key={it.name}
                style={stagger(i * 2)}
                className={cn(
                  'anim-pop absolute flex h-[30px] items-center rounded-[10px] bg-black/75 px-3 text-xs font-semibold text-white',
                  positions[i],
                )}
              >
                {it.name} · {Math.round(it.grams)} g
              </span>
            ))}
        </div>
        {phase === 'done' && result ? (
          <div className="anim-up flex items-center justify-between px-5 py-4">
            <b className="tabular-nums">{kcalLabel(Math.round(result.kcal))} kcal</b>
            <span className="text-xs text-faint">{result.macros}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-b2 text-muted-foreground">
              {phase === 'scanning' ? 'Analisando o prato…' : 'Toque em testar para ver'}
            </span>
            <Icon name="camera" className="text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="text-b2 text-muted-foreground">{AI_COMMUNITY_COPY.review}</p>
      <p className="text-xs text-faint">
        {AI_COMMUNITY_COPY.provider(null)}{' '}
        <a href="/privacy" className="underline">
          Como tratamos seus dados
        </a>
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Spacer />
      {phase === 'done' ? (
        <PrimaryButton pending={saving} onClick={onSave}>
          Revisar e salvar
        </PrimaryButton>
      ) : (
        <PrimaryButton pending={phase === 'scanning'} onClick={onTest}>
          <Icon name="camera" size={16} />
          {phase === 'scanning' ? 'Analisando…' : 'Concordo e testar com meu almoço'}
        </PrimaryButton>
      )}
      <GhostButton onClick={onLater}>Depois</GhostButton>
      <span className="text-center text-xs text-faint">
        {AI_COMMUNITY_COPY.onlySeat}{' '}
        <button type="button" onClick={onOtherCode} className="font-bold text-primary">
          Tenho outro código
        </button>
      </span>
    </StepScreen>
  );
}

// --- Onb-10b · 7 dias de IA, grátis -------------------------------------------------

export function AiTrialStep({
  nav,
  terms,
  pending,
  onStart,
  onLater,
}: {
  nav: StepNav;
  terms: string;
  pending: boolean;
  onStart: () => void;
  onLater: () => void;
}) {
  return (
    <StepScreen>
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <div aria-hidden className="mt-5 flex justify-center">
        <OnbChipIcon icon="chat" size={72} className="anim-pop -rotate-[8deg]" />
        <span
          style={stagger(1)}
          className="anim-pop z-[1] -ml-3 inline-flex h-[72px] w-[72px] items-center justify-center rounded-[24px] bg-primary text-primary-foreground"
        >
          <Icon name="camera" size={32} />
        </span>
        <OnbChipIcon icon="mic" size={72} className="anim-pop -ml-3 rotate-[8deg]" />
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-h1">7 dias de IA, grátis</h1>
        <p className="text-b2 text-muted-foreground">
          Fotografe ou fale o que comeu e a IA monta a refeição.
        </p>
      </div>
      <ul className="overflow-hidden rounded-card bg-card">
        {TRIAL_BENEFITS.map((b) => (
          <li
            key={b.label}
            className="flex min-h-[52px] items-center gap-3.5 px-[18px] shadow-[inset_0_1px_0_hsl(var(--border-subtle))] first:shadow-none"
          >
            <Icon name={b.icon} className="text-primary" />
            <span className="flex-1 font-semibold">{b.label}</span>
          </li>
        ))}
      </ul>
      <Spacer />
      <p className="text-center text-xs text-faint">
        {terms}{' '}
        <a href="/terms" className="underline">
          Termos de uso
        </a>{' '}
        ·{' '}
        <a href="/privacy" className="underline">
          Privacidade
        </a>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onLater}
          className="h-14 rounded-[16px] bg-card text-[15px] font-bold"
        >
          Agora não
        </button>
        <PrimaryButton pending={pending} onClick={onStart} className="h-14">
          Começar teste
        </PrimaryButton>
      </div>
    </StepScreen>
  );
}

// --- Onb-P1 · Saúde do celular (só no app) ------------------------------------------

export const HEALTH_COPY = HEALTH_STEP_COPY;

/** "Continuando de onde parou" (Onb-Retomada): toast no topo e o aviso salvo. */
export function ResumeToast({ text }: { text: string }) {
  const [show, setShow] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timer.current = setTimeout(() => setShow(false), 2600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  if (!show) return null;
  return (
    <div
      role="status"
      className="anim-toast fixed left-1/2 top-[calc(env(safe-area-inset-top)+16px)] z-50 flex -translate-x-1/2 items-center gap-2 rounded-pill bg-foreground px-4 py-2.5 text-sm font-bold text-background shadow-lg"
    >
      <Icon name="repeat" size={16} />
      {text}
    </div>
  );
}

export function ResumeNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="anim-up flex flex-col gap-1.5 rounded-card bg-surface-3/60 px-[18px] py-4">
      <span className="text-eb uppercase text-faint">{title}</span>
      <span className="text-b2 text-muted-foreground">{body}</span>
    </div>
  );
}
