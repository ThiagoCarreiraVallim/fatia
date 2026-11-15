import { apiFetch } from './http';
import type { BillingInterval, MyPlan } from './billing';
import type { MealRecognition } from './nutrition';
import type { ReminderInput } from './reminders';
import type { ShareScope } from './sharing';
import type { ActivityLevel, BiologicalSex, BodyObjective, GoalsInput } from './users';

/**
 * O onboarding do aluno das pranchas Onb-* (#371), comum à web e ao app: quais
 * etapas cada pessoa vê, em que ordem, onde retomar, e os textos e contas das
 * telas. As telas só desenham.
 *
 * A conta (etapa 1) acontece antes, no login; daqui para a frente tudo é salvo
 * a cada passo (`PATCH /users/me/onboarding`) e volta ao reabrir.
 */

/** As etapas, na ordem das pranchas. Mesma lista de `ONBOARDING_STEPS` da API. */
export const ONBOARDING_FLOW_ORDER = [
  'welcome',
  'share',
  'objective',
  'body',
  'activity',
  'goals',
  'reminders',
  'notifications',
  'health',
  'code',
  'ai',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_FLOW_ORDER)[number];

/** A variante da etapa 10: demonstração pela comunidade ou teste grátis. */
export type AiStepVariant = 'community' | 'trial';

export interface FlowContext {
  /** Chegou por um convite ainda não respondido: boas-vindas e compartilhar. */
  invitePending: boolean;
  /** Já está numa comunidade: a etapa "Tem código?" não aparece. */
  inCommunity: boolean;
  /** Dá para ler passos de um app de saúde neste aparelho (Onb-P1). */
  healthAvailable: boolean;
  /** `null` = a etapa da IA some (compra desligada, ou já é PRO). */
  aiVariant: AiStepVariant | null;
}

/** As etapas que esta pessoa vê. Obrigatórias de 1 a 7; da 8 em diante, puláveis. */
export function onboardingSteps(ctx: FlowContext): OnboardingStepKey[] {
  return ONBOARDING_FLOW_ORDER.filter((step) => {
    if (step === 'welcome' || step === 'share') return ctx.invitePending;
    if (step === 'health') return ctx.healthAvailable;
    if (step === 'code') return !ctx.inCommunity;
    if (step === 'ai') return ctx.aiVariant !== null;
    return true;
  });
}

const orderOf = (step: OnboardingStepKey) => ONBOARDING_FLOW_ORDER.indexOf(step);

/**
 * A próxima etapa pela ordem. Funciona também a partir de uma etapa que saiu do
 * fluxo no meio do caminho (entrou pelo código: "code" deixa de existir).
 * `null` = acabou: vai para o Hoje.
 */
export function nextOnboardingStep(
  ctx: FlowContext,
  current: OnboardingStepKey,
): OnboardingStepKey | null {
  return onboardingSteps(ctx).find((s) => orderOf(s) > orderOf(current)) ?? null;
}

/** A anterior, para o botão de voltar; `null` na primeira (sem botão). */
export function previousOnboardingStep(
  ctx: FlowContext,
  current: OnboardingStepKey,
): OnboardingStepKey | null {
  const before = onboardingSteps(ctx).filter((s) => orderOf(s) < orderOf(current));
  return before[before.length - 1] ?? null;
}

/**
 * Onde retomar (prancha Onb-Retomada). Sem etapa salva, a primeira do fluxo; a
 * salva que saiu do fluxo (convite já respondido) cede à seguinte; `null` =
 * não sobrou nada, é só terminar.
 */
export function resumeOnboardingStep(
  ctx: FlowContext,
  saved: OnboardingStepKey | null,
): OnboardingStepKey | null {
  const steps = onboardingSteps(ctx);
  if (!saved) return steps[0] ?? null;
  if (steps.includes(saved)) return saved;
  return nextOnboardingStep(ctx, saved);
}

/** A barra de progresso tem 9 traços (etapas 2 a 10), como nas pranchas. */
export const PROGRESS_SEGMENTS = 9;

/** O traço da etapa (começando em 0): saúde, código e IA dividem o último. */
export function progressSegment(step: OnboardingStepKey): number {
  return Math.min(orderOf(step), PROGRESS_SEGMENTS - 1);
}

/** Da etapa 8 em diante tem "Pular" no topo. */
export function isSkippableStep(step: OnboardingStepKey): boolean {
  return orderOf(step) >= orderOf('reminders');
}

/**
 * A variante da etapa 10 (Onb-Fluxos): PRO pela comunidade → demonstração com a
 * foto do prato; Free com compra possível → teste de 7 dias; sem compra (iOS sem
 * compra no app) ou já PRO por conta própria → a etapa some.
 */
export function aiStepVariant(plan: MyPlan | null, canPurchase: boolean): AiStepVariant | null {
  if (!plan || !plan.requiresPlan) return null;
  if (plan.tier === 'PRO') return plan.source === 'GROUP' ? 'community' : null;
  return canPurchase ? 'trial' : null;
}

// --- textos das telas ---------------------------------------------------------

export interface FlowOption<T> {
  value: T;
  label: string;
  description: string;
}

/** Onb-04: cada objetivo com uma linha. */
export const ONBOARDING_OBJECTIVES: (FlowOption<BodyObjective> & {
  icon: 'trend' | 'scale' | 'dumbbell';
})[] = [
  {
    value: 'LOSE',
    label: 'Perder gordura',
    description: 'Um pouco abaixo do gasto',
    icon: 'trend',
  },
  {
    value: 'MAINTAIN',
    label: 'Manter o peso',
    description: 'Perto do que o corpo gasta',
    icon: 'scale',
  },
  {
    value: 'GAIN',
    label: 'Ganhar massa',
    description: 'Acima do gasto, mais proteína',
    icon: 'dumbbell',
  },
];

/** Onb-06: 5 níveis, com quantos traços da régua acendem. */
export const ONBOARDING_ACTIVITIES: (FlowOption<ActivityLevel> & { level: number })[] = [
  { value: 'SEDENTARY', label: 'Sedentário', description: 'Sentado quase o dia todo', level: 1 },
  { value: 'LIGHT', label: 'Leve', description: 'Anda um pouco, treina 1–2×', level: 2 },
  { value: 'MODERATE', label: 'Moderado', description: 'Treina 3–5× por semana', level: 3 },
  { value: 'ACTIVE', label: 'Ativo', description: 'Treina 6–7× por semana', level: 4 },
  { value: 'VERY_ACTIVE', label: 'Muito ativo', description: 'Trabalho físico + treino', level: 5 },
];

/** Onb-05: o porquê de cada dado do corpo. */
export const BODY_REASONS = {
  intro: 'Só o que precisamos para calcular seu gasto.',
  sex: 'muda a fórmula do gasto',
  birthDate: 'o gasto cai com a idade',
  size: 'Altura e peso: base do cálculo de calorias',
  privacy: 'Fica só com você. A equipe só vê se você liberar "Corpo".',
} as const;

export const ONBOARDING_SEX: { value: BiologicalSex; label: string }[] = [
  { value: 'FEMALE', label: 'Feminino' },
  { value: 'MALE', label: 'Masculino' },
];

/** Os steppers de altura e peso (Onb-05): os mesmos limites da sugestão de metas. */
export const BODY_STEPPERS = {
  height: { min: 120, max: 220, step: 1, initial: 168 },
  weight: { min: 35, max: 250, step: 0.1, initial: 70 },
} as const;

/** Um toque no stepper, sem sair dos limites e sem ruído de ponto flutuante. */
export function stepValue(
  value: number,
  delta: number,
  limits: { min: number; max: number },
): number {
  const next = Math.round((value + delta) * 10) / 10;
  return Math.min(limits.max, Math.max(limits.min, next));
}

/** 70.2 → "70,2". */
export const decimalLabel = (n: number) => n.toFixed(1).replace('.', ',');

// --- metas em faixa (Onb-07 e Onb-07b) ---------------------------------------

/** A régua de calorias da prancha. */
export const KCAL_BAR = { min: 1200, max: 2600 } as const;
/** Cada toque em mais/menos. */
export const KCAL_STEP = 50;
/** Treinos por semana: 2, 3, 4 e "5+". */
export const WEEKLY_WORKOUT_CHIPS = [2, 3, 4, 5] as const;

/**
 * Mexe a faixa de calorias e leva o carboidrato junto (4 kcal por grama):
 * proteína e gordura ficam, são as que o objetivo fixa. Não sai da régua.
 */
export function goalsRangeShift(goals: GoalsInput, deltaKcal: number): GoalsInput {
  const delta = Math.max(
    KCAL_BAR.min - goals.kcalMin,
    Math.min(KCAL_BAR.max - goals.kcalMax, deltaKcal),
  );
  const carbs = Math.round(delta / 4);
  return {
    ...goals,
    kcalMin: goals.kcalMin + delta,
    kcalMax: goals.kcalMax + delta,
    carbsMinG: Math.max(0, goals.carbsMinG + carbs),
    carbsMaxG: Math.max(0, goals.carbsMaxG + carbs),
  };
}

const pct = (n: number) => Math.round(n * 1000) / 10;

/** Onde a faixa fica na régua, em porcentagem (uma casa). */
export function kcalBarPosition(goals: Pick<GoalsInput, 'kcalMin' | 'kcalMax'>): {
  leftPct: number;
  widthPct: number;
} {
  const span = KCAL_BAR.max - KCAL_BAR.min;
  const lo = Math.min(KCAL_BAR.max, Math.max(KCAL_BAR.min, goals.kcalMin));
  const hi = Math.min(KCAL_BAR.max, Math.max(lo, goals.kcalMax));
  return { leftPct: pct((lo - KCAL_BAR.min) / span), widthPct: pct((hi - lo) / span) };
}

const thousands = (n: number) => n.toLocaleString('pt-BR');

/** "126–154 g". */
export const rangeLabel = (min: number, max: number, unit: string) =>
  `${thousands(min)}–${thousands(max)} ${unit}`;

export const kcalLabel = (n: number) => thousands(n);

/** 2500 → "2,5 L de água". */
export function waterLabel(ml: number): string {
  const liters = Math.round(ml / 100) / 10;
  return `${String(liters).replace('.', ',')} L de água`;
}

/** 9000 → "9 mil passos". */
export function stepsLabel(steps: number): string {
  if (steps < 1000) return `${steps} passos`;
  const mil = Math.round(steps / 100) / 10;
  return `${String(mil).replace('.', ',')} mil passos`;
}

const mid = (a: number, b: number) => Math.round((a + b) / 2);

/** O cartão "Sugerido pela equipe": "1.840 kcal" e "P 140 · C 220 · G 63". */
export function teamGoalsSummary(goals: TeamGoals): { kcal: string; macros: string } {
  return {
    kcal: `${thousands(mid(goals.kcalMin, goals.kcalMax))} kcal`,
    macros: `P ${mid(goals.proteinMinG, goals.proteinMaxG)} · C ${mid(
      goals.carbsMinG,
      goals.carbsMaxG,
    )} · G ${mid(goals.fatMinG, goals.fatMaxG)}`,
  };
}

/** A meta da equipe por cima da do app: água, passos e treinos continuam os do app. */
export function applyTeamGoals(app: GoalsInput, team: TeamGoals): GoalsInput {
  return { ...app, ...team };
}

export const firstNameOf = (name: string | null | undefined) =>
  name?.trim().split(/\s+/)[0] || null;

// --- lembretes (Onb-08) -------------------------------------------------------

export type OnboardingReminderKey = 'water' | 'meals' | 'workout';

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

/** Dias de treino espalhados pela semana, para a meta de treinos. */
const WORKOUT_DAYS: Record<number, number[]> = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
};

export function onboardingReminderOptions(weeklyWorkouts: number): {
  key: OnboardingReminderKey;
  title: string;
  subtitle: string;
  icon: 'drop' | 'apple' | 'dumbbell';
  tone: 'water' | 'lime' | 'neutral';
  initial: boolean;
}[] {
  return [
    {
      key: 'water',
      title: 'Água',
      subtitle: 'A cada 2 h, das 8h às 20h',
      icon: 'drop',
      tone: 'water',
      initial: true,
    },
    {
      key: 'meals',
      title: 'Refeições',
      subtitle: '8:00 · 12:30 · 19:30',
      icon: 'apple',
      tone: 'lime',
      initial: true,
    },
    {
      key: 'workout',
      title: 'Dias de treino',
      subtitle: `${weeklyWorkouts}× por semana, da sua meta · 18h`,
      icon: 'dumbbell',
      tone: 'neutral',
      initial: false,
    },
  ];
}

/** O que vira lembrete de verdade (`POST /users/me/reminders`). */
export function onboardingReminderInputs(
  selected: readonly OnboardingReminderKey[],
  weeklyWorkouts: number,
): ReminderInput[] {
  const inputs: ReminderInput[] = [];
  if (selected.includes('water')) {
    inputs.push({
      kind: 'WATER',
      mode: 'INTERVAL',
      everyHours: 2,
      from: '08:00',
      to: '20:00',
      weekdays: EVERY_DAY,
    });
  }
  if (selected.includes('meals')) {
    inputs.push({
      kind: 'MEAL',
      mode: 'TIMES',
      times: ['08:00', '12:30', '19:30'],
      weekdays: EVERY_DAY,
    });
  }
  if (selected.includes('workout')) {
    const days = WORKOUT_DAYS[Math.max(1, Math.min(weeklyWorkouts, 7))] ?? EVERY_DAY;
    inputs.push({ kind: 'WORKOUT', mode: 'TIMES', times: ['18:00'], weekdays: days });
  }
  return inputs;
}

export function remindersCta(count: number): string {
  if (count === 0) return 'Continuar sem lembretes';
  return `Ligar ${count} ${count === 1 ? 'lembrete' : 'lembretes'}`;
}

// --- compartilhar (Onb-03) ----------------------------------------------------

/** As categorias como a prancha escreve, com o ícone de cada uma. */
export const SHARE_SCOPE_ROWS: {
  scope: ShareScope;
  label: string;
  subtitle: string;
  icon: 'dumbbell' | 'apple' | 'scale' | 'drop' | 'target';
}[] = [
  { scope: 'WORKOUT', label: 'Treino', subtitle: 'Planos, sessões e volume', icon: 'dumbbell' },
  {
    scope: 'NUTRITION',
    label: 'Alimentação',
    subtitle: 'Refeições e totais do dia',
    icon: 'apple',
  },
  { scope: 'BODY', label: 'Corpo', subtitle: 'Peso e medidas', icon: 'scale' },
  { scope: 'HABITS', label: 'Hábitos', subtitle: 'Água e passos', icon: 'drop' },
  { scope: 'GOALS', label: 'Metas', subtitle: 'Metas e objetivos', icon: 'target' },
];

export const SHARE_STEP_COPY = {
  title: 'O que a equipe vê',
  required: 'Obrigatório nesta comunidade',
  optional: 'Você escolhe',
  aggregate: 'Contar nos números da comunidade',
  aggregateNote: 'Só agregado, sem seu nome',
  accept: 'Aceitar e continuar',
  decline: 'Não aceito · seguir sem a comunidade',
} as const;

const ROLE_WORD: Record<string, string> = {
  OWNER: 'dono',
  PROFESSIONAL: 'profissional',
  CREATOR: 'criador',
  MEMBER: 'membro',
};

/** "Bruno (dono) e Helena (profissional)". */
export function teamLine(team: readonly { name: string; role: string }[]): string {
  const parts = team.map((m) => `${firstNameOf(m.name) ?? m.name} (${ROLE_WORD[m.role] ?? ''})`);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** "Bruno, Helena e Marina". */
export function namesLine(names: readonly string[]): string {
  const first = names.map((n) => firstNameOf(n) ?? n);
  if (first.length <= 1) return first[0] ?? '';
  return `${first.slice(0, -1).join(', ')} e ${first[first.length - 1]}`;
}

// --- boas-vindas (Onb-02) -----------------------------------------------------

export function welcomeHighlights(input: {
  groupName: string;
  sponsored: boolean;
  activeChallenge: { title: string; participants: number } | null;
}): { icon: 'trophy' | 'dumbbell' | 'spark'; title: string; subtitle: string; badge?: string }[] {
  const items: {
    icon: 'trophy' | 'dumbbell' | 'spark';
    title: string;
    subtitle: string;
    badge?: string;
  }[] = [
    {
      icon: 'trophy',
      title: 'Desafios com a turma',
      subtitle: input.activeChallenge
        ? `${input.activeChallenge.title} · ${input.activeChallenge.participants} participando`
        : 'Quando a equipe abrir um',
    },
    { icon: 'dumbbell', title: 'Treino e dieta da equipe', subtitle: 'Direto no app' },
  ];
  if (input.sponsored) {
    items.push({
      icon: 'spark',
      title: `IA pela ${input.groupName}`,
      subtitle: 'Foto, voz e chat, quando a academia libera um assento PRO para você',
      badge: 'se liberado',
    });
  }
  return items;
}

// --- notificações (Onb-09) ----------------------------------------------------

export const NOTIFICATIONS_STEP_COPY = {
  title: 'Só os avisos que você pediu',
  body: 'Comunidade, desafios, mural, moderação e chat. Cada tipo desliga separado, chegam agrupados e sem dado de saúde na tela bloqueada.',
} as const;

/** As três prévias empilhadas: só nome da comunidade e o tipo, nada de saúde. */
export function notificationsPreview(communityName: string | null): {
  title: string;
  body: string;
  brand: boolean;
}[] {
  const community = communityName ?? 'sua comunidade';
  return [
    {
      title: communityName ? 'Semana ativa' : 'Desafios',
      body: 'Tem novidade no desafio',
      brand: true,
    },
    { title: 'Fatia', body: 'Sua resposta do chat está pronta', brand: false },
    { title: 'Fatia', body: `5 novidades em ${community}`, brand: false },
  ];
}

// --- saúde do celular (Onb-P1) ------------------------------------------------

export const HEALTH_STEP_COPY = {
  title: 'Passos sem digitar',
  body: 'Lemos os passos de um app de saúde. Nada é enviado de volta.',
} as const;

// --- código da comunidade (Onb-Codigo) ----------------------------------------

export type CodeLookup =
  | { code: string; status: 'idle' | 'searching' | 'not-found' | 'error' }
  | { code: string; status: 'found'; groupName: string };

export function communityCodeHint(state: CodeLookup): string {
  switch (state.status) {
    case 'found':
      return `${state.groupName} encontrada`;
    case 'not-found':
      return 'Nenhuma comunidade com esse código.';
    case 'searching':
      return 'Procurando…';
    case 'error':
      return 'Não deu para procurar agora. Tente de novo.';
    default:
      return 'O código que sua academia ou seu personal divulga.';
  }
}

/** O código como se digita: sem espaço, minúsculo (é o `slug` da comunidade). */
export const normalizeCommunityCode = (raw: string) => raw.trim().toLowerCase();

export const CODE_STEP_COPY = {
  title: 'Treina numa academia ou com um personal?',
  body: 'Com o código deles você entra na comunidade e recebe os treinos no app.',
  ready:
    'Seu perfil já está pronto: depois de entrar, você só escolhe o que compartilhar com a equipe.',
} as const;

// --- IA (Onb-10a e Onb-10b) ---------------------------------------------------

export const TRIAL_DAYS = 7;

const INTERVAL_LABEL: Record<BillingInterval, string> = { YEARLY: 'por ano', MONTHLY: 'por mês' };

/**
 * A letra miúda do teste (Onb-10b): o preço vem do plano real (a loja no app,
 * o banco na web), nunca fixo, e a data de cobrança é hoje + 7 dias.
 */
export function trialTerms(input: {
  price: string;
  interval: BillingInterval;
  today: Date;
  channel: 'store' | 'web';
}): string {
  const charge = new Date(input.today.getTime() + TRIAL_DAYS * 86_400_000);
  const day = String(charge.getDate()).padStart(2, '0');
  const month = String(charge.getMonth() + 1).padStart(2, '0');
  const renewal =
    input.channel === 'store'
      ? 'Renova sozinho; cancele nas assinaturas da loja até 24 h antes do fim do período.'
      : 'Renova sozinho; cancele quando quiser em Meu plano.';
  return `Grátis por ${TRIAL_DAYS} dias, depois ${input.price} ${INTERVAL_LABEL[input.interval]}, cobrado em ${day}/${month}. ${renewal}`;
}

/** R$ em centavos → "R$ 179,00". */
export const formatPriceCents = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const TRIAL_BENEFITS = [
  { icon: 'check', label: 'Nada é cobrado hoje' },
  { icon: 'bell', label: 'Avisamos 2 dias antes' },
  { icon: 'x', label: 'Cancela em 1 toque' },
] as const;

/** As etiquetas sobre a foto e a linha de kcal e macros do teste (Onb-10a). */
export function photoTestSummary(rec: MealRecognition): {
  items: { name: string; grams: number }[];
  kcal: number;
  macros: string;
} {
  const sum = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
    rec.itens.reduce((acc, it) => acc + (it[key] ?? 0), 0);
  return {
    items: rec.itens.map((it) => ({ name: it.nomeReconhecido, grams: it.grams })),
    kcal: Math.round(sum('kcal')),
    macros: `P ${Math.round(sum('proteinG'))} · C ${Math.round(sum('carbsG'))} · G ${Math.round(sum('fatG'))}`,
  };
}

/**
 * Os itens do teste → `createMeal`. O que casou com a TACO vai só com `foodId` e
 * gramas (a API calcula, como no registro manual); o resto leva os macros do
 * modelo. A confiança não é gravada.
 */
export function photoTestMealItems(
  rec: MealRecognition,
): Array<
  | { foodId: number; grams: number }
  | {
      foodName: string;
      grams: number;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    }
> {
  return rec.itens
    .filter((it) => it.grams > 0)
    .map((it) =>
      it.foodId !== null
        ? { foodId: it.foodId, grams: it.grams }
        : {
            foodName: it.nomeReconhecido,
            grams: it.grams,
            kcal: it.kcal ?? 0,
            proteinG: it.proteinG ?? 0,
            carbsG: it.carbsG ?? 0,
            fatG: it.fatG ?? 0,
          },
    );
}

export const AI_COMMUNITY_COPY = {
  review:
    'Você sempre revisa antes de salvar. A foto só fica guardada com a refeição se você permitir.',
  /**
   * O aviso do provedor antes de enviar a foto (exigência das lojas para IA de
   * terceiros). O nome vem da configuração da instância; sem ela, o genérico.
   */
  provider: (providerName: string | null) =>
    `Ao testar, a foto vai para ${providerName ?? 'o provedor do modelo de IA'} para reconhecer os alimentos. Ele não usa a foto para treinar modelos.`,
  onlySeat: 'Esta tela aparece só para quem recebeu um assento PRO da academia.',
} as const;

// --- API ----------------------------------------------------------------------

export type GoalSource = 'app' | 'team';

export interface TeamGoals {
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
}

/** `GET /users/me/onboarding`: onde parou, já preenchido. */
export interface OnboardingProgress {
  step: OnboardingStepKey | null;
  onboardedAt: string | null;
  profile: {
    objective: BodyObjective | null;
    sex: BiologicalSex | null;
    /** AAAA-MM-DD. */
    birthDate: string | null;
    heightCm: number | null;
    activityLevel: ActivityLevel | null;
    weightKg: number | null;
  };
  draft: { goals?: GoalsInput; goalSource?: GoalSource };
  /** A meta do plano de nutrição publicado pela equipe (Onb-07b). */
  teamSuggestion: {
    groupId: string;
    groupName: string;
    authorName: string | null;
    goals: TeamGoals;
  } | null;
}

export interface SaveOnboardingInput {
  step: OnboardingStepKey;
  objective?: BodyObjective;
  sex?: BiologicalSex;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
  goals?: GoalsInput;
  goalSource?: GoalSource;
}

export type FirstStepKey = 'meal' | 'workout' | 'challenge' | 'community';

export interface FirstStep {
  key: FirstStepKey;
  title: string;
  subtitle: string;
  href: string;
  done: boolean;
}

/** O cartão "Primeiros passos" do Hoje (Onb-11); `null` para quem não o tem. */
export interface FirstStepsView {
  items: FirstStep[];
  doneCount: number;
  allDone: boolean;
  visible: boolean;
}

export const onboardingApi = {
  progress: () => apiFetch<OnboardingProgress>('/api/users/me/onboarding'),
  save: (input: SaveOnboardingInput) =>
    apiFetch<OnboardingProgress>('/api/users/me/onboarding', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  finish: () =>
    apiFetch<{ onboardedAt: string; firstStepsSince: string }>('/api/users/me/onboarding/finish', {
      method: 'POST',
    }),
  firstSteps: () => apiFetch<FirstStepsView | null>('/api/users/me/onboarding/first-steps'),
};

/** O anel do cartão: `pathLength` 100, como a prancha. */
export const firstStepsRingOffset = (done: number, total: number) =>
  total === 0 ? 100 : Math.round(100 - (done / total) * 100);

/** "Continuando de onde parou" (Onb-Retomada). */
export const RESUME_TOAST = 'Continuando de onde parou';
export const RESUME_NOTE = {
  title: 'Salvo a cada passo',
  body: 'Objetivo, dados e respostas ficam guardados. Quem fecha o app volta na mesma tela, já preenchida.',
} as const;

/**
 * O app deve voltar ao onboarding? Quem ainda não concluiu, e quem concluiu as
 * metas mas parou numa das etapas puláveis (lembretes, notificações, IA).
 */
export function onboardingPending(me: {
  onboardedAt: string | null;
  onboardingStep?: string | null;
}): boolean {
  return me.onboardedAt === null || Boolean(me.onboardingStep);
}
