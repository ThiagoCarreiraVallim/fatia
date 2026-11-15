import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
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
import { Icon, Text, cn, useToast } from '@/components/ui';
import { colors } from '@/theme/colors';
import {
  AVATAR_TONES,
  Avatar,
  Check,
  GhostButton,
  OnbChipIcon,
  PrimaryButton,
  ProgressBar,
  StepHeader,
  StepperButton,
  Toggle,
  choiceCardClass,
} from './onboarding-ui';

/**
 * As telas Onb-* no app, espelho de `apps/web/src/components/onboarding/onboarding-steps.tsx`:
 * mesmos textos e contas (de `@fatia/api-client`), só o desenho é nativo.
 */

export interface StepNav {
  segment: number;
  onBack: (() => void) | null;
  onSkip?: (() => void) | null;
}

const Spacer = () => <View className="min-h-4 flex-1" />;

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <Text accessibilityRole="alert" className="text-sm text-danger">
      {error}
    </Text>
  ) : null;
}

function TeamStack({ team, max }: { team: TeamMember[]; max: number }) {
  return (
    <View className="flex-row">
      {team.slice(0, max).map((m, i) => (
        <Avatar
          key={m.name}
          initials={initialsOf(m.name)}
          tone={AVATAR_TONES[i % 3]}
          first={i === 0}
        />
      ))}
    </View>
  );
}

// --- Onb-02 ---------------------------------------------------------------------

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
    <View className="flex-1 gap-4">
      <View className="-mx-5 -mt-6 h-[190px] bg-brand px-6 pt-14">
        <ProgressBar segment={segment} onBrand />
      </View>
      <View className="-mt-[50px] h-[72px] w-[72px] items-center justify-center rounded-[24px] border-4 border-background bg-brand">
        <Text className="font-display text-xl text-brand-foreground">{initialsOf(groupName)}</Text>
      </View>
      <View className="gap-1.5">
        <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
          Bem-vinda à {groupName}
        </Text>
        {team.length > 0 ? (
          <View className="flex-row items-center gap-2">
            <TeamStack team={team} max={3} />
            <Text className="text-b2 text-muted-foreground">
              {namesLine(team.map((m) => m.name))}
            </Text>
          </View>
        ) : null}
      </View>
      <Text className="text-eb uppercase text-faint">O que você ganha</Text>
      <View className="gap-3">
        {highlights.map((h) => (
          <View key={h.title} className="flex-row items-center gap-3">
            <OnbChipIcon icon={h.icon} tone="brand" />
            <View className="flex-1">
              <Text className="font-bold text-foreground">{h.title}</Text>
              <Text className="text-xs text-faint">{h.subtitle}</Text>
            </View>
            {h.badge ? (
              <View className="rounded-full bg-brand/15 px-2 py-0.5">
                <Text className="text-[11px] font-bold text-brand">{h.badge}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      <Spacer />
      <PrimaryButton brand onPress={onContinue}>
        Continuar
      </PrimaryButton>
    </View>
  );
}

// --- Onb-03 ---------------------------------------------------------------------

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
  const toast = useToast();
  // Nada vem marcado além do obrigatório (ADR 026).
  const [chosen, setChosen] = useState<ShareScope[]>([]);
  const [aggregate, setAggregate] = useState(false);
  const locked = SHARE_SCOPE_ROWS.filter((r) => required.includes(r.scope));
  const optional = SHARE_SCOPE_ROWS.filter((r) => !required.includes(r.scope));
  const flip = (s: ShareScope) =>
    setChosen((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));

  return (
    <View className="flex-1 gap-3.5">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <View className="gap-1.5">
        <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
          {SHARE_STEP_COPY.title}
        </Text>
        {team.length > 0 ? (
          <View className="flex-row items-center gap-2">
            <TeamStack team={team} max={2} />
            <Text className="flex-1 text-b2 text-muted-foreground">{teamLine(team)}</Text>
          </View>
        ) : null}
      </View>
      {locked.length > 0 ? (
        <>
          <Text className="text-eb uppercase text-faint">{SHARE_STEP_COPY.required}</Text>
          <View className="overflow-hidden rounded-card bg-card">
            {locked.map((r) => (
              <Pressable
                key={r.scope}
                accessibilityRole="switch"
                accessibilityState={{ checked: true, disabled: true }}
                accessibilityLabel={`${r.label}, obrigatório`}
                onPress={() => toast.show({ message: SHARE_STEP_COPY.required })}
                className="min-h-[60px] flex-row items-center gap-3.5 px-[18px] py-3.5"
              >
                <Icon name={r.icon} color={colors.mutedForeground} />
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">{r.label}</Text>
                  <Text className="text-[13px] text-muted-foreground">{r.subtitle}</Text>
                </View>
                <Icon name="lock" size={16} color={colors.faintForeground} />
                <Toggle on dim />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      <Text className="text-eb uppercase text-faint">{SHARE_STEP_COPY.optional}</Text>
      <View className="overflow-hidden rounded-card bg-card">
        {optional.map((r, i) => {
          const on = chosen.includes(r.scope);
          return (
            <Pressable
              key={r.scope}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={r.label}
              onPress={() => flip(r.scope)}
              className={cn(
                'min-h-[60px] flex-row items-center gap-3.5 px-[18px] py-3.5',
                i > 0 && 'border-t border-border',
              )}
            >
              <Icon name={r.icon} color={colors.mutedForeground} />
              <View className="flex-1">
                <Text className="font-semibold text-foreground">{r.label}</Text>
                <Text className="text-[13px] text-muted-foreground">{r.subtitle}</Text>
              </View>
              <Toggle on={on} />
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: aggregate }}
        onPress={() => setAggregate((a) => !a)}
        className="flex-row items-center gap-3 rounded-card bg-card px-[18px] py-4"
      >
        <Check on={aggregate} />
        <View className="flex-1">
          <Text className="text-sm font-bold text-foreground">{SHARE_STEP_COPY.aggregate}</Text>
          <Text className="text-xs text-faint">{SHARE_STEP_COPY.aggregateNote}</Text>
        </View>
      </Pressable>
      <ErrorLine error={error} />
      <Spacer />
      <PrimaryButton
        pending={pending}
        onPress={() =>
          onAccept({ scopes: [...new Set([...required, ...chosen])], statsOptIn: aggregate })
        }
      >
        {SHARE_STEP_COPY.accept}
      </PrimaryButton>
      <GhostButton onPress={onDecline} disabled={pending}>
        {declineLabel}
      </GhostButton>
    </View>
  );
}

// --- Onb-04 ---------------------------------------------------------------------

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
    <View className="flex-1 gap-3.5">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <Text accessibilityRole="header" className="mt-4 font-display text-h1 text-foreground">
        Qual é o seu objetivo?
      </Text>
      <View accessibilityRole="radiogroup" className="gap-3">
        {ONBOARDING_OBJECTIVES.map((o) => {
          const on = value === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              className={choiceCardClass(on)}
            >
              <OnbChipIcon icon={o.icon} size={52} />
              <View className="flex-1">
                <Text className="text-h3 text-foreground">{o.label}</Text>
                <Text className="text-b2 text-muted-foreground">{o.description}</Text>
              </View>
              <Check on={on} round />
            </Pressable>
          );
        })}
      </View>
      <Spacer />
      <PrimaryButton disabled={value === null} onPress={onContinue}>
        Continuar
      </PrimaryButton>
    </View>
  );
}

// --- Onb-05 ---------------------------------------------------------------------

export interface BodyDraft {
  sex: BiologicalSex | null;
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
    <View className="flex-1 gap-3">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <View className="mt-2 gap-1">
        <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
          Sobre você
        </Text>
        <Text className="text-b2 text-muted-foreground">{BODY_REASONS.intro}</Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-[13px] font-semibold text-muted-foreground">Sexo biológico</Text>
        <Text className="text-xs text-faint">{BODY_REASONS.sex}</Text>
      </View>
      <View accessibilityRole="radiogroup" className="flex-row gap-1 rounded-field bg-card p-1">
        {ONBOARDING_SEX.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: value.sex === o.value }}
            onPress={() => set({ sex: o.value })}
            className={cn(
              'h-[38px] flex-1 items-center justify-center rounded-chip',
              value.sex === o.value && 'bg-surface-3',
            )}
          >
            <Text
              className={cn(
                'text-sm font-semibold',
                value.sex === o.value ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row justify-between">
        <Text className="text-[13px] font-semibold text-muted-foreground">Nascimento</Text>
        <Text className="text-xs text-faint">{BODY_REASONS.birthDate}</Text>
      </View>
      <TextInput
        accessibilityLabel="Nascimento"
        keyboardType="number-pad"
        placeholder="dd/mm/aaaa"
        placeholderTextColor={colors.placeholder}
        value={value.birthDate}
        onChangeText={(t) => set({ birthDate: maskBrDate(t) })}
        className="h-[52px] rounded-field bg-card px-[18px] text-base font-bold text-foreground"
      />
      <View className="flex-row gap-3">
        <BodyStepper
          label="Altura"
          unit="cm"
          display={String(value.heightCm)}
          limits={H}
          onType={(n) => set({ heightCm: n })}
          onMinus={() => set({ heightCm: stepValue(value.heightCm, -H.step, H) })}
          onPlus={() => set({ heightCm: stepValue(value.heightCm, H.step, H) })}
        />
        <BodyStepper
          label="Peso"
          unit="kg"
          display={decimalLabel(value.weightKg)}
          limits={W}
          onType={(n) => set({ weightKg: n })}
          onMinus={() => set({ weightKg: stepValue(value.weightKg, -W.step, W) })}
          onPlus={() => set({ weightKg: stepValue(value.weightKg, W.step, W) })}
        />
      </View>
      <View className="flex-row items-center gap-2">
        <Icon name="info" size={16} color={colors.faintForeground} />
        <Text className="text-xs text-faint">{BODY_REASONS.size}</Text>
      </View>
      <ErrorLine error={error} />
      <Spacer />
      <View className="flex-row items-center gap-2.5 rounded-card bg-surface-3/60 px-[18px] py-4">
        <Icon name="shield" color={colors.mutedForeground} />
        <Text className="flex-1 text-xs text-faint">{BODY_REASONS.privacy}</Text>
      </View>
      <PrimaryButton
        disabled={value.sex === null || value.birthDate.length < 10}
        onPress={onContinue}
      >
        Continuar
      </PrimaryButton>
    </View>
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
  onType,
  onMinus,
  onPlus,
}: {
  label: string;
  unit: string;
  display: string;
  limits: { min: number; max: number; step: number };
  onType: (n: number) => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const commit = () => {
    const n = parseTypedBody(editing ?? '', limits);
    if (n !== null) onType(n);
    setEditing(null);
    setFocused(false);
  };
  return (
    <View className="flex-1 gap-2">
      <Text className="text-[13px] font-semibold text-muted-foreground">{label}</Text>
      <View className="items-center gap-2.5 rounded-card bg-card px-2.5 py-3.5">
        <View
          className={cn(
            'flex-row items-baseline gap-1 rounded-[12px] border-[1.5px] bg-background px-2 py-1',
            focused ? 'border-primary' : 'border-transparent',
          )}
        >
          <TextInput
            accessibilityLabel={`${label} em ${unit}`}
            keyboardType={limits.step >= 1 ? 'number-pad' : 'decimal-pad'}
            returnKeyType="done"
            selectTextOnFocus
            value={editing ?? display}
            onFocus={() => {
              setEditing(display);
              setFocused(true);
            }}
            onChangeText={setEditing}
            onSubmitEditing={commit}
            onBlur={commit}
            maxLength={5}
            className="min-w-[64px] text-center font-display text-d3 text-foreground"
          />
          <Text className="text-sm font-semibold text-muted-foreground">{unit}</Text>
        </View>
        <View className="flex-row gap-2">
          <StepperButton kind="minus" label={`Menos ${label.toLowerCase()}`} onPress={onMinus} />
          <StepperButton kind="plus" label={`Mais ${label.toLowerCase()}`} onPress={onPlus} />
        </View>
      </View>
    </View>
  );
}

// --- Onb-06 ---------------------------------------------------------------------

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
  resumed?: ReactNode;
}) {
  return (
    <View className="flex-1 gap-3">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <Text accessibilityRole="header" className="mt-2 font-display text-h1 text-foreground">
        Como é seu dia a dia?
      </Text>
      <Text className="text-b2 text-muted-foreground">
        Conta treino e trabalho. Entra no cálculo do gasto.
      </Text>
      <View accessibilityRole="radiogroup" className="gap-2">
        {ONBOARDING_ACTIVITIES.map((o) => {
          const on = value === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              className={choiceCardClass(on, true)}
            >
              <View className="h-6 w-9 flex-row items-end gap-[3px]">
                {[28, 46, 64, 82, 100].map((h, bar) => (
                  <View
                    key={h}
                    style={{ height: `${h}%` }}
                    className={cn(
                      'flex-1 rounded-[2px]',
                      bar < o.level ? 'bg-primary' : 'bg-surface-3',
                    )}
                  />
                ))}
              </View>
              <View className="flex-1">
                <Text className="font-bold text-foreground">{o.label}</Text>
                <Text className="text-xs text-faint">{o.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {resumed}
      <ErrorLine error={error} />
      <Spacer />
      <PrimaryButton disabled={value === null} pending={pending} onPress={onContinue}>
        {pending ? 'Calculando…' : 'Calcular minhas metas'}
      </PrimaryButton>
    </View>
  );
}

// --- Onb-07 e 07b -----------------------------------------------------------------

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
  const macros = [
    ['Proteína', 'bg-protein', shown.proteinMinG, shown.proteinMaxG],
    ['Carboidrato', 'bg-carbs', shown.carbsMinG, shown.carbsMaxG],
    ['Gordura', 'bg-fat', shown.fatMinG, shown.fatMaxG],
  ] as const;
  return (
    <View className="flex-1 gap-3">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <View className="mt-1.5 gap-1">
        <Text className="text-b2 text-muted-foreground">Calorias por dia</Text>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-baseline gap-2" accessibilityLiveRegion="polite">
            <Text className="font-display text-d2 text-foreground">{kcalLabel(goals.kcalMin)}</Text>
            <Text className="text-h3 text-faint">–</Text>
            <Text className="font-display text-d2 text-foreground">{kcalLabel(goals.kcalMax)}</Text>
          </View>
          <View className="flex-row gap-1.5">
            <StepperButton
              kind="minus"
              label="Diminuir calorias"
              onPress={() => onShift(-KCAL_STEP)}
              disabled={goals.kcalMin <= KCAL_BAR.min}
            />
            <StepperButton
              kind="plus"
              label="Aumentar calorias"
              onPress={() => onShift(KCAL_STEP)}
              disabled={goals.kcalMax >= KCAL_BAR.max}
            />
          </View>
        </View>
        <Text className="text-xs text-faint">
          kcal{tdee ? ` · gasto estimado ${kcalLabel(tdee)}` : ''}
        </Text>
      </View>
      <View className="mb-[18px] mt-1 h-3.5 rounded-[7px] bg-card">
        <View
          className="absolute bottom-0 top-0 rounded-[7px] bg-primary"
          style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
        />
        <Text className="absolute left-0 top-[18px] text-xs text-faint">
          {kcalLabel(KCAL_BAR.min)}
        </Text>
        <Text className="absolute right-0 top-[18px] text-xs text-faint">
          {kcalLabel(KCAL_BAR.max)}
        </Text>
      </View>
      {team && summary ? (
        <View className="gap-2">
          <Text className="text-xs text-faint">Qual meta usar?</Text>
          <View accessibilityRole="radiogroup" className="flex-row gap-2">
            <SourceCard
              selected={source === 'app'}
              onPress={() => onSource('app')}
              kicker="Calculado pelo app"
              value={`${kcalLabel(goals.kcalMin)}–${kcalLabel(goals.kcalMax)}`}
              note="pelo seu objetivo"
            />
            <SourceCard
              selected={source === 'team'}
              onPress={() => onSource('team')}
              kicker={`Sugerido por ${author}`}
              value={summary.kcal}
              note={summary.macros}
            />
          </View>
        </View>
      ) : null}
      <View className="overflow-hidden rounded-card bg-card">
        {macros.map(([label, dot, min, max], i) => (
          <View
            key={label}
            className={cn(
              'min-h-[52px] flex-row items-center gap-3.5 px-[18px]',
              i > 0 && 'border-t border-border',
            )}
          >
            <View className={cn('h-2 w-2 rounded-full', dot)} />
            <Text className="flex-1 font-semibold text-foreground">{label}</Text>
            <Text className="font-bold text-foreground">{rangeLabel(min, max, 'g')}</Text>
          </View>
        ))}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold text-foreground">Treinos por semana</Text>
        <View accessibilityRole="radiogroup" className="flex-row gap-1.5">
          {WEEKLY_WORKOUT_CHIPS.map((n) => {
            const current = goals.weeklyWorkouts ?? 3;
            const on = current === n || (n === 5 && current > 5);
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${n === 5 ? '5 ou mais' : n} treinos por semana`}
                onPress={() => onWorkouts(n)}
                className={cn(
                  'h-9 w-11 items-center justify-center rounded-[10px]',
                  on ? 'bg-primary' : 'bg-card',
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-semibold',
                    on ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {n === 5 ? '5+' : String(n)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-2 rounded-card bg-card px-[18px] py-4">
          <Icon name="drop" color={colors.water} />
          <Text className="font-bold text-foreground">{waterLabel(goals.dailyWaterTargetMl)}</Text>
        </View>
        <View className="flex-1 gap-2 rounded-card bg-card px-[18px] py-4">
          <Icon name="steps" color={colors.steps} />
          <Text className="font-bold text-foreground">{stepsLabel(goals.dailyStepsTarget)}</Text>
        </View>
      </View>
      <ErrorLine error={error} />
      <Spacer />
      <PrimaryButton pending={pending} onPress={onContinue}>
        {pending
          ? 'Salvando…'
          : source === 'team' && team
            ? `Usar a meta de ${author}`
            : 'Usar estas metas'}
      </PrimaryButton>
    </View>
  );
}

function SourceCard({
  selected,
  onPress,
  kicker,
  value,
  note,
}: {
  selected: boolean;
  onPress: () => void;
  kicker: string;
  value: string;
  note: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={cn(
        'flex-1 gap-1 rounded-card bg-card px-3.5 py-3',
        selected && 'border-2 border-primary',
      )}
    >
      <Text className="text-xs text-muted-foreground">{kicker}</Text>
      <Text className="text-[17px] font-bold text-foreground">{value}</Text>
      <Text className="text-xs text-faint">{note}</Text>
    </Pressable>
  );
}

// --- Onb-08 ---------------------------------------------------------------------

export function RemindersStep({
  nav,
  weeklyWorkouts,
  pending,
  error,
  onContinue,
}: {
  nav: StepNav;
  weeklyWorkouts: number;
  pending: boolean;
  error: string | null;
  onContinue: (selected: OnboardingReminderKey[]) => void;
}) {
  const options = onboardingReminderOptions(weeklyWorkouts);
  const [selected, setSelected] = useState<OnboardingReminderKey[]>(
    options.filter((o) => o.initial).map((o) => o.key),
  );
  const flip = (k: OnboardingReminderKey) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  return (
    <View className="flex-1 gap-3.5">
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <View className="mt-2 gap-3">
        <OnbChipIcon icon="clock" size={64} />
        <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
          Um empurrãozinho na hora certa?
        </Text>
      </View>
      <View className="gap-2">
        {options.map((o) => {
          const on = selected.includes(o.key);
          return (
            <Pressable
              key={o.key}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.title}
              onPress={() => flip(o.key)}
              className={cn(
                'flex-row items-center gap-3 rounded-card bg-card p-5',
                on && 'border-2 border-primary',
              )}
            >
              <OnbChipIcon icon={o.icon} tone={o.tone} />
              <View className="flex-1">
                <Text className="font-bold text-foreground">{o.title}</Text>
                <Text className="text-xs text-faint">{o.subtitle}</Text>
              </View>
              <Toggle on={on} />
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-faint">Ajuste horários e dias depois, em Lembretes.</Text>
      <ErrorLine error={error} />
      <Spacer />
      <PrimaryButton pending={pending} onPress={() => onContinue(selected)}>
        {remindersCta(selected.length)}
      </PrimaryButton>
    </View>
  );
}

// --- Onb-09 ---------------------------------------------------------------------

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
  const layers = [
    'top-0 scale-[.92] bg-card opacity-55',
    'top-14 scale-[.96] bg-surface-3/70',
    'top-[118px] bg-surface-3',
  ];
  return (
    <View className="flex-1 gap-3.5">
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="mt-5 h-[200px]"
      >
        {preview.map((p, i) => (
          <View
            key={p.body}
            className={cn(
              'absolute left-0 right-0 flex-row items-start gap-3 rounded-[18px] px-4 py-3',
              layers[i],
            )}
          >
            <View
              className={cn(
                'h-7 w-7 items-center justify-center rounded-[8px]',
                p.brand ? 'bg-brand' : 'bg-primary',
              )}
            >
              {p.brand ? (
                <Text className="text-[11px] font-bold text-brand-foreground">
                  {initialsOf(communityName ?? 'Fatia')}
                </Text>
              ) : (
                <Icon name="spark" size={16} color={colors.primaryForeground} />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-foreground">{p.title}</Text>
              <Text className="text-b2 text-foreground">{p.body}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
        {NOTIFICATIONS_STEP_COPY.title}
      </Text>
      <Text className="text-b2 text-muted-foreground">{NOTIFICATIONS_STEP_COPY.body}</Text>
      <Spacer />
      <PrimaryButton pending={pending} onPress={onEnable}>
        Ativar notificações
      </PrimaryButton>
      <GhostButton onPress={onLater}>Agora não</GhostButton>
    </View>
  );
}

// --- Onb-P1 ---------------------------------------------------------------------

export function HealthStep({
  nav,
  sourceName,
  pending,
  onConnect,
  onLater,
}: {
  nav: StepNav;
  /** "Apple Saúde" ou "Health Connect". */
  sourceName: string;
  pending: boolean;
  onConnect: () => void;
  onLater: () => void;
}) {
  return (
    <View className="flex-1 gap-3.5">
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <View className="mt-3 gap-3">
        <OnbChipIcon icon="heart" tone="pink" size={64} />
        <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
          {HEALTH_STEP_COPY.title}
        </Text>
        <Text className="text-b2 text-muted-foreground">{HEALTH_STEP_COPY.body}</Text>
      </View>
      <View className="flex-row items-center gap-3 rounded-card bg-card p-5">
        <OnbChipIcon icon="steps" tone="amber" />
        <View className="flex-1">
          <Text className="font-bold text-foreground">{sourceName}</Text>
          <Text className="text-xs text-faint">Passos do dia</Text>
        </View>
      </View>
      <Spacer />
      <PrimaryButton pending={pending} onPress={onConnect}>
        {`Conectar ${sourceName}`}
      </PrimaryButton>
      <GhostButton onPress={onLater}>Agora não</GhostButton>
    </View>
  );
}

// --- Onb-Codigo -------------------------------------------------------------------

export function CodeStep({
  nav,
  lookup,
  onCode,
  onScan,
  onJoin,
  onNoCode,
}: {
  nav: StepNav;
  lookup: CodeLookup;
  onCode: (code: string) => void;
  onScan: () => void;
  onJoin: () => void;
  onNoCode: () => void;
}) {
  const ok = lookup.status === 'found';
  return (
    <View className="flex-1 gap-3.5">
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <View className="mt-3 gap-3">
        <OnbChipIcon icon="users" tone="brand" size={64} />
        <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
          {CODE_STEP_COPY.title}
        </Text>
        <Text className="text-b2 text-muted-foreground">{CODE_STEP_COPY.body}</Text>
      </View>
      <TextInput
        accessibilityLabel="Código da comunidade"
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="EX.: DEMO30"
        placeholderTextColor={colors.placeholder}
        value={lookup.code}
        onChangeText={onCode}
        className="h-16 rounded-field bg-card px-4 text-center font-display text-[28px] tracking-[6px] text-foreground"
      />
      <Text accessibilityLiveRegion="polite" className="text-xs text-faint">
        {communityCodeHint(lookup)}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onScan}
        className="h-11 flex-row items-center gap-2 self-start rounded-[12px] bg-card px-[18px]"
      >
        <Icon name="qr" size={16} />
        <Text className="text-sm font-bold text-foreground">Ler QR da recepção</Text>
      </Pressable>
      <Spacer />
      {ok ? <Text className="text-xs text-faint">{CODE_STEP_COPY.ready}</Text> : null}
      <PrimaryButton disabled={!ok} onPress={onJoin}>
        Entrar na comunidade
      </PrimaryButton>
      <GhostButton onPress={onNoCode}>Não tenho código</GhostButton>
    </View>
  );
}

// --- Onb-10a ----------------------------------------------------------------------

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
  saving,
  onTest,
  onSave,
  onLater,
  onOtherCode,
}: {
  nav: StepNav;
  groupName: string;
  phase: 'idle' | 'scanning' | 'done';
  result: PhotoResult | null;
  error: string | null;
  saving: boolean;
  onTest: () => void;
  onSave: () => void;
  onLater: () => void;
  onOtherCode: () => void;
}) {
  const positions = ['left-[18px] top-[30px]', 'right-5 top-[70px]', 'bottom-7 left-[60px]'];
  return (
    <View className="flex-1 gap-3.5">
      <StepHeader segment={nav.segment} onBack={nav.onBack} onSkip={nav.onSkip} />
      <View className="mt-1 self-start rounded-full bg-brand/15 px-2.5 py-1">
        <Text className="text-[11px] font-bold text-brand">PRO · {groupName}</Text>
      </View>
      <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
        Você tem a IA pela {groupName}
      </Text>
      <View className="overflow-hidden rounded-card bg-card">
        <View className="h-[200px] items-center justify-center bg-surface-3">
          {phase === 'idle' ? <Text className="text-sm text-faint">foto do prato</Text> : null}
          {phase === 'scanning' ? (
            <Text className="text-sm text-faint">Analisando o prato…</Text>
          ) : null}
          {phase === 'done'
            ? result?.items.slice(0, 3).map((it, i) => (
                <View
                  key={it.name}
                  className={cn(
                    'absolute h-[30px] justify-center rounded-[10px] bg-black/75 px-3',
                    positions[i],
                  )}
                >
                  <Text className="text-xs font-semibold text-white">
                    {it.name} · {Math.round(it.grams)} g
                  </Text>
                </View>
              ))
            : null}
        </View>
        <View className="flex-row items-center justify-between px-5 py-4">
          {phase === 'done' && result ? (
            <>
              <Text className="font-bold text-foreground">{kcalLabel(result.kcal)} kcal</Text>
              <Text className="text-xs text-faint">{result.macros}</Text>
            </>
          ) : (
            <>
              <Text className="text-b2 text-muted-foreground">Toque em testar para ver</Text>
              <Icon name="camera" color={colors.mutedForeground} />
            </>
          )}
        </View>
      </View>
      <Text className="text-b2 text-muted-foreground">{AI_COMMUNITY_COPY.review}</Text>
      <Text className="text-xs text-faint">{AI_COMMUNITY_COPY.provider(null)}</Text>
      <ErrorLine error={error} />
      <Spacer />
      {phase === 'done' ? (
        <PrimaryButton pending={saving} onPress={onSave}>
          Revisar e salvar
        </PrimaryButton>
      ) : (
        <PrimaryButton pending={phase === 'scanning'} onPress={onTest}>
          {phase === 'scanning' ? 'Analisando…' : 'Concordo e testar com meu almoço'}
        </PrimaryButton>
      )}
      <GhostButton onPress={onLater}>Depois</GhostButton>
      <Text className="text-center text-xs text-faint">
        {AI_COMMUNITY_COPY.onlySeat}{' '}
        <Text className="text-xs font-bold text-primary" onPress={onOtherCode}>
          Tenho outro código
        </Text>
      </Text>
    </View>
  );
}

// --- Onb-10b ----------------------------------------------------------------------

export function AiTrialStep({
  nav,
  terms,
  pending,
  error,
  onStart,
  onLater,
  onLegal,
}: {
  nav: StepNav;
  terms: string | null;
  pending: boolean;
  error: string | null;
  onStart: () => void;
  onLater: () => void;
  onLegal: (path: '/terms' | '/privacy') => void;
}) {
  return (
    <View className="flex-1 gap-3.5">
      <StepHeader segment={nav.segment} onBack={nav.onBack} />
      <View className="mt-5 flex-row justify-center">
        <View style={{ transform: [{ rotate: '-8deg' }] }}>
          <OnbChipIcon icon="chat" size={72} />
        </View>
        <View className="z-[1] -ml-3 h-[72px] w-[72px] items-center justify-center rounded-[24px] bg-primary">
          <Icon name="camera" size={32} color={colors.primaryForeground} />
        </View>
        <View className="-ml-3" style={{ transform: [{ rotate: '8deg' }] }}>
          <OnbChipIcon icon="mic" size={72} />
        </View>
      </View>
      <View className="items-center gap-2">
        <Text accessibilityRole="header" className="font-display text-h1 text-foreground">
          7 dias de IA, grátis
        </Text>
        <Text className="text-center text-b2 text-muted-foreground">
          Fotografe ou fale o que comeu e a IA monta a refeição.
        </Text>
      </View>
      <View className="overflow-hidden rounded-card bg-card">
        {TRIAL_BENEFITS.map((b, i) => (
          <View
            key={b.label}
            className={cn(
              'min-h-[52px] flex-row items-center gap-3.5 px-[18px]',
              i > 0 && 'border-t border-border',
            )}
          >
            <Icon name={b.icon} color={colors.primary} />
            <Text className="flex-1 font-semibold text-foreground">{b.label}</Text>
          </View>
        ))}
      </View>
      <ErrorLine error={error} />
      <Spacer />
      {terms ? (
        <Text className="text-center text-xs text-faint">
          {terms}{' '}
          <Text className="text-xs text-faint underline" onPress={() => onLegal('/terms')}>
            Termos de uso
          </Text>{' '}
          ·{' '}
          <Text className="text-xs text-faint underline" onPress={() => onLegal('/privacy')}>
            Privacidade
          </Text>
        </Text>
      ) : (
        <Text className="text-center text-xs text-faint">Carregando o preço da loja…</Text>
      )}
      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          onPress={onLater}
          className="h-14 flex-1 items-center justify-center rounded-[16px] bg-card"
        >
          <Text className="text-[15px] font-bold text-foreground">Agora não</Text>
        </Pressable>
        <View className="flex-1">
          <PrimaryButton pending={pending} disabled={!terms} onPress={onStart}>
            Começar teste
          </PrimaryButton>
        </View>
      </View>
    </View>
  );
}

// --- Onb-Retomada -------------------------------------------------------------------

export function ResumeNote({ title, body }: { title: string; body: string }) {
  return (
    <View className="gap-1.5 rounded-card bg-surface-3/60 px-[18px] py-4">
      <Text className="text-eb uppercase text-faint">{title}</Text>
      <Text className="text-b2 text-muted-foreground">{body}</Text>
    </View>
  );
}
