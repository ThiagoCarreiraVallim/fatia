import { describe, expect, it } from 'vitest';
import {
  BODY_STEPPERS,
  parseTypedBody,
  KCAL_BAR,
  aiStepVariant,
  codeFromQr,
  communityCodeHint,
  goalsRangeShift,
  kcalBarPosition,
  nextOnboardingStep,
  onboardingPending,
  onboardingReminderInputs,
  onboardingSteps,
  photoTestMealItems,
  photoTestSummary,
  previousOnboardingStep,
  progressSegment,
  remindersCta,
  resumeOnboardingStep,
  stepsLabel,
  teamGoalsSummary,
  trialTerms,
  waterLabel,
  type FlowContext,
} from '../onboarding-flow';
import type { MyPlan } from '../billing';
import type { GoalsInput } from '../users';

const BASE: FlowContext = {
  invitePending: false,
  inCommunity: false,
  healthAvailable: false,
  aiVariant: null,
};

const GOALS: GoalsInput = {
  kcalMin: 1700,
  kcalMax: 1850,
  proteinMinG: 126,
  proteinMaxG: 154,
  carbsMinG: 115,
  carbsMaxG: 227,
  fatMinG: 49,
  fatMaxG: 69,
  weeklyWorkouts: 3,
  dailyWaterTargetMl: 2500,
  dailyStepsTarget: 9000,
};

const plan = (p: Partial<MyPlan>): MyPlan => ({
  tier: 'FREE',
  source: null,
  reason: 'sem_assinatura',
  degraded: false,
  state: 'FREE',
  status: null,
  interval: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  trialEligible: true,
  trialDays: 7,
  paymentMethod: null,
  paymentUrl: null,
  manageUrl: null,
  paidBy: null,
  groupName: null,
  programName: null,
  requiresPlan: true,
  webCheckout: true,
  prices: { monthlyCents: 1990, yearlyCents: 17900 },
  ...p,
});

describe('as etapas de cada fluxo (Onb-Fluxos)', () => {
  it('com convite: boas-vindas e compartilhar antes do objetivo, sem a etapa do código', () => {
    expect(
      onboardingSteps({ ...BASE, invitePending: true, inCommunity: true, aiVariant: 'community' }),
    ).toEqual([
      'welcome',
      'share',
      'objective',
      'body',
      'activity',
      'goals',
      'reminders',
      'notifications',
      'ai',
    ]);
  });

  it('com convite e páginas da comunidade: as páginas entre as boas-vindas e o compartilhar (#410)', () => {
    const ctx = { ...BASE, invitePending: true, inCommunity: true, communityPages: true };
    expect(onboardingSteps(ctx).slice(0, 3)).toEqual(['welcome', 'community', 'share']);
    expect(nextOnboardingStep(ctx, 'welcome')).toBe('community');
    expect(previousOnboardingStep(ctx, 'share')).toBe('community');
    // Sem páginas (ou sem convite), a etapa não existe.
    expect(onboardingSteps({ ...ctx, communityPages: false })).not.toContain('community');
    expect(onboardingSteps({ ...BASE, communityPages: true })).not.toContain('community');
    // Dividem o primeiro traço da barra: as outras etapas não andam.
    expect(progressSegment('community')).toBe(0);
    expect(progressSegment('share')).toBe(1);
    expect(progressSegment('objective')).toBe(2);
  });

  it('sem convite: do login direto ao objetivo, e o código depois das notificações', () => {
    expect(onboardingSteps({ ...BASE, aiVariant: 'trial' })).toEqual([
      'objective',
      'body',
      'activity',
      'goals',
      'reminders',
      'notifications',
      'code',
      'ai',
    ]);
  });

  it('saúde do celular só onde dá para ler os passos, logo depois das notificações', () => {
    const steps = onboardingSteps({ ...BASE, healthAvailable: true });
    expect(steps.slice(steps.indexOf('notifications'))).toEqual([
      'notifications',
      'health',
      'code',
    ]);
  });

  it('compra desligada: a etapa da IA some', () => {
    expect(onboardingSteps(BASE)).not.toContain('ai');
  });

  it('avança e volta pela ordem, pulando o que não está no fluxo', () => {
    const ctx = { ...BASE, inCommunity: true, aiVariant: 'community' as const };
    expect(nextOnboardingStep(ctx, 'notifications')).toBe('ai');
    expect(nextOnboardingStep(ctx, 'ai')).toBeNull();
    expect(previousOnboardingStep(ctx, 'objective')).toBeNull();
    expect(previousOnboardingStep(ctx, 'ai')).toBe('notifications');
    // Entrou pelo código: a etapa sai da lista, e o próximo vem da ordem.
    expect(nextOnboardingStep(ctx, 'code')).toBe('ai');
  });

  it('retoma na etapa salva; se ela saiu do fluxo, na seguinte', () => {
    expect(resumeOnboardingStep(BASE, 'activity')).toBe('activity');
    // O convite já foi respondido: "share" não está mais no fluxo.
    expect(resumeOnboardingStep(BASE, 'share')).toBe('objective');
    expect(resumeOnboardingStep(BASE, null)).toBe('objective');
    expect(resumeOnboardingStep({ ...BASE, invitePending: true }, null)).toBe('welcome');
    expect(resumeOnboardingStep({ ...BASE, inCommunity: true }, 'code')).toBeNull();
  });

  it('a barra tem 9 traços, na posição da prancha', () => {
    expect(progressSegment('welcome')).toBe(0);
    expect(progressSegment('objective')).toBe(2);
    expect(progressSegment('notifications')).toBe(7);
    expect(progressSegment('health')).toBe(8);
    expect(progressSegment('code')).toBe(8);
    expect(progressSegment('ai')).toBe(8);
  });
});

describe('a variante da etapa 10', () => {
  it('PRO pela comunidade → demonstração; Free com compra → teste; sem compra → some', () => {
    expect(aiStepVariant(plan({ tier: 'PRO', source: 'GROUP' }), true)).toBe('community');
    expect(aiStepVariant(plan({}), true)).toBe('trial');
    expect(aiStepVariant(plan({}), false)).toBeNull();
    expect(aiStepVariant(plan({ tier: 'PRO', source: 'APPLE' }), true)).toBeNull();
    expect(aiStepVariant(plan({ requiresPlan: false }), true)).toBeNull();
    expect(aiStepVariant(null, true)).toBeNull();
  });
});

describe('metas em faixa (Onb-07)', () => {
  it('mais e menos mexem 50 kcal e o carboidrato acompanha', () => {
    const up = goalsRangeShift(GOALS, 50);
    expect([up.kcalMin, up.kcalMax]).toEqual([1750, 1900]);
    expect([up.carbsMinG, up.carbsMaxG]).toEqual([128, 240]);
    expect([up.proteinMinG, up.fatMaxG]).toEqual([126, 69]);
  });

  it('a faixa não sai da régua de 1.200 a 2.600', () => {
    const low = goalsRangeShift({ ...GOALS, kcalMin: 1220, kcalMax: 1370 }, -50);
    expect(low.kcalMin).toBe(KCAL_BAR.min);
    const high = goalsRangeShift({ ...GOALS, kcalMin: 2400, kcalMax: 2580 }, 50);
    expect(high.kcalMax).toBe(KCAL_BAR.max);
  });

  it('a posição da faixa na régua, em porcentagem', () => {
    expect(kcalBarPosition({ kcalMin: 1700, kcalMax: 1850 })).toEqual({
      leftPct: 35.7,
      widthPct: 10.7,
    });
  });

  it('água e passos como a prancha escreve', () => {
    expect(waterLabel(2500)).toBe('2,5 L de água');
    expect(stepsLabel(9000)).toBe('9 mil passos');
    expect(stepsLabel(8500)).toBe('8,5 mil passos');
  });

  it('o cartão da sugestão da equipe (Onb-07b)', () => {
    expect(
      teamGoalsSummary({
        kcalMin: 1800,
        kcalMax: 1880,
        proteinMinG: 135,
        proteinMaxG: 145,
        carbsMinG: 210,
        carbsMaxG: 230,
        fatMinG: 60,
        fatMaxG: 66,
      }),
    ).toEqual({ kcal: '1.840 kcal', macros: 'P 140 · C 220 · G 63' });
  });
});

describe('lembretes do onboarding (Onb-08)', () => {
  it('água a cada 2 h das 8h às 20h, refeições em três horários, treino às 18h nos dias da meta', () => {
    const inputs = onboardingReminderInputs(['water', 'meals', 'workout'], 3);
    expect(inputs).toEqual([
      {
        kind: 'WATER',
        mode: 'INTERVAL',
        everyHours: 2,
        from: '08:00',
        to: '20:00',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        kind: 'MEAL',
        mode: 'TIMES',
        times: ['08:00', '12:30', '19:30'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      },
      { kind: 'WORKOUT', mode: 'TIMES', times: ['18:00'], weekdays: [1, 3, 5] },
    ]);
  });

  it('o botão conta os lembretes ligados', () => {
    expect(remindersCta(0)).toBe('Continuar sem lembretes');
    expect(remindersCta(1)).toBe('Ligar 1 lembrete');
    expect(remindersCta(2)).toBe('Ligar 2 lembretes');
  });
});

describe('teste grátis (Onb-10b)', () => {
  it('preço do plano real e a cobrança 7 dias depois de hoje', () => {
    expect(
      trialTerms({
        price: 'R$ 179,00',
        interval: 'YEARLY',
        today: new Date('2026-11-04T12:00:00-03:00'),
        channel: 'store',
      }),
    ).toBe(
      'Grátis por 7 dias, depois R$ 179,00 por ano, cobrado em 11/11. Renova sozinho; cancele nas assinaturas da loja até 24 h antes do fim do período.',
    );
  });
});

describe('quando voltar ao onboarding', () => {
  it('quem não concluiu, e quem concluiu as metas mas parou numa etapa pulável', () => {
    expect(onboardingPending({ onboardedAt: null, onboardingStep: null })).toBe(true);
    expect(onboardingPending({ onboardedAt: '2026-11-04', onboardingStep: 'reminders' })).toBe(
      true,
    );
    expect(onboardingPending({ onboardedAt: '2026-11-04', onboardingStep: null })).toBe(false);
  });
});

describe('o teste da foto (Onb-10a)', () => {
  const rec = {
    observacao: null,
    itens: [
      {
        nomeReconhecido: 'Arroz',
        foodId: 3,
        nomeDoCatalogo: 'Arroz, tipo 1, cozido',
        grams: 120,
        confidence: 0.9,
        estimado: false,
        kcal: 154,
        proteinG: 3,
        carbsG: 34,
        fatG: 0.3,
      },
      {
        nomeReconhecido: 'Frango grelhado',
        foodId: null,
        nomeDoCatalogo: null,
        grams: 100,
        confidence: 0.7,
        estimado: true,
        kcal: 165,
        proteinG: 31,
        carbsG: null,
        fatG: 3.6,
      },
    ],
  };

  it('resume em etiquetas, kcal e macros', () => {
    expect(photoTestSummary(rec)).toEqual({
      items: [
        { name: 'Arroz', grams: 120 },
        { name: 'Frango grelhado', grams: 100 },
      ],
      kcal: 319,
      macros: 'P 34 · C 34 · G 4',
    });
  });

  it('o item casado vai só com foodId e gramas; o livre leva os macros do modelo', () => {
    expect(photoTestMealItems(rec)).toEqual([
      { foodId: 3, grams: 120 },
      { foodName: 'Frango grelhado', grams: 100, kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
    ]);
  });
});

describe('o QR da recepção (Onb-Codigo)', () => {
  it('aceita o código puro ou um link com ele, e recusa o resto', () => {
    expect(codeFromQr('demo30')).toBe('DEMO30');
    expect(codeFromQr('https://app.fat.ia.br/community?code=demo30')).toBe('DEMO30');
    expect(codeFromQr('https://app.fat.ia.br/c/academia-demo')).toBe('ACADEMIA-DEMO');
    expect(codeFromQr('texto qualquer com espaço')).toBeNull();
  });
});

describe('código da comunidade (Onb-Codigo)', () => {
  it('diz o que falta, se achou e se não achou', () => {
    expect(communityCodeHint({ code: '', status: 'idle' })).toBe(
      'O código que sua academia ou seu personal divulga.',
    );
    expect(communityCodeHint({ code: 'DEMO', status: 'found', groupName: 'Academia Demo' })).toBe(
      'Academia Demo encontrada',
    );
    expect(communityCodeHint({ code: 'XYZ123', status: 'not-found' })).toBe(
      'Nenhuma comunidade com esse código.',
    );
  });
});

describe('altura e peso digitados (Onb-05)', () => {
  const H = BODY_STEPPERS.height;
  const W = BODY_STEPPERS.weight;

  it('aceita vírgula ou ponto e arredonda como o stepper', () => {
    expect(parseTypedBody('70,25', W)).toBe(70.3);
    expect(parseTypedBody(' 82.4 ', W)).toBe(82.4);
    expect(parseTypedBody('175', H)).toBe(175);
    expect(parseTypedBody('175,6', H)).toBe(176);
  });

  it('fora da faixa vira o limite; vazio ou texto não muda nada', () => {
    expect(parseTypedBody('400', W)).toBe(W.max);
    expect(parseTypedBody('20', W)).toBe(W.min);
    expect(parseTypedBody('', W)).toBeNull();
    expect(parseTypedBody('abc', H)).toBeNull();
    expect(parseTypedBody('0', H)).toBeNull();
  });
});
