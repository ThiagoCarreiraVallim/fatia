import type { IdentitySyncService } from '../../auth/identity-sync.service';
import { ChatRunRegistry } from '../../chat/chat-run.registry';
import { AutoWriteService } from '../../chat/auto-write/auto-write.service';
import { PreviaDaAcaoService } from '../../chat/previa/previa-da-acao.service';
import type { McpToolRegistry } from '../../mcp/mcp-tool.registry';
import { SharedWithService } from '../../sharing/shared-with.service';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import {
  GroupRole,
  GroupType,
  MealType,
  MembershipStatus,
  SetupStep,
  ShareScope,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AccessAuditService } from '../../sharing/access-audit.service';
import { ConsentService } from '../../sharing/consent.service';
import { BenefitService } from '../../sharing/benefit.service';
import { WelcomeService } from '../../sharing/welcome.service';
import { ContentService } from '../../sharing/content.service';
import { GroupExerciseService } from '../../sharing/group-exercise.service';
import { GroupService } from '../../sharing/group.service';
import { MembershipService } from '../../sharing/membership.service';
import { PlanMaterializerService } from '../../sharing/plan-materializer.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION } from '../../sharing/plan-snapshot';
import { ProfessionalAccessService } from '../../sharing/professional-access.service';
import { ProfessionalLinkService } from '../../sharing/professional-link.service';
import { StudentViewService } from '../../sharing/student-view.service';
import { ConversationService } from '../../chat/conversation.service';
import { MemoryService } from '../../chat/memory/memory.service';
import { AI_CONSENT_VERSIONS, AiConsentService } from '../../chat/consent/ai-consent.service';
import { GoalsService } from '../../goals/goals.service';
import { FoodService } from '../../nutrition/food.service';
import { FoodShortcutsService } from '../../nutrition/food-shortcuts.service';
import { FoodPortionService } from '../../nutrition/food-portion.service';
import { MealItemService } from '../../nutrition/meal-item.service';
import { MealService } from '../../nutrition/meal.service';
import { MealCopyService } from '../../nutrition/meal-copy.service';
import { MealTemplateService } from '../../nutrition/meal-template.service';
import { addDaysIso, dateInTz, dayBoundsInTz, todayInTz } from '../../progress/helpers/date-tz';
import { NutrientTargetService } from '../../nutrition/nutrient-target.service';
import { NutritionSummaryService } from '../../nutrition/nutrition-summary.service';
import { UserGoalsService } from '../../nutrition/user-goals.service';
import { OnboardingService } from '../../nutrition/onboarding.service';
import { ProgressService } from '../../progress/progress.service';
import { StepLogService } from '../../progress/step-log.service';
import { WaterLogService } from '../../progress/water-log.service';
import { WeightLogService } from '../../progress/weight-log.service';
import { ExerciseService } from '../../workout/exercise.service';
import { SessionSetService } from '../../workout/session-set.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { WorkoutSessionService } from '../../workout/workout-session.service';
import { CircuitSessionService } from '../../workout/circuit-session.service';
import { MuscleSummaryService } from '../../workout/muscle-summary.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ProfileService } from '../../users/profile.service';
import { YouService } from '../../you/you.service';
import { ApiKeyService } from '../../integrations/api-key.service';
import { IntegrationReadService } from '../../integrations/integration-read.service';
import { AccountService, DELETE_CONFIRMATION } from '../../users/account.service';
import { DataExportService } from '../../users/data-export.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import type { CheckpointPurgeService } from '../../chat/checkpoint-purge.service';
import { InboxService } from '../../notifications/inbox.service';
import { ReminderService } from '../../notifications/reminders/reminder.service';
import { DashboardService } from '../../progress/dashboard.service';
import { ConsistencyService } from '../../progress/consistency.service';
import { AchievementService } from '../../progress/achievement.service';
import { DailyAdherenceService } from '../../nutrition/daily-adherence.service';
import { NutritionPlanService } from '../../nutrition/nutrition-plan.service';
import { PlanCopyService } from '../../sharing/plan-copy.service';
import { PlanOfferService } from '../../sharing/plan-offer.service';
import { PlanSendService } from '../../sharing/plan-send.service';
import { NutritionCopyService } from '../../sharing/nutrition-copy.service';
import { MemberFileService } from '../../sharing/member-file.service';
import { MemberNoteService } from '../../sharing/member-note.service';
import { ReviewService } from '../../sharing/review.service';
import { ReportService } from '../../sharing/report.service';
import { PostService } from '../../sharing/post.service';
import { BlockService } from '../../sharing/block.service';
import { AgendaService } from '../../workout/agenda.service';
import { SubscriptionEntitlementsService } from '../../billing/subscription-entitlements.service';
import { UserSubscriptionService } from '../../billing/user-subscription.service';
import type { SubscriptionProvider } from '../../billing/billing-provider.port';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtValidationService } from '../../auth/jwt-validation.service';
import { McpConnectionRecorder, McpConnectionService } from '../../auth/mcp-connection.service';
import { OAuthFacadeService } from '../../auth/oauth-facade.service';
import { UserProvisioningService } from '../../auth/user-provisioning.service';
import { UsersController } from '../../users/users.controller';
import { ScoreboardService } from '../../social/scoreboard.service';
import { ChallengeService } from '../../sharing/challenge.service';
import { ChallengeCheckinService } from '../../sharing/challenge-checkin.service';
import { PanelService } from '../../sharing/panel.service';
import { TeamService } from '../../sharing/team.service';
import { InviteService } from '../../sharing/invite.service';
import { MemberAdminService } from '../../sharing/member-admin.service';
import { SeatPoolService } from '../../billing/seat-pool.service';
import { DemoSessionService } from '../../auth/demo-session.service';
import { DemoService } from '../../sharing/demo.service';
import { CommunitySetupService } from '../../sharing/community-setup.service';
import {
  announcementUnsubscribeToken,
  AnnouncementEmailService,
} from '../../notifications/announcement-email.service';

/**
 * Isolamento multi-tenant, ponta a ponta contra Postgres real (issue #92).
 *
 * Os specs de service existentes usam Prisma mockado, então provam que o `where`
 * foi montado com `userId` — não que o banco de fato não devolve o dado do
 * vizinho. Este spec fecha essa lacuna: semeia tudo como user-A e tenta ler,
 * editar e apagar como user-B, exigindo `NOT_FOUND`/`FORBIDDEN`/vazio.
 *
 * A cobertura é a matriz de `docs/THREAT_MODEL.md`. Remover um filtro `userId`
 * de qualquer service quebra este arquivo.
 *
 * Requer `DATABASE_URL` com as migrations aplicadas — é o que o job `test` do CI
 * já provisiona.
 */

const TZ = 'America/Sao_Paulo';
const TODAY = '2026-03-10';

/** O código que o user-A ligou ao alimento dele (#375). */
const BARCODE_A = '7891000100103';

describe('isolamento entre usuários', () => {
  const prisma = new PrismaService();

  // A foto da refeição (#374) mora no bucket: em memória aqui.
  const mealPhotoStore = new MemoryObjectStore();
  const mealMedia = new MediaService(prisma, mealPhotoStore);
  const meals = new MealService(prisma, mealMedia);
  const foods = new FoodService(prisma);
  const shortcuts = new FoodShortcutsService(prisma, foods);
  const portions = new FoodPortionService(prisma, foods);
  const mealItems = new MealItemService(prisma, meals);
  const mealCopies = new MealCopyService(prisma, meals);
  const mealTemplates = new MealTemplateService(prisma, meals);
  const nutrientTargets = new NutrientTargetService(prisma);
  const userGoals = new UserGoalsService(prisma);
  const onboarding = new OnboardingService(prisma);
  const weights = new WeightLogService(prisma);
  const steps = new StepLogService(prisma);
  const waters = new WaterLogService(prisma);
  const goals = new GoalsService(prisma, weights, steps);
  const consistency = new ConsistencyService(prisma);
  const achievements = new AchievementService(prisma, consistency);
  const progress = new ProgressService(prisma, steps, waters);
  const nutritionSummary = new NutritionSummaryService(prisma);
  const exercises = new ExerciseService(prisma);
  const plans = new WorkoutPlanService(prisma);
  const sessions = new WorkoutSessionService(prisma);
  const circuits = new CircuitSessionService(prisma);
  const sets = new SessionSetService(prisma);
  const muscles = new MuscleSummaryService(prisma);
  const links = new ProfessionalLinkService(prisma);
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const groups = new GroupService(prisma, links);
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const consent = new ConsentService(prisma, links);
  const conversas = new ConversationService(prisma);
  const memorias = new MemoryService(prisma);
  const aceitesDaIa = new AiConsentService(prisma);
  const inbox = new InboxService(prisma);
  const reminders = new ReminderService(prisma);
  const nutritionPlans = new NutritionPlanService(
    prisma,
    meals,
    new DailyAdherenceService(prisma),
    new SharedWithService(prisma),
  );

  /** Dados do user-A. Preenchido no beforeAll e sondado como user-B. */
  const owned = {
    userA: '',
    userB: '',
    /** Terceiro usuário: profissional da academia do user-A (ADR 014). */
    pro: '',
    /**
     * Segundo profissional da MESMA academia. Existe para que a revogação em
     * massa da saída seja conferida com dois vínculos vivos: um `updateMany`
     * que filtrasse por profissional específico revogaria um e deixaria o outro
     * lendo o histórico de quem já saiu.
     */
    pro2: '',
    /**
     * Papéis que NÃO podem ler dado de aluno, na mesma academia (#156). Existem
     * para que "papel não lê" seja verificado com o papel de fato criado no
     * banco, e não simulado trocando o `role` de um profissional na marra.
     */
    creator: '',
    /** Outro aluno da MESMA academia. Colega não lê colega. */
    colega: '',
    groupId: '',
    /** Grupo do `pro`, em que o user-A não está. Grupo alheio, para o #92. */
    grupoDoProId: '',
    /** Membership do user-A (o titular do dado) no grupo. */
    membershipA: '',
    /** Membership do próprio `pro` no grupo. Usada para "demitir" o personal. */
    membershipPro: '',
    membershipPro2: '',
    /** Membership do user-B num grupo em que `pro` não tem nada a ver. */
    membershipForaId: '',
    mealId: '',
    mealItemId: '',
    customFoodId: 0,
    /** Alimento público (como um da TACO): os dois enxergam, cada um com a sua medida. */
    publicFoodId: 0,
    portionA: '',
    customExerciseId: 0,
    goalId: '',
    weightLogId: '',
    stepLogId: '',
    waterLogId: '',
    planId: '',
    planExerciseId: '',
    sessionId: '',
    setId: '',
    sharedExerciseId: 0,
    /** Conversa com a IA hospedada (#249). Semeada como user-A. */
    conversationId: '',
    /** O que o assistente guardou sobre o user-A, a pedido dele. */
    memoryId: '',
    /** Aviso do sino do user-A (#373). */
    inboxNoticeId: '',
    reminderId: '',
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      // Falha explícita em vez de skip: um skip silencioso daria a impressão de
      // que o isolamento foi verificado quando ninguém verificou nada.
      throw new Error(
        'Este spec exige Postgres. Suba o banco (`pnpm infra:up`), aplique as migrations ' +
          '(`pnpm --filter @fatia/db exec prisma migrate deploy`) e defina DATABASE_URL. ' +
          'No CI, o job `test` já provisiona tudo isso.',
      );
    }

    await prisma.$connect();

    const stamp = `iso-${Date.now()}`;
    const [userA, userB, pro, pro2, creator, colega] = await Promise.all([
      prisma.user.create({
        data: {
          logtoSub: `${stamp}-a`,
          email: `${stamp}-a@test.local`,
          name: 'User A',
          timezone: TZ,
        },
      }),
      prisma.user.create({
        data: {
          logtoSub: `${stamp}-b`,
          email: `${stamp}-b@test.local`,
          name: 'User B',
          timezone: TZ,
        },
      }),
      prisma.user.create({
        data: {
          logtoSub: `${stamp}-pro`,
          email: `${stamp}-pro@test.local`,
          name: 'Pro',
          timezone: TZ,
        },
      }),
      prisma.user.create({
        data: {
          logtoSub: `${stamp}-pro2`,
          email: `${stamp}-pro2@test.local`,
          name: 'Pro 2',
          timezone: TZ,
        },
      }),
      prisma.user.create({
        data: {
          logtoSub: `${stamp}-creator`,
          email: `${stamp}-creator@test.local`,
          name: 'Creator',
          timezone: TZ,
        },
      }),
      prisma.user.create({
        data: {
          logtoSub: `${stamp}-colega`,
          email: `${stamp}-colega@test.local`,
          name: 'Colega',
          timezone: TZ,
        },
      }),
    ]);
    owned.userA = userA.id;
    owned.userB = userB.id;
    owned.pro = pro.id;
    owned.pro2 = pro2.id;
    owned.creator = creator.id;
    owned.colega = colega.id;

    // Exercício de catálogo público — usado nas séries. Não pertence a ninguém.
    const shared = await prisma.exercise.create({
      data: { name: `${stamp}-shared-ex`, muscleGroup: 'peito', primaryMuscles: ['chest'] },
    });
    owned.sharedExerciseId = shared.id;

    // --- estrutura B2B (ADR 014) ---
    //
    // O grupo é do **user-B**, e o user-A é aluno dele. Isso é de propósito:
    // todos os casos deste arquivo passam a rodar com o user-B na posição de
    // dono da academia do user-A, e continuam exigindo recusa. Dono de grupo
    // só lê com o vínculo que o aluno consentiu (ADR 026), e os services de
    // domínio nunca — a garantia sai de graça em ~50 casos.
    const group = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: 'Academia B',
        slug: `${stamp}-academia`,
        ownerId: owned.userB,
        memberships: {
          create: [
            { userId: owned.userB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            { userId: owned.pro, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
            { userId: owned.pro2, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
            { userId: owned.creator, role: GroupRole.CREATOR, status: MembershipStatus.ACTIVE },
            { userId: owned.colega, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
          ],
        },
      },
      include: { memberships: true },
    });
    owned.groupId = group.id;
    owned.membershipA = group.memberships.find((m) => m.userId === owned.userA)!.id;
    owned.membershipPro = group.memberships.find((m) => m.userId === owned.pro)!.id;
    owned.membershipPro2 = group.memberships.find((m) => m.userId === owned.pro2)!.id;

    // Grupo à parte, do próprio `pro`, com o user-B dentro. Serve para provar
    // que um `membershipId` válido de OUTRO contexto não resolve — nem quando
    // quem pergunta é o dono daquele grupo.
    const outro = await prisma.group.create({
      data: {
        type: GroupType.SOCIAL,
        name: 'Grupo do Pro',
        slug: `${stamp}-pro-grupo`,
        ownerId: owned.pro,
        memberships: {
          create: [
            { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
          ],
        },
      },
      include: { memberships: true },
    });
    owned.membershipForaId = outro.memberships.find((m) => m.userId === owned.userB)!.id;
    owned.grupoDoProId = outro.id;

    // --- semeia tudo como user-A ---
    const customFood = await foods.createCustom(owned.userA, {
      name: `${stamp}-food`,
      kcalPer100g: 100,
      proteinPer100g: 10,
      carbsPer100g: 10,
      fatPer100g: 1,
      nutrients: { fiber_g: 3 },
      barcode: BARCODE_A,
    });
    owned.customFoodId = customFood.id;
    await shortcuts.setFavorite(owned.userA, customFood.id, true);

    owned.publicFoodId = (
      await prisma.food.create({
        data: {
          name: `${stamp}-publico`,
          searchName: `${stamp}-publico`,
          source: 'TACO',
          kcalPer100g: 100,
          proteinPer100g: 1,
          carbsPer100g: 20,
          fatPer100g: 1,
        },
      })
    ).id;
    owned.portionA = (
      await portions.create(owned.userA, owned.publicFoodId, { label: 'concha de A', grams: 140 })
    ).id;

    const meal = await meals.create(owned.userA, {
      mealType: MealType.LUNCH,
      eatenAt: `${TODAY}T12:00:00Z`,
      items: [{ foodId: customFood.id, grams: 100 }],
    });
    owned.mealId = meal.id;
    owned.mealItemId = meal.items[0].id;

    await nutrientTargets.upsert(owned.userA, {
      nutrientKey: 'sodium_mg',
      label: 'Sódio',
      unit: 'mg',
      max: 2000,
    });

    await userGoals.upsert(owned.userA, {
      kcalMin: 1800,
      kcalMax: 2200,
      proteinMinG: 120,
      proteinMaxG: 180,
      carbsMinG: 150,
      carbsMaxG: 250,
      fatMinG: 40,
      fatMaxG: 80,
    });

    const weightLog = await weights.create({ weightKg: 80 }, owned.userA, TZ);
    owned.weightLogId = weightLog.id;

    const stepLog = await steps.create({ date: TODAY, steps: 9000 }, owned.userA, TZ);
    owned.stepLogId = stepLog.id;

    const waterLog = await waters.create({ date: TODAY, ml: 500 }, owned.userA, TZ);
    owned.waterLogId = waterLog.id;

    const goal = await goals.create(
      { kind: 'weight', title: 'Meta A', targetValue: 75, unit: 'kg', startValue: 80 },
      owned.userA,
      TZ,
    );
    owned.goalId = goal.id;

    const customExercise = await exercises.createCustom(owned.userA, {
      name: `${stamp}-custom-ex`,
      muscleGroup: 'costas',
    });
    owned.customExerciseId = customExercise.id;

    const plan = await plans.create(owned.userA, { name: `${stamp}-plan` });
    owned.planId = plan.id;

    const planExercise = await plans.addExercise(owned.userA, plan.id, {
      exerciseId: shared.id,
      order: 1,
      targetSets: 3,
      targetReps: '8-12',
    });
    owned.planExerciseId = planExercise.id;

    const session = await sessions.start(owned.userA, {});
    owned.sessionId = session.id;

    const set = await sets.create(owned.userA, {
      sessionId: session.id,
      exerciseId: shared.id,
      weightKg: 60,
      reps: 8,
    });
    owned.setId = set.id;

    // Conversa com a IA hospedada (#249), com um turno completo. Semeada pelo
    // próprio serviço para que o caminho feliz de escrita seja exercitado aqui —
    // sem ele, as recusas abaixo passariam vazias.
    const turno = await conversas.iniciarTurno(owned.userA, randomUUID(), 'quanto comi hoje?');
    owned.conversationId = turno.conversationId;
    await conversas.completeTurn(owned.userA, turno.conversationId, {
      texto: 'Você comeu 1.800 kcal hoje.',
      tools: [{ name: 'get_nutrition_summary' }],
      status: 'completed',
      pausa: null,
      runId: null,
    });
    owned.memoryId = (await memorias.remember(owned.userA, 'Não come carne nem ovo.')).id;
    owned.inboxNoticeId = (
      await prisma.inboxNotice.create({
        data: {
          userId: owned.userA,
          kind: 'COMMUNITY',
          title: 'Seu pedido foi aprovado',
          body: 'Bem-vinda à Academia.',
          url: '/community',
        },
      })
    ).id;
    owned.reminderId = (
      await reminders.create(owned.userA, {
        kind: 'MEAL',
        mode: 'TIMES',
        times: ['12:30'],
        weekdays: [1, 2, 3, 4, 5],
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    // Cascade limpa tudo que pende dos usuários; o exercício público é solto.
    await prisma.user
      .deleteMany({
        where: {
          id: {
            in: [
              owned.userA,
              owned.userB,
              owned.pro,
              owned.pro2,
              owned.creator,
              owned.colega,
            ].filter(Boolean),
          },
        },
      })
      .catch(() => undefined);
    await prisma.food.deleteMany({ where: { id: owned.publicFoodId } }).catch(() => undefined);
    await prisma.exercise
      .deleteMany({ where: { id: owned.sharedExerciseId } })
      .catch(() => undefined);
    await prisma.$disconnect();
  });

  it('semeou os dados do user-A', () => {
    // Sanidade: sem isso, as expectativas de "vazio" abaixo passariam de graça.
    expect(owned.userA).not.toBe('');
    expect(owned.userB).not.toBe(owned.userA);
    expect(owned.mealId).not.toBe('');
    expect(owned.setId).not.toBe('');
  });

  it('semeou a estrutura B2B', () => {
    // Mesma razão: sem membership válida, os `NOT_FOUND` abaixo seriam triviais.
    expect(owned.pro).not.toBe('');
    expect(owned.groupId).not.toBe('');
    expect(owned.membershipA).not.toBe('');
    expect(owned.membershipForaId).not.toBe('');
  });

  describe('leituras por id não atravessam usuários', () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ['get_meal', () => meals.findById(owned.userB, owned.mealId)],
      ['get_food (custom de outro)', () => foods.get(owned.userB, owned.customFoodId)],
      ['get_goal', () => goals.findById(owned.goalId, owned.userB, TZ)],
      ['get_weight_log', () => weights.findById(owned.weightLogId, owned.userB)],
      ['get_step_log', () => steps.findById(owned.stepLogId, owned.userB)],
      ['get_water_log', () => waters.findById(owned.waterLogId, owned.userB)],
      ['get_workout_plan', () => plans.findById(owned.userB, owned.planId)],
      ['get_workout_session', () => sessions.findById(owned.userB, owned.sessionId)],
      [
        'get_exercise_details (custom de outro)',
        () => exercises.get(owned.userB, owned.customExerciseId),
      ],
    ];

    it.each(cases)('%s recusa o dado do user-A', async (_label, call) => {
      await expect(call()).rejects.toThrow(NotFoundException);
    });
  });

  describe('listagens não incluem dados de outro usuário', () => {
    it('séries por músculo da semana (#369): o dono vê as dele, o vizinho não vê nenhuma', async () => {
      // Caminho feliz primeiro: sem ele, um resumo sempre zerado passaria.
      const dono = await muscles.weekly(owned.userA, TZ);
      expect(dono.sets.find((s) => s.group === 'peito')?.sets).toBeGreaterThan(0);

      const vizinho = await muscles.weekly(owned.userB, TZ);
      expect(vizinho.sets.every((s) => s.sets === 0)).toBe(true);
      // O plano do user-A nunca vira sugestão para o user-B.
      expect(vizinho.suggestedPlan?.id).not.toBe(owned.planId);
    });

    it('a semana de qualquer dia (#479): o dono vê o treino dele, o vizinho uma semana vazia', async () => {
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
      // Caminho feliz primeiro: a sessão aberta do user-A aparece na semana dele.
      const dono = await muscles.trainingWeek(owned.userA, TZ, hoje);
      expect(dono.days.some((d) => d.active || d.trained)).toBe(true);

      const vizinho = await muscles.trainingWeek(owned.userB, TZ, hoje);
      expect(vizinho.days.some((d) => d.active || d.trained)).toBe(false);
      expect(vizinho.done).toBe(0);
    });

    it('list_meals volta vazio', async () => {
      await expect(meals.list(owned.userB, {}, TZ)).resolves.toEqual([]);
    });

    it('list_goals volta vazio', async () => {
      await expect(goals.list({}, owned.userB, TZ)).resolves.toEqual([]);
    });

    it('list_weight_logs volta vazio', async () => {
      const { logs } = await weights.list({}, owned.userB);
      expect(logs).toEqual([]);
    });

    it('list_step_logs volta vazio', async () => {
      const { logs } = await steps.list({}, owned.userB);
      expect(logs).toEqual([]);
    });

    it('list_water_logs volta vazio', async () => {
      const { logs } = await waters.list({}, owned.userB);
      expect(logs).toEqual([]);
    });

    it('list_workout_plans volta vazio', async () => {
      await expect(plans.list(owned.userB)).resolves.toEqual([]);
    });

    it('list_workout_sessions volta vazio', async () => {
      await expect(sessions.list(owned.userB, {})).resolves.toEqual([]);
    });

    it('o histórico (#381): o dono vê a sessão dele, o vizinho vê lista e totais zerados', async () => {
      // Caminho feliz primeiro: um histórico sempre vazio passaria no vizinho.
      await prisma.workoutSession.update({
        where: { id: owned.sessionId },
        data: { completedAt: new Date() },
      });
      try {
        const dono = await sessions.history(owned.userA, {});
        expect(dono.items.map((i) => i.id)).toContain(owned.sessionId);
        await expect(sessions.history(owned.userB, {})).resolves.toEqual({
          totals: { sessions: 0, avgDurationMinutes: null, volumeKg: 0 },
          items: [],
          nextCursor: null,
        });
      } finally {
        await prisma.workoutSession.update({
          where: { id: owned.sessionId },
          data: { completedAt: null },
        });
      }
    });

    it('list_nutrient_targets volta vazio', async () => {
      await expect(nutrientTargets.list(owned.userB)).resolves.toEqual([]);
    });

    it('list_personal_records volta vazio', async () => {
      await expect(sets.listPersonalRecords(owned.userB)).resolves.toEqual([]);
      await expect(sets.recordsOverview(owned.userB)).resolves.toEqual({
        records: [],
        highlight: null,
      });
    });

    it('get_consistency e get_streak do user-B não contam os dias do user-A (#382)', async () => {
      // Sanidade: a refeição do user-A cai dentro do ano, então o A tem dia ativo.
      const deA = await consistency.report({ userId: owned.userA, timezone: TZ }, 'year');
      expect(deA.activeDays).toBeGreaterThan(0);

      const deB = await consistency.report({ userId: owned.userB, timezone: TZ }, 'year');
      expect(deB.activeDays).toBe(0);
      expect(deB.days.every((d) => d.count === 0)).toBe(true);
      const streak = await consistency.streak({ userId: owned.userB, timezone: TZ });
      expect(streak.activeDays.periodos).toBe(0);
    });

    it('refresh_achievements do user-B não desbloqueia pelo que o user-A fez', async () => {
      const lista = await achievements.evaluate({ userId: owned.userB, timezone: TZ });
      expect(lista.find((a) => a.key === 'first_meal')?.unlockedAt).toBeNull();
      expect(lista.find((a) => a.key === 'plan_created')?.unlockedAt).toBeNull();
    });

    it('get_active_workout_session não vê a sessão aberta do user-A', async () => {
      await expect(sessions.findActive(owned.userB)).resolves.toBeNull();
    });

    it('search_food não retorna o alimento custom do user-A', async () => {
      const found = await foods.search(owned.userB, {});
      expect(found.map((food) => food.id)).not.toContain(owned.customFoodId);
    });

    it('list_my_foods não traz favorito nem recente do user-A', async () => {
      // Sanidade: para o dono, o alimento aparece — senão o caso abaixo passaria vazio.
      const deA = await shortcuts.list(owned.userA, {});
      expect(deA.favorites.map((food) => food.id)).toContain(owned.customFoodId);

      const deB = await shortcuts.list(owned.userB, {});
      const ids = [...deB.favorites, ...deB.recent].map((food) => food.id);
      expect(ids).not.toContain(owned.customFoodId);
    });

    it('get_food e search_food não mostram a medida caseira do user-A', async () => {
      // Sanidade: o dono vê a própria medida.
      const deA = await foods.get(owned.userA, owned.publicFoodId);
      expect(deA.portions.map((p) => p.id)).toContain(owned.portionA);

      const deB = await foods.get(owned.userB, owned.publicFoodId);
      expect(deB.portions.map((p) => p.id)).not.toContain(owned.portionA);
      const busca = await foods.search(owned.userB, { q: 'publico' });
      const doPublico = busca.find((food) => food.id === owned.publicFoodId);
      expect(doPublico?.portions.map((p) => p.id)).not.toContain(owned.portionA);
      await expect(portions.list(owned.userB, owned.publicFoodId)).resolves.toEqual([]);
    });

    it('search_exercise não retorna o exercício custom do user-A', async () => {
      const found = await exercises.search(owned.userB, {});
      expect(found.map((exercise) => exercise.id)).not.toContain(owned.customExerciseId);
    });

    it('get_nutrition_goals do user-B não devolve as metas do user-A', async () => {
      const result = await userGoals.get(owned.userB);
      if (result) expect(result.userId).toBe(owned.userB);
    });
  });

  describe('escritas não atravessam usuários', () => {
    it('update_meal recusa', async () => {
      await expect(meals.update(owned.userB, owned.mealId, { notes: 'invadido' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete_meal recusa', async () => {
      await expect(meals.delete(owned.userB, owned.mealId)).rejects.toThrow(NotFoundException);
    });

    it('update_meal_item recusa', async () => {
      await expect(mealItems.update(owned.userB, owned.mealItemId, { grams: 999 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('add_meal_item recusa numa refeição de outro', async () => {
      await expect(
        mealItems.add(owned.userB, owned.mealId, { foodName: 'X', grams: 10 }),
      ).rejects.toThrow();
    });

    it('update_custom_food recusa', async () => {
      await expect(
        foods.updateCustom(owned.userB, owned.customFoodId, { name: 'invadido' }),
      ).rejects.toThrow(NotFoundException);
    });

    // #375: o código de barras é do alimento próprio, e o alimento é da pessoa.
    it('a leitura do código não acha o alimento que outra conta ligou ao código', async () => {
      await expect(foods.findByBarcode(owned.userB, BARCODE_A)).resolves.toBeNull();
      const deA = await foods.findByBarcode(owned.userA, BARCODE_A);
      expect(deA?.id).toBe(owned.customFoodId);
    });

    it('o mesmo código vale para outra conta: a unicidade é por dono', async () => {
      const deB = await foods.createCustom(owned.userB, {
        name: 'Iogurte do B',
        kcalPer100g: 60,
        proteinPer100g: 4,
        carbsPer100g: 5,
        fatPer100g: 3,
        barcode: BARCODE_A,
      });
      expect(deB.barcode).toBe(BARCODE_A);
      await expect(foods.findByBarcode(owned.userA, BARCODE_A)).resolves.toMatchObject({
        id: owned.customFoodId,
      });
      await foods.deleteCustom(owned.userB, deB.id);
    });

    it('dois "Salvar" ao mesmo tempo com o mesmo código: um grava, o outro é 409, não 500', async () => {
      const make = (name: string) =>
        foods.createCustom(owned.userB, {
          name,
          kcalPer100g: 60,
          proteinPer100g: 4,
          carbsPer100g: 5,
          fatPer100g: 3,
          barcode: '7896004000014',
        });
      const results = await Promise.allSettled([make('Corrida 1'), make('Corrida 2')]);

      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toBeInstanceOf(ConflictException);
      await foods.deleteCustom(
        owned.userB,
        (ok[0] as PromiseFulfilledResult<{ id: number }>).value.id,
      );
    });

    it('update_custom_food não liga código a alimento de outro', async () => {
      await expect(
        foods.updateCustom(owned.userB, owned.customFoodId, { barcode: '7896004000014' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('list_custom_foods não mostra o alimento de outro', async () => {
      const deB = await foods.listCustom(owned.userB);
      expect(deB.map((f) => f.id)).not.toContain(owned.customFoodId);

      const deA = await foods.listCustom(owned.userA);
      expect(deA.map((f) => f.id)).toContain(owned.customFoodId);
      expect(deA.every((f) => f.createdByUserId === owned.userA)).toBe(true);
    });

    it('delete_custom_food recusa', async () => {
      await expect(foods.deleteCustom(owned.userB, owned.customFoodId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('set_food_favorite recusa o alimento custom de outro', async () => {
      await expect(shortcuts.setFavorite(owned.userB, owned.customFoodId, true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete_food_portion recusa a medida de outro', async () => {
      await expect(portions.remove(owned.userB, owned.portionA)).rejects.toThrow(NotFoundException);
      await expect(prisma.foodPortion.count({ where: { id: owned.portionA } })).resolves.toBe(1);
    });

    it('log_meal recusa registrar com a medida de outro', async () => {
      await expect(
        meals.create(owned.userB, {
          mealType: MealType.SNACK,
          eatenAt: `${TODAY}T16:00:00Z`,
          items: [{ foodId: owned.publicFoodId, portionId: owned.portionA, quantity: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('create_food_portion recusa o alimento custom de outro', async () => {
      await expect(
        portions.create(owned.userB, owned.customFoodId, { label: 'x', grams: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('update_custom_exercise recusa', async () => {
      await expect(
        exercises.updateCustom(owned.userB, owned.customExerciseId, { name: 'invadido' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('delete_custom_exercise recusa', async () => {
      await expect(exercises.deleteCustom(owned.userB, owned.customExerciseId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('update_goal recusa', async () => {
      await expect(
        goals.update(owned.goalId, { title: 'invadido' }, owned.userB, TZ),
      ).rejects.toThrow(NotFoundException);
    });

    it('delete_goal recusa', async () => {
      await expect(goals.delete(owned.goalId, owned.userB)).rejects.toThrow(NotFoundException);
    });

    it('update_weight_log recusa', async () => {
      await expect(
        weights.update(owned.weightLogId, { weightKg: 1 }, owned.userB, TZ),
      ).rejects.toThrow(NotFoundException);
    });

    it('delete_weight_log recusa', async () => {
      await expect(weights.delete(owned.weightLogId, owned.userB)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('update_step_log recusa', async () => {
      await expect(steps.update(owned.stepLogId, { steps: 1 }, owned.userB, TZ)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete_step_log recusa', async () => {
      await expect(steps.delete(owned.stepLogId, owned.userB)).rejects.toThrow(NotFoundException);
    });

    it('update_water_log recusa', async () => {
      await expect(waters.update(owned.waterLogId, { ml: 1 }, owned.userB, TZ)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete_water_log recusa', async () => {
      await expect(waters.delete(owned.waterLogId, owned.userB)).rejects.toThrow(NotFoundException);
    });

    it('update_workout_plan recusa', async () => {
      await expect(plans.update(owned.userB, owned.planId, { name: 'invadido' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete_workout_plan recusa', async () => {
      await expect(plans.delete(owned.userB, owned.planId)).rejects.toThrow(NotFoundException);
    });

    it('reorder_plan_exercises recusa id alheio mesmo com plano próprio na URL', async () => {
      // Este é o caso que os outros não pegam. Todos eles mandam o plano do user-A na URL, e o
      // `assertOwner` barra. Aqui o user-B manda o plano DELE — legítimo, passa no assertOwner —
      // e o id de um `WorkoutPlanExercise` do user-A no corpo. Sem amarrar o id ao plano, a
      // escrita chegava na linha alheia e a resposta era 200.
      //
      // O plano do user-B nasce aqui, e não no seed, para não quebrar as asserções de que ele
      // não enxerga nada — elas são invariante do arquivo inteiro.
      const planB = await plans.create(owned.userB, { name: 'plano-do-b' });

      await expect(
        plans.reorderExercises(owned.userB, planB.id, {
          exercises: [{ id: owned.planExerciseId, order: 99 }],
        }),
      ).rejects.toThrow(NotFoundException);

      // Recusar não basta: o que importa é que nada foi escrito. Sem esta asserção, uma
      // implementação que gravasse e só depois lançasse passaria.
      const alvo = await prisma.workoutPlanExercise.findUnique({
        where: { id: owned.planExerciseId },
      });
      expect(alvo?.order).toBe(1);
    });

    it('add_exercise_to_plan recusa num plano de outro', async () => {
      await expect(
        plans.addExercise(owned.userB, owned.planId, {
          exerciseId: owned.sharedExerciseId,
          order: 1,
          targetSets: 3,
          targetReps: '8-12',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    describe('planos e favoritos de exercício (#378)', () => {
      it('add_exercise_to_plan em lote recusa o exercício pessoal de outro, no plano próprio, sem gravar', async () => {
        const planB = await plans.create(owned.userB, { name: 'lote-do-b' });
        await expect(
          plans.addExercises(owned.userB, planB.id, {
            exercises: [
              { exerciseId: owned.sharedExerciseId },
              { exerciseId: owned.customExerciseId },
            ],
          }),
        ).rejects.toThrow(NotFoundException);
        await expect(
          plans.addExercise(owned.userB, planB.id, { exerciseId: owned.customExerciseId }),
        ).rejects.toThrow(NotFoundException);
        expect(await prisma.workoutPlanExercise.count({ where: { planId: planB.id } })).toBe(0);
        await plans.delete(owned.userB, planB.id);
      });

      it('update_plan_exercise e remove recusam a linha do plano de outro com o plano próprio na URL', async () => {
        const planB = await plans.create(owned.userB, { name: 'url-do-b' });
        await expect(
          plans.updatePlanExercise(owned.userB, planB.id, owned.planExerciseId, {
            restSeconds: 5,
            sets: [{ reps: 1 }],
          }),
        ).rejects.toThrow(NotFoundException);
        await expect(
          plans.removeExercise(owned.userB, planB.id, owned.planExerciseId),
        ).rejects.toThrow(NotFoundException);
        const alvo = await prisma.workoutPlanExercise.findUnique({
          where: { id: owned.planExerciseId },
          include: { sets: true },
        });
        expect(alvo?.restSeconds).toBeNull();
        expect(alvo?.sets).toHaveLength(0);
        await plans.delete(owned.userB, planB.id);
      });

      it('set_exercise_favorite recusa o exercício pessoal de outro', async () => {
        await expect(
          exercises.setFavorite(owned.userB, owned.customExerciseId, true),
        ).rejects.toThrow(NotFoundException);
        expect(
          await prisma.favoriteExercise.count({ where: { exerciseId: owned.customExerciseId } }),
        ).toBe(0);
      });

      it('o favorito do user-A não aparece para o user-B (lista, busca e detalhe)', async () => {
        await exercises.setFavorite(owned.userA, owned.sharedExerciseId, true);
        try {
          expect(await exercises.listFavorites(owned.userB)).toEqual([]);
          expect(await exercises.search(owned.userB, { favoritesOnly: true })).toEqual([]);
          expect((await exercises.getWithMedia(owned.userB, owned.sharedExerciseId)).favorite).toBe(
            false,
          );
          // Desmarcar como B não mexe no favorito de A.
          await exercises.setFavorite(owned.userB, owned.sharedExerciseId, false);
          expect(
            await prisma.favoriteExercise.count({
              where: { userId: owned.userA, exerciseId: owned.sharedExerciseId },
            }),
          ).toBe(1);
        } finally {
          await exercises.setFavorite(owned.userA, owned.sharedExerciseId, false);
        }
      });
    });

    it('finish_workout_session recusa', async () => {
      await expect(sessions.finish(owned.userB, owned.sessionId, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    describe('circuitos (#380)', () => {
      const circuitDto = (exerciseId: number) => ({
        name: 'AMRAP 12',
        format: 'AMRAP' as const,
        durationSeconds: 720,
        exercises: [{ exerciseId, unit: 'REPS' as const, target: 10 }],
      });

      it('criar circuito com o exercício pessoal do user-A recusa, sem gravar', async () => {
        const antes = await prisma.workoutPlan.count({ where: { userId: owned.userB } });
        await expect(
          plans.createCircuit(owned.userB, circuitDto(owned.customExerciseId)),
        ).rejects.toThrow(NotFoundException);
        expect(await prisma.workoutPlan.count({ where: { userId: owned.userB } })).toBe(antes);
      });

      it('editar o plano do user-A como circuito recusa', async () => {
        await expect(
          plans.replaceCircuit(owned.userB, owned.planId, circuitDto(owned.sharedExerciseId)),
        ).rejects.toThrow(NotFoundException);
      });

      it('progresso, encerrar e registrar na sessão do user-A recusam', async () => {
        await expect(circuits.saveProgress(owned.userB, owned.sessionId, [])).rejects.toThrow(
          NotFoundException,
        );
        await expect(
          circuits.finish(owned.userB, owned.sessionId, {
            events: [],
            result: {
              roundsCompleted: 1,
              partialExercises: 0,
              roundSeconds: [],
              elapsedSeconds: 60,
              completed: true,
            },
          }),
        ).rejects.toThrow(NotFoundException);
        await expect(circuits.log(owned.userB, { planId: owned.planId })).rejects.toThrow(
          NotFoundException,
        );
        const sessao = await prisma.workoutSession.findUnique({ where: { id: owned.sessionId } });
        expect(sessao?.completedAt).toBeNull();
        expect(sessao?.circuit).toBeNull();
      });
    });

    it('save_session_as_plan (#381) recusa a sessão de outro e não cria plano', async () => {
      const before = await prisma.workoutPlan.count({ where: { userId: owned.userB } });
      await expect(plans.createFromSession(owned.userB, owned.sessionId, {})).rejects.toThrow(
        NotFoundException,
      );
      expect(await prisma.workoutPlan.count({ where: { userId: owned.userB } })).toBe(before);
    });

    it('update_workout_session recusa', async () => {
      await expect(
        sessions.update(owned.userB, owned.sessionId, { notes: 'invadido' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('delete_workout_session é no-op silencioso e não apaga a sessão do user-A', async () => {
      // O delete é idempotente de propósito (duplo clique / re-render), então
      // sessão de outro usuário responde igual a "já não existe": sucesso vazio.
      // O que importa é o efeito — a sessão do user-A tem de sobreviver.
      await expect(sessions.delete(owned.userB, owned.sessionId)).resolves.toBeUndefined();

      const survivor = await prisma.workoutSession.findUnique({ where: { id: owned.sessionId } });
      expect(survivor).toBeTruthy();
      expect(survivor?.userId).toBe(owned.userA);
    });

    it('log_set recusa numa sessão de outro', async () => {
      await expect(
        sets.create(owned.userB, {
          sessionId: owned.sessionId,
          exerciseId: owned.sharedExerciseId,
          weightKg: 1,
          reps: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('update_set recusa', async () => {
      await expect(sets.update(owned.userB, owned.setId, { reps: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete_set recusa', async () => {
      await expect(sets.delete(owned.userB, owned.setId)).rejects.toThrow(NotFoundException);
    });

    it('delete_nutrient_target recusa', async () => {
      await expect(nutrientTargets.delete(owned.userB, 'sodium_mg')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('central de avisos do sino (#373)', () => {
    it('list_inbox: o dono vê o aviso, o vizinho não vê nada', async () => {
      // Caminho feliz primeiro: sem ele, uma central sempre vazia passaria.
      const dono = await inbox.list(owned.userA);
      expect(dono.items.map((i) => i.id)).toContain(owned.inboxNoticeId);
      await expect(inbox.list(owned.userB)).resolves.toEqual({ items: [], unread: 0 });
    });

    it('mark_inbox_read com o id do user-A no corpo não marca nada', async () => {
      await expect(inbox.markRead(owned.userB, [owned.inboxNoticeId])).resolves.toEqual({
        updated: 0,
      });
      // "Marcar todos" do vizinho também não alcança o aviso do user-A.
      await inbox.markRead(owned.userB);
      const aviso = await prisma.inboxNotice.findUnique({ where: { id: owned.inboxNoticeId } });
      expect(aviso?.readAt).toBeNull();
    });

    it('o ponto do sino no dashboard conta só os avisos de quem pede', async () => {
      const dashboard = (userId: string) =>
        new DashboardService(
          prisma,
          steps,
          weights,
          waters,
          { streak: async () => ({}) } as never,
          { list: async () => [] } as never,
          { getActive: async () => null } as never,
        ).today({ userId, timezone: TZ });
      expect((await dashboard(owned.userA)).inbox.unread).toBeGreaterThan(0);
      expect((await dashboard(owned.userB)).inbox.unread).toBe(0);
    });
  });

  describe('lembretes pessoais (#389)', () => {
    it('list_reminders: o dono vê o lembrete, o vizinho não vê nada', async () => {
      expect((await reminders.list(owned.userA)).map((r) => r.id)).toContain(owned.reminderId);
      await expect(reminders.list(owned.userB)).resolves.toEqual([]);
    });

    it('update_reminder e delete_reminder com o id do user-A recusam e não mexem', async () => {
      await expect(
        reminders.update(owned.userB, owned.reminderId, { enabled: false, times: ['03:00'] }),
      ).rejects.toThrow(NotFoundException);
      await expect(reminders.remove(owned.userB, owned.reminderId)).rejects.toThrow(
        NotFoundException,
      );
      const r = await prisma.reminder.findUnique({ where: { id: owned.reminderId } });
      expect(r).toMatchObject({ userId: owned.userA, enabled: true, times: [750] });
    });
  });

  describe('rascunho do onboarding (#371)', () => {
    it('o rascunho e a etapa de um não aparecem nem mudam pelo outro', async () => {
      await onboarding.saveProgress(
        owned.userA,
        { step: 'body', weightKg: 81.3, goalSource: 'team' },
        TZ,
      );
      const a = await onboarding.getProgress(owned.userA);
      expect(a).toMatchObject({ step: 'body', profile: { weightKg: 81.3 } });

      const b = await onboarding.getProgress(owned.userB);
      expect(b.step).not.toBe('body');
      expect(b.profile.weightKg).not.toBe(81.3);
      expect(b.draft.goalSource).toBeUndefined();

      // Salvar e terminar como user-B só mexe no user-B.
      await onboarding.saveProgress(owned.userB, { step: 'goals', weightKg: 55 }, TZ);
      await onboarding.finish(owned.userB);
      const depois = await prisma.user.findUniqueOrThrow({ where: { id: owned.userA } });
      expect(depois.onboardingStep).toBe('body');
      expect(depois.onboardingDraft).toMatchObject({ weightKg: 81.3, goalSource: 'team' });
    });

    it('o cartão "Primeiros passos" conta só as refeições de quem pede', async () => {
      await onboarding.finish(owned.userB);
      const passos = await onboarding.firstSteps(owned.userB, TZ);
      // O user-A tem refeição; o user-B não.
      expect(passos?.items.find((i) => i.key === 'meal')?.done).toBe(false);
    });
  });

  /**
   * Acesso profissional (ADR 014) — a única leitura entre contas do produto.
   *
   * O `NOT_FOUND` indistinguível deixou de ser universal quando esta porta
   * abriu, então cada recusa aqui é conferida contra a recusa que um estranho
   * recebe. O caminho feliz está junto de propósito: sem ele, as recusas
   * passariam de graça se a leitura estivesse quebrada por qualquer outro
   * motivo — mesma razão do `it('semeou os dados do user-A')`.
   */
  describe('acesso profissional entre contas (ADR 014)', () => {
    /**
     * Mensagem da recusa. Estoura se a leitura for **autorizada** — sem isso,
     * comparar duas recusas que não aconteceram passaria de graça.
     */
    const mensagemDaRecusa = async (quem: string, membershipId: string, scope: ShareScope) => {
      try {
        await access.assertReadable(quem, membershipId, scope, 'probe');
      } catch (err) {
        return (err as Error).message;
      }
      throw new Error('esperava recusa, mas a leitura foi autorizada');
    };

    /** Recusa que um estranho qualquer recebe, para comparar byte a byte. */
    const recusaDeEstranho = (scope: ShareScope) =>
      mensagemDaRecusa(owned.userB, owned.membershipA, scope);

    const tentar = (scope: ShareScope, membershipId = owned.membershipA) =>
      mensagemDaRecusa(owned.pro, membershipId, scope);

    afterEach(async () => {
      // Cada caso monta o vínculo de que precisa; sem isto, o estado vaza.
      // A trilha vai junto — o último caso conta as linhas que ele mesmo criou.
      await prisma.professionalAccessLog.deleteMany({ where: { subjectUserId: owned.userA } });
      await prisma.professionalLink.deleteMany({ where: { subjectUserId: owned.userA } });
    });

    it('profissional SEM vínculo recebe o mesmo NOT_FOUND de um estranho', async () => {
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).rejects.toThrow(NotFoundException);

      // Byte a byte: a mensagem não pode denunciar que o aluno existe.
      expect(await tentar(ShareScope.WORKOUT)).toBe(await recusaDeEstranho(ShareScope.WORKOUT));
    });

    it('estar no grupo como PROFESSIONAL não é acesso', async () => {
      // O `pro` é membro ativo com papel PROFESSIONAL e mesmo assim não lê nada:
      // papel governa administração, vínculo governa leitura.
      const membership = await prisma.groupMembership.findFirst({
        where: { groupId: owned.groupId, userId: owned.pro },
      });
      expect(membership?.role).toBe(GroupRole.PROFESSIONAL);
      expect(membership?.status).toBe(MembershipStatus.ACTIVE);

      for (const scope of Object.values(ShareScope)) {
        await expect(
          access.assertReadable(owned.pro, owned.membershipA, scope, 'probe'),
        ).rejects.toThrow(NotFoundException);
      }
    });

    it('membershipId de outro grupo recusa, mesmo com vínculo válido em mãos', async () => {
      // O caso do #204: o `pro` TEM um vínculo ativo (com o user-A, na academia
      // do user-B) e usa esse crachá para pedir uma membership de outro
      // contexto — em que ele por acaso é até dono. Se o `where` do vínculo não
      // amarrar titular e grupo à linha lida, a chamada devolve o userId errado.
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      expect(await tentar(ShareScope.WORKOUT, owned.membershipForaId)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );
    });

    it('vínculo REVOGADO recusa igual a nunca ter existido', async () => {
      const link = await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });
      await links.revokeAsSubject(owned.userA, link.id);

      // A linha continua no banco — revogar não apaga (é o que responde
      // "quem teve acesso a quê, quando").
      const persistido = await prisma.professionalLink.findUnique({ where: { id: link.id } });
      expect(persistido?.revokedAt).toBeTruthy();

      expect(await tentar(ShareScope.WORKOUT)).toBe(await recusaDeEstranho(ShareScope.WORKOUT));
    });

    it('escopo NÃO consentido é barrado mesmo com vínculo ativo', async () => {
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      // Consentir treino não abre o diário alimentar.
      expect(await tentar(ShareScope.NUTRITION)).toBe(await recusaDeEstranho(ShareScope.NUTRITION));
      expect(await tentar(ShareScope.BODY)).toBe(await recusaDeEstranho(ShareScope.BODY));
    });

    it('vínculo ativo no escopo consentido devolve o userId do titular', async () => {
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);
    });

    it('personal DEMITIDO para de ler na hora, com o vínculo ainda sem revogar', async () => {
      // A academia demite o personal: a `GroupMembership` dele vira REMOVED. O
      // `ProfessionalLink` continua intacto, porque a revogação em massa é da
      // #154 e nada a chama ainda. É o estado real de hoje — e sem a checagem
      // do lado do profissional o ex-funcionário lê o histórico de saúde da
      // aluna com um crachá que a academia já recolheu.
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      // Antes de demitir, ele lê — sem isto a recusa abaixo passaria de graça.
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);

      try {
        await prisma.groupMembership.update({
          where: { id: owned.membershipPro },
          data: { status: MembershipStatus.REMOVED, leftAt: new Date() },
        });

        // O vínculo NÃO foi tocado: é exatamente o que torna o caso perigoso.
        const vinculo = await prisma.professionalLink.findFirst({
          where: { subjectUserId: owned.userA, professionalId: owned.pro },
        });
        expect(vinculo?.revokedAt).toBeNull();

        expect(await tentar(ShareScope.WORKOUT)).toBe(await recusaDeEstranho(ShareScope.WORKOUT));
      } finally {
        // Recontratado: os outros casos contam com ele ativo.
        await prisma.groupMembership.update({
          where: { id: owned.membershipPro },
          data: { status: MembershipStatus.ACTIVE, leftAt: null },
        });
      }
    });

    it('DONO do grupo lê só o escopo que o aluno consentiu a ele (ADR 026)', async () => {
      // Sem vínculo, o dono é um estranho: gere grupo, membros e cobrança, e
      // isso não abre dado de saúde. Com o consentimento do aluno, ele passa a
      // ler — só aquele escopo, e a leitura entra na trilha do aluno.
      await expect(
        access.assertReadable(owned.userB, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).rejects.toThrow(NotFoundException);

      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.userB,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      await expect(
        access.assertReadable(owned.userB, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);
      await expect(
        access.assertReadable(owned.userB, owned.membershipA, ShareScope.NUTRITION, 'probe'),
      ).rejects.toThrow(NotFoundException);
    });

    it('o vínculo não abre nada nos services de domínio', async () => {
      // O que prova que a ADR 014 foi cumprida: com vínculo ativo de WORKOUT,
      // os services continuam ignorando que grupo existe. A leitura em nome do
      // aluno só acontece DEPOIS do `assertReadable`, com o userId dele.
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      await expect(plans.list(owned.pro)).resolves.toEqual([]);
      await expect(sessions.list(owned.pro, {})).resolves.toEqual([]);
      await expect(sessions.findById(owned.pro, owned.sessionId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(meals.findById(owned.pro, owned.mealId)).rejects.toThrow(NotFoundException);
      await expect(meals.list(owned.pro, {}, TZ)).resolves.toEqual([]);
    });

    it('a trilha de auditoria grava sucesso e negativa', async () => {
      // Contra Postgres real porque o que se quer provar é que a linha CHEGA ao
      // banco, com as duas pontas do vínculo resolvidas. Um mock do Prisma
      // provaria só que o service foi chamado.
      const link = await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      await access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'auditoria_ok');
      await access
        .assertReadable(owned.pro, owned.membershipA, ShareScope.NUTRITION, 'auditoria_negada')
        .catch(() => undefined);

      const trilha = await prisma.professionalAccessLog.findMany({
        where: { subjectUserId: owned.userA, professionalId: owned.pro },
        orderBy: { at: 'asc' },
      });

      expect(trilha).toEqual([
        expect.objectContaining({ action: 'auditoria_ok', denied: false, linkId: link.id }),
        expect.objectContaining({ action: 'auditoria_negada', denied: true, linkId: null }),
      ]);
    });
  });

  /**
   * Painel do profissional (#157) — a porta única exercitada pelo caminho que o
   * produto de fato usa.
   *
   * O bloco acima prova que `assertReadable` recusa. Este prova que o **painel**
   * recusa, e não é a mesma coisa: entre a porta e a resposta há um service que
   * poderia, por descuido, cachear o `subjectUserId`, ler um escopo tendo
   * conferido outro, ou simplesmente ignorar a porta num branch. Nenhum desses
   * defeitos aparece testando `assertReadable` isolado.
   *
   * O caminho feliz vem junto, e por isso mesmo: sem ele, as recusas passariam
   * de graça se a leitura estivesse quebrada por qualquer outro motivo.
   */
  describe('painel do profissional (#157)', () => {
    const studentView = new StudentViewService(
      prisma,
      access,
      plans,
      sessions,
      progress,
      nutritionSummary,
      goals,
      meals,
      nutritionPlans,
    );

    /** Mensagem da recusa. Estoura se a leitura for **autorizada**. */
    const mensagemDaRecusa = async (quem: string, membershipId: string, scope: ShareScope) => {
      try {
        await studentView.read(quem, membershipId, scope, 30);
      } catch (err) {
        return (err as Error).message;
      }
      throw new Error('esperava recusa, mas o painel devolveu dado');
    };

    /** A recusa que um estranho qualquer recebe, para comparar byte a byte. */
    const recusaDeEstranho = (scope: ShareScope) =>
      mensagemDaRecusa(owned.userB, owned.membershipA, scope);

    const vincular = (scopes: ShareScope[]) =>
      links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes,
      });

    afterEach(async () => {
      await prisma.professionalAccessLog.deleteMany({ where: { subjectUserId: owned.userA } });
      await prisma.professionalLink.deleteMany({ where: { subjectUserId: owned.userA } });
    });

    it('SEM vínculo o painel não devolve nada de aluno nenhum', async () => {
      // O critério de pronto da issue, na forma mais crua: o profissional está
      // no grupo, o aluno também, e mesmo assim não sai um byte.
      for (const scope of Object.values(ShareScope)) {
        await expect(studentView.read(owned.pro, owned.membershipA, scope, 30)).rejects.toThrow(
          NotFoundException,
        );
      }

      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );
    });

    it('escopo NÃO consentido é barrado mesmo com vínculo ativo', async () => {
      await vincular([ShareScope.WORKOUT]);

      // Consentir treino não abre o diário alimentar, nem o peso, nem as metas.
      for (const scope of [ShareScope.NUTRITION, ShareScope.BODY, ShareScope.GOALS]) {
        expect(await mensagemDaRecusa(owned.pro, owned.membershipA, scope)).toBe(
          await recusaDeEstranho(scope),
        );
      }
    });

    it('vínculo REVOGADO recusa igual a nunca ter existido', async () => {
      const link = await vincular([ShareScope.WORKOUT]);

      // Antes de revogar ele lê — sem isto a recusa abaixo passaria de graça
      // mesmo com o painel quebrado por outro motivo.
      const antes = await studentView.read(owned.pro, owned.membershipA, ShareScope.WORKOUT, 30);
      expect(antes.reading.scope).toBe(ShareScope.WORKOUT);

      await links.revokeAsSubject(owned.userA, link.id);

      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );
    });

    it('caminho feliz: devolve o dado do aluno, e é o dado dele mesmo', async () => {
      await vincular([ShareScope.WORKOUT]);

      const resultado = await studentView.read(
        owned.pro,
        owned.membershipA,
        ShareScope.WORKOUT,
        30,
      );

      // Não basta "não lançou": o payload tem de conter o plano semeado como
      // user-A. Um painel que devolvesse listas vazias passaria em toda recusa
      // deste arquivo e não serviria para nada.
      expect(resultado.reading.scope).toBe(ShareScope.WORKOUT);
      if (resultado.reading.scope !== ShareScope.WORKOUT) throw new Error('escopo errado');
      expect(resultado.reading.plans.map((p) => p.id)).toContain(owned.planId);
      expect(resultado.reading.sessions.map((s) => s.id)).toContain(owned.sessionId);
    });

    /**
     * A **forma** do payload, escopo a escopo, contra o Postgres de verdade.
     *
     * Existe porque os tipos de `packages/api-client/src/sharing.ts` são
     * escritos à mão: são declarações de resposta, não têm com o que conflitar,
     * e o `tsc` fica verde sobre um payload que a API nunca devolveu. Foi assim
     * que `history.days` (a janela, um número) virou array do lado do cliente,
     * `ponto.value` nasceu sem existir em lado nenhum e `finishedAt` ficou com
     * nome que o schema não tem — três campos errados, `typecheck` verde.
     *
     * Este caso prende a ponta da API; a outra ponta é
     * `apps/web/src/app/(pro)/students/[membershipId]/__tests__/page.test.tsx`,
     * cujas fixtures são estas mesmas formas anotadas com o tipo do cliente.
     * Mudar a resposta de um service de domínio derruba este caso, e é aqui que
     * se lê o que o cliente precisa acompanhar.
     *
     * Conferir a **lista** de chaves, e não `toHaveProperty`: campo que
     * desaparece e campo que aparece são os dois defeitos, e só o conjunto pega
     * os dois.
     */
    it('a forma de cada escopo é a que o api-client declara', async () => {
      await vincular(Object.values(ShareScope));
      const chaves = (v: object) => Object.keys(v).sort();

      const workout = await studentView.read(owned.pro, owned.membershipA, ShareScope.WORKOUT, 30);
      if (workout.reading.scope !== ShareScope.WORKOUT) throw new Error('escopo errado');
      expect(chaves(workout.reading)).toEqual(['plans', 'scope', 'sessions', 'volume']);
      expect(chaves(workout.reading.volume)).toEqual(['averageWeeklyVolumeKg', 'weeks']);
      // A sessão semeada existe (o caso acima afirma o id), então a linha é
      // conferível de verdade e não passa por vacuidade de array vazio.
      const sessao = workout.reading.sessions.find((s) => s.id === owned.sessionId);
      expect(sessao).toBeDefined();
      expect(sessao).toHaveProperty('completedAt');
      expect(sessao).not.toHaveProperty('finishedAt');
      // #381: o tipo da sessão e a nota livre só chegam à equipe por esta porta
      // (Treino liberado, com registro de acesso).
      expect(sessao).toHaveProperty('kind', 'free');
      expect(sessao).toHaveProperty('notes');
      expect(sessao).toHaveProperty('feeling');

      const nutrition = await studentView.read(
        owned.pro,
        owned.membershipA,
        ShareScope.NUTRITION,
        30,
      );
      if (nutrition.reading.scope !== ShareScope.NUTRITION) throw new Error('escopo errado');
      expect(chaves(nutrition.reading.history)).toEqual(['averages', 'days', 'series']);
      // O ponto do defeito: `days` é a janela pedida, e quem itera é `series`.
      expect(nutrition.reading.history.days).toBe(30);
      expect(nutrition.reading.history.series).toHaveLength(30);
      expect(chaves(nutrition.reading.history.series[0])).toEqual([
        'carbsG',
        'date',
        'fatG',
        'kcal',
        'meals',
        'proteinG',
      ]);

      const habits = await studentView.read(owned.pro, owned.membershipA, ShareScope.HABITS, 30);
      if (habits.reading.scope !== ShareScope.HABITS) throw new Error('escopo errado');
      // Passos e água são séries distintas: o valor diário tem nome próprio em
      // cada uma, e não existe `value` em nenhuma das duas.
      expect(chaves(habits.reading.steps.points[0])).toEqual(['date', 'goalReached', 'steps']);
      expect(chaves(habits.reading.water.points[0])).toEqual(['date', 'goalReached', 'totalMl']);

      const body = await studentView.read(owned.pro, owned.membershipA, ShareScope.BODY, 30);
      if (body.reading.scope !== ShareScope.BODY) throw new Error('escopo errado');
      expect(chaves(body.reading.weight)).toEqual([
        'currentWeightKg',
        'points',
        'totalDeltaKg',
        'weeklyAverages',
      ]);
    });

    it('o painel não devolve o userId do aluno em nível nenhum do payload', async () => {
      await vincular([ShareScope.WORKOUT]);

      const resultado = await studentView.read(
        owned.pro,
        owned.membershipA,
        ShareScope.WORKOUT,
        30,
      );

      // Busca no JSON serializado, e não campo a campo: o `userId` viaja dentro
      // de `WorkoutPlan`, de `WorkoutSession` e do `Exercise` custom aninhado no
      // plano, e conferir só o topo deixaria os três passarem. Procurar o valor
      // (e não a chave) é o que também pega uma chave renomeada.
      expect(JSON.stringify(resultado)).not.toContain(owned.userA);

      // Sanidade do próprio caso: o id procurado existe e apareceria se saísse.
      expect(owned.userA).not.toBe('');
      expect(JSON.stringify(await plans.list(owned.userA))).toContain(owned.userA);
    });

    it('o dia é cortado no fuso do ALUNO, não no de quem lê', async () => {
      // O personal muda de fuso; a aluna não. Se o painel usasse o fuso de quem
      // lê, a janela do histórico começaria noutro dia — e o bug apareceria como
      // "sumiu um treino da segunda", que ninguém liga a fuso.
      await prisma.user.update({
        where: { id: owned.pro },
        data: { timezone: 'Pacific/Kiritimati' },
      });
      try {
        await vincular([ShareScope.NUTRITION]);

        const resultado = await studentView.read(
          owned.pro,
          owned.membershipA,
          ShareScope.NUTRITION,
          30,
        );

        expect(resultado.timezone).toBe(TZ);
      } finally {
        await prisma.user.update({ where: { id: owned.pro }, data: { timezone: TZ } });
      }
    });

    it('grava uma linha de auditoria por escopo lido, e não uma por sessão de painel', async () => {
      // A armadilha que o plano da issue chama de "assertReadable chamado uma
      // vez e o userId reaproveitado": duas leituras de categorias diferentes
      // com uma conferência só. A trilha é o que denuncia — duas leituras têm
      // de virar duas linhas, cada uma com o seu escopo.
      await vincular([ShareScope.WORKOUT, ShareScope.BODY]);

      await studentView.read(owned.pro, owned.membershipA, ShareScope.WORKOUT, 30);
      await studentView.read(owned.pro, owned.membershipA, ShareScope.BODY, 30);
      await studentView
        .read(owned.pro, owned.membershipA, ShareScope.NUTRITION, 30)
        .catch(() => undefined);

      const trilha = await prisma.professionalAccessLog.findMany({
        where: { subjectUserId: owned.userA, professionalId: owned.pro },
        orderBy: { at: 'asc' },
        select: { action: true, scope: true, denied: true },
      });

      expect(trilha).toEqual([
        { action: 'get_student_progress', scope: ShareScope.WORKOUT, denied: false },
        { action: 'get_student_progress', scope: ShareScope.BODY, denied: false },
        { action: 'get_student_progress', scope: ShareScope.NUTRITION, denied: true },
      ]);
    });

    it('membershipId de OUTRO grupo não resolve, nem com vínculo válido em mãos', async () => {
      // O #204 pela porta do painel: o `pro` tem vínculo legítimo com o user-A e
      // usa esse crachá para pedir uma associação de um grupo em que ele é dono,
      // mas não profissional.
      await vincular([ShareScope.WORKOUT]);

      expect(await mensagemDaRecusa(owned.pro, owned.membershipForaId, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );
    });

    it('a lista de alunos é só de quem eu atendo, e mostra o consentimento de cada um', async () => {
      await vincular([ShareScope.WORKOUT, ShareScope.BODY]);

      const alunos = await studentView.listStudents(owned.pro);

      // O user-A e o colega são MEMBER da academia; dono, criador e o outro
      // profissional não são alunos e não podem aparecer.
      const porMembership = new Map(alunos.map((a) => [a.membershipId, a]));
      expect(porMembership.get(owned.membershipA)?.scopesGrantedToMe).toEqual([
        ShareScope.WORKOUT,
        ShareScope.BODY,
      ]);
      const daAcademia = alunos.filter((a) => a.groupId === owned.groupId);
      expect(daAcademia.map((a) => a.name).sort()).toEqual(['Colega', 'User A']);

      // A lista não é dado de saúde, mas também não pode virar diretório: só
      // entram as comunidades em que o `pro` é equipe — a academia e o grupo
      // de que ele é dono (ADR 026) —, e nunca a equipe como "aluno".
      expect(
        alunos.every((a) => a.groupId === owned.groupId || a.groupId === owned.grupoDoProId),
      ).toBe(true);
      expect(alunos.filter((a) => a.groupId === owned.grupoDoProId).map((a) => a.name)).toEqual([
        'User B',
      ]);
    });

    it('vínculo revogado some do consentimento da lista, e não só da leitura', async () => {
      // Os dois filtros de `listStudents` estavam certos no código e nenhum
      // teste os distinguia: apagar `revokedAt: null` da consulta passava com a
      // suíte inteira verde, porque todo caso concedia um vínculo fresco.
      //
      // O sintoma não é vazamento de dado — a leitura continua barrada pela
      // porta. É pior de explicar: a aluna revoga em Privacidade, o chip
      // "Treino" continua na tela do personal, e cada clique vira uma linha
      // `denied: true` na trilha que ela lê. Do lado dela, isso é sondagem.
      const link = await vincular([ShareScope.WORKOUT]);
      const antes = await studentView.listStudents(owned.pro);
      expect(antes.find((a) => a.membershipId === owned.membershipA)?.scopesGrantedToMe).toEqual([
        ShareScope.WORKOUT,
      ]);

      await links.revokeAsSubject(owned.userA, link.id);

      const depois = await studentView.listStudents(owned.pro);
      // Ela continua aluna — some o consentimento, não a pessoa.
      const aluna = depois.find((a) => a.membershipId === owned.membershipA);
      expect(aluna).toBeDefined();
      expect(aluna?.scopesGrantedToMe).toEqual([]);
    });

    it('aluna que SAIU da academia não fica na lista do profissional', async () => {
      // A simetria que o comentário do código promete e que nenhum teste
      // cobrava: `status: ACTIVE` vale para a consulta dos meus grupos (o
      // profissional demitido) **e** para a dos alunos (a aluna que saiu).
      // Tirar o segundo passava com 1065/1065 verdes.
      await vincular([ShareScope.WORKOUT]);
      expect((await studentView.listStudents(owned.pro)).map((a) => a.membershipId)).toContain(
        owned.membershipA,
      );

      try {
        await prisma.groupMembership.update({
          where: { id: owned.membershipA },
          data: { status: MembershipStatus.LEFT, leftAt: new Date() },
        });

        const depois = (await studentView.listStudents(owned.pro)).filter(
          (a) => a.groupId === owned.groupId,
        );
        expect(depois.map((a) => a.membershipId)).not.toContain(owned.membershipA);
        // O colega continua — o filtro é por associação, não um apagão da lista.
        expect(depois.map((a) => a.name)).toEqual(['Colega']);
      } finally {
        await prisma.groupMembership.update({
          where: { id: owned.membershipA },
          data: { status: MembershipStatus.ACTIVE, leftAt: null },
        });
      }
    });

    it('MEMBER não tem lista de alunos; dono e criador têm, sem consentimento a mais', async () => {
      // ADR 026: a equipe toda (dono, profissional, criador) recebe o que cada
      // membro escolhe compartilhar, então todos têm a lista. A lista é nome e
      // escopos consentidos — sem vínculo, vazia de escopos, e a leitura
      // continua fechada. O aluno nunca vê outros alunos.
      await expect(studentView.listStudents(owned.colega)).resolves.toEqual([]);
      for (const equipe of [owned.userB, owned.creator]) {
        const lista = await studentView.listStudents(equipe);
        expect(lista.map((a) => a.name).sort()).toEqual(['Colega', 'User A']);
        expect(lista.every((a) => a.scopesGrantedToMe.length === 0)).toBe(true);
      }
    });

    it('profissional DEMITIDO perde a lista e a leitura no mesmo instante', async () => {
      await vincular([ShareScope.WORKOUT]);
      expect(await studentView.listStudents(owned.pro)).not.toEqual([]);

      try {
        await prisma.groupMembership.update({
          where: { id: owned.membershipPro },
          data: { status: MembershipStatus.REMOVED, leftAt: new Date() },
        });

        // O vínculo continua intacto — é o que torna o caso perigoso.
        const vinculo = await prisma.professionalLink.findFirst({
          where: { subjectUserId: owned.userA, professionalId: owned.pro },
        });
        expect(vinculo?.revokedAt).toBeNull();

        // Fica só o grupo de que ele é dono; da academia, nada.
        expect(
          (await studentView.listStudents(owned.pro)).filter((a) => a.groupId === owned.groupId),
        ).toEqual([]);
        expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
          await recusaDeEstranho(ShareScope.WORKOUT),
        );
      } finally {
        await prisma.groupMembership.update({
          where: { id: owned.membershipPro },
          data: { status: MembershipStatus.ACTIVE, leftAt: null },
        });
      }
    });

    it('o painel não escreve nada na conta do aluno', async () => {
      // A ADR 014 reescreveu a issue: o profissional NUNCA opera na conta do
      // aluno. Aqui isso vira contrato executável — nenhum método público de
      // `StudentViewService` muda estado, e o que existe do lado do aluno antes
      // é idêntico ao que existe depois de um painel inteiro ser aberto.
      await vincular([ShareScope.WORKOUT, ShareScope.BODY, ShareScope.GOALS]);

      const antes = await plans.list(owned.userA);
      for (const scope of [ShareScope.WORKOUT, ShareScope.BODY, ShareScope.GOALS]) {
        await studentView.read(owned.pro, owned.membershipA, scope, 30);
      }
      const depois = await plans.list(owned.userA);

      expect(depois).toEqual(antes);

      // E o profissional continua sem plano nenhum na conta dele: ler o do aluno
      // não materializa cópia — isso só acontece no aceite de uma oferta.
      await expect(plans.list(owned.pro)).resolves.toEqual([]);
    });
  });

  /**
   * Plano pronto do criador virando plano do membro (#162), contra Postgres.
   *
   * É o critério de pronto da issue na forma literal: o criador publica, dois
   * membros adotam, e a edição de um não toca no original nem na cópia do
   * outro. O spec de unidade ao lado prova que o `where` foi montado certo;
   * este prova que o banco de fato guardou duas cópias independentes — e é a
   * única forma de pegar o `@@unique([planId, exerciseId])` e o
   * `@@unique([name, createdByUserId])` mordendo na adoção.
   *
   * Os dois membros são usuários novos, sem grupo: a adoção não depende de
   * associação **nesta fatia** porque a tabela de publicação ainda não existe
   * (ver a proposta na PR), e pendurá-los na academia do user-A mudaria a lista
   * de alunos que o bloco do #157 confere acima.
   */
  describe('plano pronto vira cópia do membro (#162)', () => {
    const materializer = new PlanMaterializerService(prisma, exercises);

    const pronto = {
      /** O plano na conta do CRIADOR. Nada aqui vira dado de membro sozinho. */
      planoDoCriador: '',
      /** Exercício custom do criador — o que precisa virar cópia de quem adota. */
      exercicioDoCriador: 0,
      membro1: '',
      membro2: '',
      snapshot: {} as unknown,
    };

    beforeAll(async () => {
      const stamp = `tpl-${Date.now()}`;

      const [membro1, membro2] = await Promise.all([
        prisma.user.create({
          data: {
            logtoSub: `${stamp}-m1`,
            email: `${stamp}-m1@test.local`,
            name: 'Membro 1',
            timezone: TZ,
          },
        }),
        prisma.user.create({
          data: {
            logtoSub: `${stamp}-m2`,
            email: `${stamp}-m2@test.local`,
            name: 'Membro 2',
            timezone: TZ,
          },
        }),
      ]);
      pronto.membro1 = membro1.id;
      pronto.membro2 = membro2.id;

      // O criador monta o plano na conta DELE, com um exercício do catálogo
      // público e um custom que só ele tem — a mistura é o ponto: um entra por
      // referência, o outro tem de virar cópia.
      const custom = await exercises.createCustom(owned.creator, {
        name: `${stamp}-remada-do-criador`,
        muscleGroup: 'costas',
      });
      await exercises.updateCustom(owned.creator, custom.id, {
        equipment: 'polia',
        instructions: ['Puxe até o abdômen', 'Não jogue o tronco'],
        primaryMuscles: ['lats'],
      });
      pronto.exercicioDoCriador = custom.id;

      const plano = await plans.create(owned.creator, { name: 'Full body do criador' });
      pronto.planoDoCriador = plano.id;
      await plans.addExercise(owned.creator, plano.id, {
        exerciseId: owned.sharedExerciseId,
        order: 1,
        targetSets: 4,
        targetReps: '8-12',
      });
      await plans.addExercise(owned.creator, plano.id, {
        exerciseId: custom.id,
        order: 2,
        targetSets: 3,
        targetReps: '12',
      });

      // Publicar congela o conteúdo. O que os membros adotam é ISTO, e não uma
      // leitura do plano vivo do criador no momento do clique.
      pronto.snapshot = buildPlanSnapshot(await plans.findById(owned.creator, plano.id));
    }, 60_000);

    afterAll(async () => {
      await prisma.user
        .deleteMany({ where: { id: { in: [pronto.membro1, pronto.membro2].filter(Boolean) } } })
        .catch(() => undefined);
    });

    const original = () => plans.findById(owned.creator, pronto.planoDoCriador);

    it('semeou o plano pronto do criador', async () => {
      // Sem isto, "a cópia tem 2 exercícios" passaria sobre um original vazio.
      const plano = await original();
      expect(plano.exercises.map((e) => e.exerciseId)).toEqual([
        owned.sharedExerciseId,
        pronto.exercicioDoCriador,
      ]);
    });

    it('o membro adota e o plano passa a ser dele, com o conteúdo prescrito pelo criador', async () => {
      const copia = await materializer.materialize(pronto.membro1, pronto.snapshot);

      const lido = await plans.findById(pronto.membro1, copia.id);
      expect(lido.userId).toBe(pronto.membro1);
      expect(lido.name).toBe('Full body do criador');
      expect(lido.exercises.map((e) => [e.order, e.targetSets, e.targetReps])).toEqual([
        [1, 4, '8-12'],
        [2, 3, '12'],
      ]);
    });

    it('o exercício do catálogo entra por referência e o custom do criador vira exercício DO MEMBRO', async () => {
      const copia = await materializer.materialize(pronto.membro2, pronto.snapshot);
      const lido = await plans.findById(pronto.membro2, copia.id);

      // Catálogo público é o mesmo id para todo mundo — copiá-lo encheria o
      // catálogo de lixo.
      expect(lido.exercises[0].exerciseId).toBe(owned.sharedExerciseId);

      // O custom é outra linha, do membro, com o conteúdo que o criador escreveu.
      const doMembro = lido.exercises[1].exercise;
      expect(doMembro.id).not.toBe(pronto.exercicioDoCriador);
      expect(doMembro.createdByUserId).toBe(pronto.membro2);
      expect(doMembro.instructions).toEqual(['Puxe até o abdômen', 'Não jogue o tronco']);
      expect(doMembro.primaryMuscles).toEqual(['lats']);

      // E o criador não aparece em canto nenhum do que o membro passa a ter.
      expect(JSON.stringify(lido)).not.toContain(owned.creator);

      // O exercício do criador continua sendo dele, e invisível para o membro —
      // adotar o plano não é ganhar leitura da conta de quem publicou.
      await expect(exercises.get(pronto.membro2, pronto.exercicioDoCriador)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('a edição do membro não afeta o original nem a cópia do outro membro', async () => {
      // O critério de pronto da issue, literal.
      const copia1 = await materializer.materialize(pronto.membro1, pronto.snapshot);
      const copia2 = await materializer.materialize(pronto.membro2, pronto.snapshot);

      await plans.update(pronto.membro1, copia1.id, { name: 'Meu treino, do meu jeito' });
      const primeiroExercicio = (await plans.findById(pronto.membro1, copia1.id)).exercises[0];
      await plans.removeExercise(pronto.membro1, copia1.id, primeiroExercicio.id);

      const depoisDoMembro1 = await plans.findById(pronto.membro1, copia1.id);
      expect([depoisDoMembro1.name, depoisDoMembro1.exercises.length]).toEqual([
        'Meu treino, do meu jeito',
        1,
      ]);

      const doCriador = await original();
      expect([doCriador.name, doCriador.exercises.length]).toEqual(['Full body do criador', 2]);

      const doMembro2 = await plans.findById(pronto.membro2, copia2.id);
      expect([doMembro2.name, doMembro2.exercises.length]).toEqual(['Full body do criador', 2]);
    });

    it('quem publicou não lê a cópia de quem adotou', async () => {
      const copia = await materializer.materialize(pronto.membro1, pronto.snapshot);

      // Ter publicado o conteúdo não dá acesso ao que virou dado do membro —
      // mesmo NOT_FOUND de plano inexistente (#92).
      await expect(plans.findById(owned.creator, copia.id)).rejects.toThrow(NotFoundException);
      await expect(plans.findById(pronto.membro2, copia.id)).rejects.toThrow(NotFoundException);
    });

    it('o criador editar o plano de origem depois NÃO muda quem já adotou', async () => {
      const copia = await materializer.materialize(pronto.membro1, pronto.snapshot);

      try {
        await plans.update(owned.creator, pronto.planoDoCriador, { name: 'Versão 2 do criador' });

        // Consequência aceita da ADR 014 virando teste: o dado é do membro.
        const lido = await plans.findById(pronto.membro1, copia.id);
        expect(lido.name).toBe('Full body do criador');
      } finally {
        await plans.update(owned.creator, pronto.planoDoCriador, { name: 'Full body do criador' });
      }
    });

    it('snapshot forjado com o exercício custom de outra pessoa é recusado, e nada é criado', async () => {
      // O `catalogExerciseId` vem de um `Json` que ninguém digitou na tela: um
      // snapshot escrito à mão pode apontar a linha de qualquer um, e o id de
      // `Exercise` é inteiro sequencial.
      const forjado = {
        version: PLAN_SNAPSHOT_VERSION,
        name: 'Plano forjado',
        exercises: [
          {
            source: 'catalog',
            catalogExerciseId: pronto.exercicioDoCriador,
            order: 1,
            targetSets: 3,
            targetReps: '10',
          },
        ],
      };

      const antes = await plans.list(pronto.membro2);
      await expect(materializer.materialize(pronto.membro2, forjado)).rejects.toThrow(
        BadRequestException,
      );
      await expect(plans.list(pronto.membro2)).resolves.toEqual(antes);
    });

    it('"Nada foi criado" é literal: snapshot recusado não deixa exercício na biblioteca de quem adota', async () => {
      // Conferir só `plans.list` deixava passar a escrita de verdade: o item
      // `custom` vem ANTES do id forjado, e a cópia dele já estava commitada
      // quando a recusa acontecia — quem forja escolhia o nome que entrava na
      // biblioteca da vítima, e ainda lia "Nada foi criado".
      const orfao = `tpl-${Date.now()}-orfao`;
      const forjado = {
        version: PLAN_SNAPSHOT_VERSION,
        name: 'Plano forjado',
        exercises: [
          {
            source: 'custom',
            exercise: { name: orfao, muscleGroup: 'peito' },
            order: 1,
            targetSets: 3,
            targetReps: '10',
          },
          {
            source: 'catalog',
            catalogExerciseId: pronto.exercicioDoCriador,
            order: 2,
            targetSets: 3,
            targetReps: '10',
          },
        ],
      };

      const antesDosPlanos = await plans.list(pronto.membro2);
      const antesDosExercicios = await prisma.exercise.count({
        where: { createdByUserId: pronto.membro2 },
      });

      await expect(materializer.materialize(pronto.membro2, forjado)).rejects.toThrow(
        /Nada foi criado/,
      );

      await expect(plans.list(pronto.membro2)).resolves.toEqual(antesDosPlanos);
      await expect(
        prisma.exercise.count({ where: { createdByUserId: pronto.membro2 } }),
      ).resolves.toBe(antesDosExercicios);
      await expect(prisma.exercise.findFirst({ where: { name: orfao } })).resolves.toBeNull();
    });

    it('plano reordenado pelo Claude continua publicável, e a cópia preserva a prescrição', async () => {
      // Nada aqui é forjado: são as portas documentadas do produto, escrevendo
      // pelos services de verdade. `reorder_plan_exercises` descreve
      // "0 = primeiro" e manda `"order":0` no exemplo; `AddPlanExerciseDto`
      // aceita `targetReps` vazia (sem mínimo) e `targetSets` sem teto.
      //
      // Um v1 congelado que reprovasse isso deixaria o plano impublicável para
      // sempre: depois da primeira `PlanTemplate.snapshot` gravada, afrouxar o
      // formato é bump de versão e migração de coluna `Json`.
      const plano = await plans.create(owned.creator, { name: 'Reordenado pelo Claude' });
      try {
        const item = await plans.addExercise(owned.creator, plano.id, {
          exerciseId: owned.sharedExerciseId,
          order: 1,
          targetSets: 60,
          targetReps: '',
        });
        await plans.reorderExercises(owned.creator, plano.id, {
          exercises: [{ id: item.id, order: 0 }],
        });

        // O que o Postgres devolve depois das rotas é o que precisa congelar.
        const gravado = await plans.findById(owned.creator, plano.id);
        expect(gravado.exercises.map((e) => [e.order, e.targetSets, e.targetReps])).toEqual([
          [0, 60, ''],
        ]);

        const snapshot = buildPlanSnapshot(gravado);
        const copia = await materializer.materialize(pronto.membro2, snapshot);

        // E atravessa inteiro: adotar não pode inventar `order: 1` no meio do
        // caminho, senão a cópia sai numa ordem que o autor não prescreveu.
        const lido = await plans.findById(pronto.membro2, copia.id);
        expect(lido.exercises.map((e) => [e.order, e.targetSets, e.targetReps])).toEqual([
          [0, 60, ''],
        ]);
      } finally {
        await plans.delete(owned.creator, plano.id);
      }
    });

    it('materializar duas vezes reaproveita o exercício custom em vez de estourar o unique', async () => {
      // `@@unique([name, createdByUserId])`: a segunda adoção não pode criar um
      // segundo "remada do criador" na conta do membro, e também não pode
      // falhar. (Não criar um segundo PLANO depende da coluna de proveniência,
      // que esta fatia não abre — está declarado na PR.)
      const copia = await materializer.materialize(pronto.membro1, pronto.snapshot);
      const lido = await plans.findById(pronto.membro1, copia.id);

      const custons = await prisma.exercise.findMany({
        where: { createdByUserId: pronto.membro1 },
      });
      expect(custons).toHaveLength(1);
      expect(lido.exercises[1].exerciseId).toBe(custons[0].id);
    });
  });

  /**
   * Ciclo de vida do grupo e revogação em massa (#154).
   *
   * O que fecha o critério de pronto da issue: sair do grupo **de fato** para de
   * liberar leitura. A revogação em massa é a primeira linha de defesa e a
   * checagem dos dois lados dentro do `assertReadable` é a segunda — o primeiro
   * caso abaixo exige as duas separadamente, porque uma escondendo a falha da
   * outra é exatamente como esta garantia apodreceria em silêncio.
   */
  describe('gestão de grupo e revogação em massa (#154)', () => {
    /** Mensagem da recusa. Estoura se a leitura for autorizada. */
    const mensagemDaRecusa = async (quem: string, membershipId: string, scope: ShareScope) => {
      try {
        await access.assertReadable(quem, membershipId, scope, 'probe');
      } catch (err) {
        return (err as Error).message;
      }
      throw new Error('esperava recusa, mas a leitura foi autorizada');
    };

    /** Recusa que um estranho qualquer recebe, para comparar byte a byte. */
    const recusaDeEstranho = () =>
      mensagemDaRecusa(owned.userB, owned.membershipA, ShareScope.WORKOUT);

    afterEach(async () => {
      // Cada caso monta o que precisa e mexe em status de membership; sem isto,
      // o estado vaza para os vizinhos.
      await prisma.professionalAccessLog.deleteMany({ where: { subjectUserId: owned.userA } });
      await prisma.professionalLink.deleteMany({ where: { subjectUserId: owned.userA } });
      await prisma.groupMembership.updateMany({
        where: { groupId: owned.groupId, userId: { in: [owned.userA, owned.pro, owned.pro2] } },
        data: { status: MembershipStatus.ACTIVE, leftAt: null },
      });
    });

    it('SAIR do grupo revoga todos os vínculos e a leitura para na hora', async () => {
      for (const professionalId of [owned.pro, owned.pro2]) {
        await links.grant({
          subjectUserId: owned.userA,
          professionalId,
          groupId: owned.groupId,
          scopes: [ShareScope.WORKOUT],
        });
      }

      // Os DOIS leem antes. Sem isto, as recusas abaixo passariam de graça.
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);
      await expect(
        access.assertReadable(owned.pro2, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);

      const saida = await memberships.leave(owned.userA, owned.groupId);

      // Dois vínculos, dois revogados: um `updateMany` que filtrasse por
      // profissional específico revogaria um só e deixaria o outro lendo.
      expect([saida.status, saida.revokedLinks]).toEqual([MembershipStatus.LEFT, 2]);

      const vinculos = await prisma.professionalLink.findMany({
        where: { subjectUserId: owned.userA, groupId: owned.groupId },
        orderBy: { professionalId: 'asc' },
      });
      // Revogar NÃO apaga: são estas linhas que respondem "quem teve acesso a
      // quê, quando".
      expect(vinculos).toHaveLength(2);
      expect(vinculos.map((v) => [v.revokedAt !== null, v.revokedReason])).toEqual([
        [true, 'left_group'],
        [true, 'left_group'],
      ]);

      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(),
      );
      expect(await mensagemDaRecusa(owned.pro2, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(),
      );

      // Agora a parte que separa as duas linhas de defesa: a membership volta a
      // ACTIVE na marra, satisfazendo a checagem do `assertReadable`. Se a
      // recusa dependesse só do status, a leitura voltaria aqui — e a revogação
      // em massa seria enfeite. Quem barra a partir deste ponto é o `revokedAt`.
      await prisma.groupMembership.update({
        where: { id: owned.membershipA },
        data: { status: MembershipStatus.ACTIVE, leftAt: null },
      });
      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(),
      );
      expect(await mensagemDaRecusa(owned.pro2, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(),
      );
    });

    it('REMOVER pelo dono tem o mesmo efeito, com o motivo trocado', async () => {
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);

      const remocao = await memberships.removeMember(owned.userB, owned.groupId, owned.membershipA);

      expect([remocao.status, remocao.revokedLinks]).toEqual([MembershipStatus.REMOVED, 1]);
      const vinculo = await prisma.professionalLink.findFirst({
        where: { subjectUserId: owned.userA, professionalId: owned.pro },
      });
      // "Saiu" e "foi removido" precisam ser distinguíveis na trilha.
      expect([vinculo?.revokedAt !== null, vinculo?.revokedReason]).toEqual([
        true,
        'membership_removed',
      ]);
      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(),
      );
    });

    it('o PROFISSIONAL demitido é revogado pela outra ponta do vínculo', async () => {
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      // O titular do dado continua no grupo; quem saiu foi quem lia.
      const remocao = await memberships.removeMember(
        owned.userB,
        owned.groupId,
        owned.membershipPro,
      );

      expect(remocao.revokedLinks).toBe(1);
      const vinculo = await prisma.professionalLink.findFirst({
        where: { subjectUserId: owned.userA, professionalId: owned.pro },
      });
      expect(vinculo?.revokedReason).toBe('membership_removed');
      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(),
      );
    });

    it('entrar no grupo, em qualquer papel, não cria vínculo nem abre leitura', async () => {
      const grupo = await groups.create(owned.userB, {
        visibility: 'PUBLIC',
        type: GroupType.SPONSORED,
        name: 'Academia Nova',
      });

      const pedidoAluno = await memberships.requestJoin(owned.userA, grupo.slug);
      const pedidoPro = await memberships.requestJoin(owned.pro, grupo.slug);
      // Quem pede entrada é sempre MEMBER e sempre aguardando: PROFESSIONAL é
      // papel que pode receber consentimento, e não se autoatribui.
      expect([pedidoAluno.status, pedidoAluno.role]).toEqual([
        MembershipStatus.INVITED,
        GroupRole.MEMBER,
      ]);

      const aluno = await memberships.approve(owned.userB, grupo.id, pedidoAluno.membershipId);
      await memberships.approve(
        owned.userB,
        grupo.id,
        pedidoPro.membershipId,
        GroupRole.PROFESSIONAL,
      );
      expect(aluno.status).toBe(MembershipStatus.ACTIVE);

      // Nenhuma linha de vínculo nasceu do aceite — nem com escopo vazio.
      expect(await prisma.professionalLink.count({ where: { groupId: grupo.id } })).toBe(0);

      // E nenhuma leitura abriu, em nenhum escopo.
      for (const scope of Object.values(ShareScope)) {
        await expect(
          access.assertReadable(owned.pro, aluno.membershipId, scope, 'probe'),
        ).rejects.toThrow(NotFoundException);
      }
      await expect(plans.list(owned.pro)).resolves.toEqual([]);
    });

    it('quem sai para de ver o grupo por id, e não só na listagem', async () => {
      await expect(groups.findByIdForMember(owned.userA, owned.groupId)).resolves.toMatchObject({
        id: owned.groupId,
      });

      await memberships.leave(owned.userA, owned.groupId);

      // `listMine` já escondia o grupo de quem saiu; a busca por id barrava só
      // `REMOVED` e continuava entregando nome, slug e papel a quem deu baixa.
      expect(await groups.listMine(owned.userA)).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ id: owned.groupId })]),
      );

      const depoisDeSair = await groups
        .findByIdForMember(owned.userA, owned.groupId)
        .catch((err: Error) => err.message);
      const inexistente = await groups
        .findByIdForMember(owned.userA, '11111111-2222-4333-8444-666666666666')
        .catch((err: Error) => err.message);

      expect(depoisDeSair).toBe(inexistente);
    });

    it('ex-membro some da listagem de membros, para o dono e para o profissional', async () => {
      // Antes: o nome está lá para os dois. Sem esta metade, as asserções de
      // ausência abaixo passariam de graça.
      expect(
        (await memberships.listMembers(owned.userB, owned.groupId)).map((m) => m.name),
      ).toEqual(expect.arrayContaining(['User A']));
      expect((await memberships.listMembers(owned.pro, owned.groupId)).map((m) => m.name)).toEqual(
        expect.arrayContaining(['User A']),
      );

      await memberships.removeMember(owned.userB, owned.groupId, owned.membershipA);

      // Associação encerrada some da composição do grupo. O caso do
      // PROFESSIONAL é o que mais importa: ali o nome vem acompanhado dos
      // escopos, e ex-aluno listado é dado de pessoa que já não está lá.
      for (const quem of [owned.userB, owned.pro]) {
        const nomes = (await memberships.listMembers(quem, owned.groupId)).map((m) => m.name);
        expect(nomes).not.toContain('User A');
        // O grupo não ficou vazio por outro motivo: os demais continuam.
        expect(nomes).toContain('Pro');
      }
    });

    it('membro comum não remove ninguém, e o alvo continua ativo', async () => {
      await expect(
        memberships.removeMember(owned.userA, owned.groupId, owned.membershipPro),
      ).rejects.toThrow(ForbiddenException);

      const alvo = await prisma.groupMembership.findUnique({ where: { id: owned.membershipPro } });
      expect(alvo?.status).toBe(MembershipStatus.ACTIVE);
    });

    it('grupo alheio responde NOT_FOUND idêntico a grupo inexistente', async () => {
      const doPro = await groups
        .findByIdForMember(owned.userA, owned.grupoDoProId)
        .catch((err: Error) => err.message);
      const inexistente = await groups
        .findByIdForMember(owned.userA, '11111111-2222-4333-8444-555555555555')
        .catch((err: Error) => err.message);

      expect(doPro).toBe(inexistente);

      // Lista vazia confirmaria que o grupo existe: a recusa tem de ser a mesma.
      await expect(memberships.listMembers(owned.userA, owned.grupoDoProId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('o dono não sai do próprio grupo e continua ativo', async () => {
      await expect(memberships.leave(owned.userB, owned.groupId)).rejects.toThrow(
        ConflictException,
      );

      const dono = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: owned.groupId, userId: owned.userB } },
      });
      expect(dono?.status).toBe(MembershipStatus.ACTIVE);
    });

    it('a listagem de membros respeita o papel de quem olha', async () => {
      const peloDono = await memberships.listMembers(owned.userB, owned.groupId);
      const peloAluno = await memberships.listMembers(owned.userA, owned.groupId);

      // O dono administra e vê todo mundo: ele, os dois alunos, os dois
      // profissionais e o criador de conteúdo.
      expect(peloDono).toHaveLength(6);
      // O aluno vê quem administra ou atende, e ele mesmo: a lista de alunos de
      // uma academia é informação sobre pessoas, e não é do interesse de outro
      // aluno. Com um único MEMBER no grupo, "vê só a si" e "vê todos os MEMBER"
      // dariam o mesmo resultado — por isso o user-B entra como segundo aluno.
      const segundoAluno = await prisma.groupMembership.create({
        data: {
          groupId: owned.grupoDoProId,
          userId: owned.userA,
          role: GroupRole.MEMBER,
          status: MembershipStatus.ACTIVE,
        },
      });
      const noGrupoDoPro = await memberships.listMembers(owned.userA, owned.grupoDoProId);
      await prisma.groupMembership.delete({ where: { id: segundoAluno.id } });

      expect(peloAluno.some((m) => m.role === GroupRole.OWNER)).toBe(true);
      expect(peloAluno.filter((m) => m.role === GroupRole.MEMBER)).toHaveLength(1);
      // No grupo do `pro` o user-B também é MEMBER e não pode aparecer.
      expect(
        noGrupoDoPro.filter((m) => m.role === GroupRole.MEMBER).map((m) => m.membershipId),
      ).toEqual([segundoAluno.id]);

      // Metadado de associação, nunca dado de saúde — e nunca o `userId` de
      // outra pessoa: tudo que sai daqui é referenciado por `membershipId`. A
      // equipe vê também o que cada um compartilha COM ELA e o assento (Fase 6);
      // `statsOptIn` individual nunca sai. Por onde entrou, quem acompanha, quando
      // saiu e o WhatsApp que a pessoa autorizou mostrar entram com a #401.
      expect(Object.keys(peloDono[0]).sort()).toEqual([
        'accompaniedBy',
        'hasAiSeat',
        'joinedAt',
        'joinedVia',
        'leftAt',
        'membershipId',
        'name',
        'role',
        'scopesGrantedToMe',
        'status',
        'whatsapp',
      ]);
      expect(Object.keys(peloAluno[0]).sort()).toEqual([
        'joinedAt',
        'membershipId',
        'name',
        'role',
        'status',
      ]);
    });
  });

  /**
   * Consentimento granular (#155) e papéis (#156).
   *
   * As duas issues respondem perguntas diferentes e são verificadas juntas aqui
   * de propósito: é o mesmo banco, o mesmo grupo e as mesmas pessoas, e o que
   * elas provam em conjunto é que **nenhum dos dois mecanismos cobre o outro**.
   * Papel não abre leitura em escopo nenhum; consentimento de um escopo não
   * abre os outros quatro.
   */
  describe('consentimento por categoria e papéis (#155, #156)', () => {
    const escopos = Object.values(ShareScope);

    /** Mensagem da recusa. Estoura se a leitura for autorizada. */
    const mensagemDaRecusa = async (quem: string, membershipId: string, scope: ShareScope) => {
      try {
        await access.assertReadable(quem, membershipId, scope, 'probe');
      } catch (err) {
        return (err as Error).message;
      }
      throw new Error('esperava recusa, mas a leitura foi autorizada');
    };

    /**
     * Recusa que um estranho qualquer recebe, para comparar byte a byte.
     *
     * Alguém de fora do grupo, e não o dono dele: metade dos casos abaixo sonda
     * justamente com o `owned.userB`, e comparar a recusa dele com a dele mesmo
     * seria uma igualdade que passa sozinha.
     */
    const ESTRANHO = 'ninguem-com-este-id';
    const recusaDeEstranho = (scope: ShareScope) =>
      mensagemDaRecusa(ESTRANHO, owned.membershipA, scope);

    /**
     * `linkId` de uma concessão não vazia.
     *
     * A resposta de `grant` traz `linkId: null` quando a lista veio vazia —
     * ali não sobra vínculo vivo. Aqui a lista nunca é vazia, e o `throw`
     * denuncia se um dia for, em vez de comparar `null` com `null` e passar.
     */
    const idDaConcessao = (view: { linkId: string | null }): string => {
      if (view.linkId === null) throw new Error('concessão não vazia veio sem linkId');
      return view.linkId;
    };

    afterEach(async () => {
      await prisma.professionalAccessLog.deleteMany({ where: { subjectUserId: owned.userA } });
      await prisma.professionalLink.deleteMany({
        where: {
          subjectUserId: { in: [owned.userA, owned.userB, owned.colega] },
        },
      });
    });

    // --- #155: o consentimento é por categoria, e a diagonal é a prova ---

    const cruzamento = escopos.flatMap((concedido) =>
      escopos.map((pedido) => ({ concedido, pedido })),
    );

    it.each(cruzamento)('consentiu $concedido, pediu $pedido', async ({ concedido, pedido }) => {
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [concedido],
      });

      if (concedido === pedido) {
        await expect(
          access.assertReadable(owned.pro, owned.membershipA, pedido, 'probe'),
        ).resolves.toBe(owned.userA);
        return;
      }

      // As 20 combinações fora da diagonal são o DoD literal da #155:
      // compartilhar treino sem compartilhar alimentação. A recusa tem de ser
      // idêntica à de um estranho — dizer "existe, mas você não consentiu"
      // confirmaria que aquele aluno existe e que ele guarda aquele tipo de
      // dado.
      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, pedido)).toBe(
        await recusaDeEstranho(pedido),
      );
    });

    it('dois profissionais na mesma academia, consentimentos diferentes', async () => {
      // O caso que justifica a tabela de vínculo em vez de colunas em `User`:
      // nutricionista e personal no mesmo grupo, cada um com o seu escopo.
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.NUTRITION],
      });
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro2,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      // Cada um lê o seu...
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.NUTRITION, 'probe'),
      ).resolves.toBe(owned.userA);
      await expect(
        access.assertReadable(owned.pro2, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);

      // ...e nenhum lê o do outro. Um consentimento por GRUPO colapsaria os dois.
      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );
      expect(await mensagemDaRecusa(owned.pro2, owned.membershipA, ShareScope.NUTRITION)).toBe(
        await recusaDeEstranho(ShareScope.NUTRITION),
      );
    });

    it('revogar corta a leitura na mesma execução, sem restart e sem cache', async () => {
      const consentimento = await consent.grant(owned.userA, owned.membershipPro, [
        ShareScope.WORKOUT,
      ]);

      // Lê ANTES. Sem esta metade, a recusa abaixo passaria de graça.
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);

      await consent.revoke(owned.userA, idDaConcessao(consentimento));

      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );

      // Revogar NÃO apaga: se alguém trocar o `updateMany` por um `delete`, é
      // este caso que pega — e o que se perde é a resposta a "quem teve acesso
      // a quê, quando".
      const linha = await prisma.professionalLink.findUnique({
        where: { id: idDaConcessao(consentimento) },
      });
      expect([linha !== null, linha?.revokedAt !== null, linha?.revokedReason]).toEqual([
        true,
        true,
        'subject',
      ]);
    });

    it('conceder de novo depois de revogar cria linha NOVA', async () => {
      const primeiro = await consent.grant(owned.userA, owned.membershipPro, [ShareScope.WORKOUT]);
      await consent.revoke(owned.userA, idDaConcessao(primeiro));
      const segundo = await consent.grant(owned.userA, owned.membershipPro, [ShareScope.BODY]);

      const linhas = await prisma.professionalLink.findMany({
        where: {
          subjectUserId: owned.userA,
          professionalId: owned.pro,
          groupId: owned.groupId,
        },
        orderBy: { grantedAt: 'asc' },
      });

      // Duas linhas, e só a segunda viva. Um `@@unique` no trio forçaria UPDATE
      // e destruiria a janela de vigência da primeira — é a "correção" errada
      // mais provável numa revisão futura.
      expect(linhas.map((l) => [l.id, l.revokedAt === null])).toEqual([
        [idDaConcessao(primeiro), false],
        [idDaConcessao(segundo), true],
      ]);
    });

    it('substituir o consentimento supersede o anterior e vale na hora', async () => {
      await consent.grant(owned.userA, owned.membershipPro, [
        ShareScope.WORKOUT,
        ShareScope.NUTRITION,
      ]);
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.NUTRITION, 'probe'),
      ).resolves.toBe(owned.userA);

      // Tirar a nutrição é mandar a lista sem ela — a lista enviada é a lista
      // inteira, e não um incremento.
      await consent.grant(owned.userA, owned.membershipPro, [ShareScope.WORKOUT]);

      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);
      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.NUTRITION)).toBe(
        await recusaDeEstranho(ShareScope.NUTRITION),
      );
    });

    it('lista vazia equivale a revogar: some do painel, sem apagar a linha', async () => {
      const concedido = await consent.grant(owned.userA, owned.membershipPro, [ShareScope.WORKOUT]);
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'probe'),
      ).resolves.toBe(owned.userA);

      const vazio = await consent.grant(owned.userA, owned.membershipPro, []);

      expect(vazio.scopes).toEqual([]);
      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );

      // "Equivale a revogar" tem de valer também no painel: gravando concessão
      // de zero escopos, `list_data_sharing` devolveria para sempre um
      // profissional que não vê nada, contra a própria descrição da tool. E o
      // titular não teria como sumir com ele — a resposta nem traz `linkId`.
      expect(await consent.listMine(owned.userA)).toEqual([]);
      expect(vazio.linkId).toBeNull();

      // A linha de antes continua lá, revogada: é ela que responde "quem teve
      // acesso a quê, quando". Nenhuma linha nova nasceu.
      const linhas = await prisma.professionalLink.findMany({
        where: {
          subjectUserId: owned.userA,
          professionalId: owned.pro,
          groupId: owned.groupId,
        },
      });
      expect(linhas.map((l) => [l.id, l.scopes, l.revokedAt !== null, l.revokedReason])).toEqual([
        [idDaConcessao(concedido), [ShareScope.WORKOUT], true, 'subject'],
      ]);
    });

    it('o painel do titular responde "quem vê o quê" e "quem olhou"', async () => {
      // Caminho feliz do #155 ponta a ponta. Sem ele, as recusas acima poderiam
      // estar verdes porque a leitura está quebrada por outro motivo.
      await consent.grant(owned.userA, owned.membershipPro, [ShareScope.WORKOUT]);

      const painel = await consent.listMine(owned.userA);
      expect(painel).toEqual([
        expect.objectContaining({
          groupId: owned.groupId,
          groupName: 'Academia B',
          professionalMembershipId: owned.membershipPro,
          professionalName: 'Pro',
          scopes: [ShareScope.WORKOUT],
        }),
      ]);
      // Nem o `professionalId` nem qualquer outro `userId` saem daqui: a
      // identidade de terceiro é referenciada só por `membershipId`.
      expect(Object.keys(painel[0]).some((k) => /userid$/i.test(k))).toBe(false);

      await access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'leu_treino');
      await access
        .assertReadable(owned.pro, owned.membershipA, ShareScope.NUTRITION, 'tentou_dieta')
        .catch(() => undefined);

      const trilha = await consent.listAccessLog(owned.userA);

      // Mais recente primeiro, e a tentativa BARRADA aparece — é ela que
      // denuncia quem está sondando o que não foi consentido.
      expect(trilha.map((l) => [l.action, l.denied, l.professionalName])).toEqual([
        ['tentou_dieta', true, 'Pro'],
        ['leu_treino', false, 'Pro'],
      ]);
      // A trilha registra QUE houve leitura, nunca o conteúdo lido.
      expect(Object.keys(trilha[0]).sort()).toEqual([
        'action',
        'at',
        'denied',
        'groupId',
        'professionalName',
        'professionalRole',
        'scope',
      ]);
    });

    it('a trilha de um titular não vaza para outro', async () => {
      await consent.grant(owned.userA, owned.membershipPro, [ShareScope.WORKOUT]);
      await access.assertReadable(owned.pro, owned.membershipA, ShareScope.WORKOUT, 'leu_treino');

      // O colega é aluno da mesma academia e não tem nada a ver com a leitura.
      expect(await consent.listAccessLog(owned.colega)).toEqual([]);
      expect(await consent.listMine(owned.colega)).toEqual([]);
    });

    // --- #156: papel não lê, em nenhum escopo ---
    //
    // ADR 026: dono e criador passaram a ser equipe e podem receber vínculo
    // (casos logo abaixo). MEMBER continua nunca lendo ninguém.

    const papeisQueNaoLeem = [{ papel: GroupRole.MEMBER, quem: () => owned.colega }];

    it.each([
      { papel: GroupRole.OWNER, quem: () => owned.userB },
      { papel: GroupRole.CREATOR, quem: () => owned.creator },
    ])('$papel lê só com o consentimento do titular, e fica na trilha', async ({ quem }) => {
      for (const scope of escopos) {
        expect(await mensagemDaRecusa(quem(), owned.membershipA, scope)).toBe(
          await recusaDeEstranho(scope),
        );
      }
      const alvo = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: owned.groupId, userId: quem() } },
      });
      await consent.grant(owned.userA, alvo!.id, [ShareScope.HABITS]);

      await expect(
        access.assertReadable(quem(), owned.membershipA, ShareScope.HABITS, 'leu_habitos'),
      ).resolves.toBe(owned.userA);
      for (const scope of escopos.filter((s) => s !== ShareScope.HABITS)) {
        expect(await mensagemDaRecusa(quem(), owned.membershipA, scope)).toBe(
          await recusaDeEstranho(scope),
        );
      }
      const trilha = await consent.listAccessLog(owned.userA);
      expect(trilha.some((l) => l.action === 'leu_habitos' && !l.denied)).toBe(true);
    });

    it.each(
      papeisQueNaoLeem.flatMap(({ papel, quem }) =>
        escopos.map((scope) => ({ papel, quem, scope })),
      ),
    )('$papel não lê $scope, mesmo sendo membro ativo do grupo', async ({ papel, quem, scope }) => {
      // O papel está de fato no banco: sem esta conferência, um `role` errado no
      // seed faria os 15 casos recusarem pelo motivo errado e passarem verdes.
      const membership = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: owned.groupId, userId: quem() } },
      });
      expect([membership?.role, membership?.status]).toEqual([papel, MembershipStatus.ACTIVE]);

      // E existe consentimento vivo no grupo, para o PROFESSIONAL: a recusa
      // abaixo não é "ninguém lê nada", é "papel nenhum lê".
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [scope],
      });
      await expect(
        access.assertReadable(owned.pro, owned.membershipA, scope, 'probe'),
      ).resolves.toBe(owned.userA);

      // O vínculo do papel errado é criado **na marra**, por baixo do
      // `ConsentService` que o recusaria. Sem esta linha o caso recusaria por
      // falta de vínculo e não pelo papel — e afrouxar a checagem de papel na
      // porta manteria os 15 casos verdes, que é como esta garantia
      // apodreceria em silêncio. A recusa do `ConsentService` é o caso
      // seguinte: são duas linhas de defesa, e cada uma tem o seu teste.
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: quem(),
        groupId: owned.groupId,
        scopes: [scope],
      });

      expect(await mensagemDaRecusa(quem(), owned.membershipA, scope)).toBe(
        await recusaDeEstranho(scope),
      );
    });

    it.each(papeisQueNaoLeem)('o titular não consegue consentir a um $papel', async ({ quem }) => {
      // A outra linha de defesa: o `ConsentService` nem cria o vínculo. Papel
      // que não atende ninguém não pode figurar como destinatário, senão o
      // painel do dono viraria caminho de aquisição de acesso.
      const alvo = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: owned.groupId, userId: quem() } },
      });
      await expect(consent.grant(owned.userA, alvo!.id, [ShareScope.WORKOUT])).rejects.toThrow(
        ConflictException,
      );
      expect(
        await prisma.professionalLink.count({
          where: { subjectUserId: owned.userA, professionalId: quem() },
        }),
      ).toBe(0);
    });

    it('o profissional não consegue conceder acesso a si mesmo', async () => {
      // O `subjectUserId` sai do contexto: o que o profissional consegue montar
      // é o vínculo INVERTIDO, apontando o aluno como destinatário — e um
      // MEMBER não pode receber. A leitura dele continua fechada.
      await expect(
        consent.grant(owned.pro, owned.membershipA, [ShareScope.WORKOUT]),
      ).rejects.toThrow(ConflictException);

      expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );
    });

    it('consentir num grupo não vale no outro', async () => {
      // O `pro` é dono de outro grupo em que o user-B é MEMBER. Consentimento
      // dado na academia não pode ser reaproveitado lá — e nem o contrário.
      const membershipDoProNaAcademia = owned.membershipPro;
      await consent.grant(owned.userA, membershipDoProNaAcademia, [ShareScope.WORKOUT]);

      expect(await mensagemDaRecusa(owned.pro, owned.membershipForaId, ShareScope.WORKOUT)).toBe(
        await recusaDeEstranho(ShareScope.WORKOUT),
      );
    });

    it('quem não está no grupo não consegue nem sondar a associação de lá', async () => {
      // O `colega` está na academia; o alvo é a associação do user-B no grupo do
      // `pro`, de que o colega não faz parte. A recusa tem de ser idêntica à de
      // uma associação inexistente, senão a rota vira oráculo de composição de
      // grupo alheio.
      const deGrupoAlheio = await consent
        .grant(owned.colega, owned.membershipForaId, [ShareScope.WORKOUT])
        .catch((err: Error) => err.message);
      const inexistente = await consent
        .grant(owned.colega, '11111111-2222-4333-8444-777777777777', [ShareScope.WORKOUT])
        .catch((err: Error) => err.message);

      expect(deGrupoAlheio).toBe(inexistente);
    });

    it('sair do grupo derruba o consentimento e o painel esvazia', async () => {
      await consent.grant(owned.userA, owned.membershipPro, [ShareScope.WORKOUT]);
      expect(await consent.listMine(owned.userA)).toHaveLength(1);

      try {
        await memberships.leave(owned.userA, owned.groupId);

        // O painel do titular passa a mostrar o que é verdade: ninguém vê nada.
        expect(await consent.listMine(owned.userA)).toEqual([]);
        expect(await mensagemDaRecusa(owned.pro, owned.membershipA, ShareScope.WORKOUT)).toBe(
          await recusaDeEstranho(ShareScope.WORKOUT),
        );
      } finally {
        await prisma.groupMembership.update({
          where: { id: owned.membershipA },
          data: { status: MembershipStatus.ACTIVE, leftAt: null },
        });
      }
    });
  });

  describe('chat com a IA hospedada (#249)', () => {
    /**
     * Quantas mensagens a conversa do user-A tem agora, contadas **direto no
     * banco**.
     *
     * Pelo banco, e não pelo serviço, de propósito: usar o serviço para conferir
     * o efeito de uma tentativa que ele mesmo recusou é perguntar ao réu se ele
     * fez. Uma escrita entre contas que o `where` do serviço escondesse na
     * leitura passaria despercebida.
     */
    const mensagensNoBanco = () =>
      prisma.message.count({ where: { conversationId: owned.conversationId } });

    // --- o caminho feliz, primeiro ---
    //
    // Sem ele, todas as recusas abaixo continuariam verdes com a leitura
    // quebrada por qualquer outro motivo — um `NOT_FOUND` que sempre acontece
    // não prova isolamento nenhum.
    it('o dono lê a própria conversa, com as mensagens e as tools do turno', async () => {
      const conversa = await conversas.obterComMensagens(owned.userA, owned.conversationId);

      expect(conversa.userId).toBe(owned.userA);
      expect(conversa.title).toBe('quanto comi hoje?');
      expect(conversa.messages.map((m) => [m.role, m.content])).toEqual([
        ['user', 'quanto comi hoje?'],
        ['assistant', 'Você comeu 1.800 kcal hoje.'],
      ]);
      // A tool chamada sobrevive ao recarregar — é o que torna a ação auditável.
      expect(conversa.messages[1].tools).toEqual([{ name: 'get_nutrition_summary' }]);
    });

    it('o dono vê a conversa na própria listagem', async () => {
      const lista = await conversas.list(owned.userA);
      expect(lista.map((c) => c.id)).toContain(owned.conversationId);
    });

    it('o dono continua a própria conversa e o histórico vem em ordem', async () => {
      const { conversationId } = await conversas.iniciarTurno(
        owned.userA,
        owned.conversationId,
        'e de proteína?',
      );
      expect(conversationId).toBe(owned.conversationId);

      const historico = await conversas.historicoParaOAgente(owned.userA, owned.conversationId);
      expect(historico.map((m) => m.content)).toEqual([
        'quanto comi hoje?',
        'Você comeu 1.800 kcal hoje.',
        'e de proteína?',
      ]);

      await prisma.message.deleteMany({
        where: { conversationId: owned.conversationId, content: 'e de proteína?' },
      });
    });

    // --- e as recusas ---
    it('ler conversa alheia recusa com NOT_FOUND', async () => {
      await expect(conversas.obterComMensagens(owned.userB, owned.conversationId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('a recusa é idêntica à de conversa inexistente (#92)', async () => {
      const mensagem = async (promessa: Promise<unknown>) => {
        try {
          await promessa;
        } catch (err) {
          return (err as Error).message;
        }
        throw new Error('esperava recusa, mas a leitura foi autorizada');
      };

      // Byte a byte: qualquer diferença aqui transforma a rota num oráculo de
      // ids alheios — "não existe" e "existe e não é sua" têm de ser a mesma
      // frase.
      expect(await mensagem(conversas.obterComMensagens(owned.userB, owned.conversationId))).toBe(
        await mensagem(
          conversas.obterComMensagens(owned.userB, '00000000-0000-0000-0000-000000000000'),
        ),
      );
    });

    it('o estado e a contagem das conversas (#369) são só do dono', async () => {
      const pausada = await conversas.iniciarTurno(owned.userA, randomUUID(), 'anota o almoço');
      await conversas.completeTurn(owned.userA, pausada.conversationId, {
        texto: '',
        tools: [],
        status: 'interrupted',
        pausa: { id: 'int-iso', value: { kind: 'confirm', prompt: 'Gravo?', actions: [] } },
        runId: null,
      });
      // O registro de turnos casa pelo id da conversa; o serviço tem de filtrar
      // pelo dono antes. Aqui ele diria "rodando" para qualquer id.
      const sempreRodando = () => true;
      try {
        expect((await conversas.pendingCount(owned.userA)).waiting).toBe(1);
        const doDono = await conversas.list(owned.userA, { state: 'waiting' });
        expect(doDono.map((c) => c.id)).toEqual([pausada.conversationId]);

        expect(await conversas.pendingCount(owned.userB, sempreRodando)).toEqual({
          waiting: 0,
          thinking: 0,
        });
        for (const state of ['waiting', 'thinking', 'idle'] as const) {
          const lista = await conversas.list(owned.userB, { state, isRunning: sempreRodando });
          expect(lista.map((c) => c.id)).not.toContain(pausada.conversationId);
          expect(lista.map((c) => c.id)).not.toContain(owned.conversationId);
        }
      } finally {
        await prisma.conversation.deleteMany({ where: { id: pausada.conversationId } });
      }
    });

    it('a listagem do vizinho não inclui a conversa do user-A', async () => {
      const lista = await conversas.list(owned.userB);
      expect(lista.map((c) => c.id)).not.toContain(owned.conversationId);
    });

    it('ler o histórico de conversa alheia recusa', async () => {
      await expect(
        conversas.historicoParaOAgente(owned.userB, owned.conversationId),
      ).rejects.toThrow(NotFoundException);
    });

    it('continuar conversa alheia recusa E não escreve nada nela', async () => {
      const antes = await mensagensNoBanco();

      // O padrão exato da #204: o id da conversa vem do CORPO da requisição, e
      // ser um usuário válido não autoriza escrever no filho de outro.
      await expect(
        conversas.iniciarTurno(owned.userB, owned.conversationId, 'me conta o que ele comeu'),
      ).rejects.toThrow(NotFoundException);

      expect(await mensagensNoBanco()).toBe(antes);
    });

    it('renomear, votar e limpar pausa numa conversa alheia recusam', async () => {
      await expect(conversas.renomear(owned.userB, owned.conversationId, 'x')).rejects.toThrow(
        NotFoundException,
      );
      const [resposta] = await prisma.message.findMany({
        where: { conversationId: owned.conversationId, role: 'assistant' },
      });
      await expect(
        conversas.vote(owned.userB, owned.conversationId, resposta.id, { review: 'like' }),
      ).rejects.toThrow(NotFoundException);
      await expect(conversas.clearPauses(owned.userB, owned.conversationId)).rejects.toThrow(
        NotFoundException,
      );
      // `find` é a porta da primeira mensagem: o id da conversa alheia não
      // pode parecer "livre" para quem tenta criar uma conversa com ele.
      await expect(conversas.find(owned.userB, owned.conversationId)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        (await prisma.conversation.findUniqueOrThrow({ where: { id: owned.conversationId } }))
          .title,
      ).not.toBe('x');
    });

    it('gravar a resposta numa conversa alheia não escreve nada', async () => {
      const antes = await mensagensNoBanco();

      // `completeTurn` roda depois do streaming, com um id que atravessou o
      // turno inteiro. Ele não lança — o cabeçalho já foi para o cliente e não há
      // mais status a devolver —, mas também não pode gravar na conversa alheia.
      await conversas.completeTurn(owned.userB, owned.conversationId, {
        texto: 'texto injetado',
        tools: [],
        status: 'completed',
        pausa: null,
        runId: null,
      });

      expect(await mensagensNoBanco()).toBe(antes);
    });

    it('apagar conversa alheia recusa E a conversa continua lá', async () => {
      await expect(conversas.apagar(owned.userB, owned.conversationId)).rejects.toThrow(
        NotFoundException,
      );

      const aindaExiste = await prisma.conversation.findUnique({
        where: { id: owned.conversationId },
      });
      expect(aindaExiste).toBeTruthy();
      expect(await mensagensNoBanco()).toBe(2);
    });

    it('o dono apaga a própria conversa, e as mensagens vão junto', async () => {
      const { conversationId } = await conversas.iniciarTurno(
        owned.userA,
        randomUUID(),
        'descartável',
      );

      await conversas.apagar(owned.userA, conversationId);

      expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).toBeNull();
      expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
    });
  });

  describe('aceites da IA e preferência da busca (#384)', () => {
    afterAll(async () => {
      await prisma.aiConsent.deleteMany({ where: { userId: { in: [owned.userA, owned.userB] } } });
      await prisma.user.updateMany({
        where: { id: { in: [owned.userA, owned.userB] } },
        data: { webSearchEnabled: true },
      });
    });

    it('o aceite de A abre o chat de A, e não o de B', async () => {
      await aceitesDaIa.accept(owned.userA, 'chat', AI_CONSENT_VERSIONS.chat);

      await expect(aceitesDaIa.assertChatConsent(owned.userA)).resolves.toBeUndefined();
      await expect(aceitesDaIa.assertChatConsent(owned.userB)).rejects.toThrow(ForbiddenException);
      expect((await aceitesDaIa.status(owned.userB)).chat.accepted).toBe(false);
    });

    it('o aceite da busca de A não liga a busca de B', async () => {
      await aceitesDaIa.accept(owned.userA, 'web_search', AI_CONSENT_VERSIONS.webSearch);

      expect(await aceitesDaIa.webSearchMode(owned.userA)).toBe('on');
      expect(await aceitesDaIa.webSearchMode(owned.userB)).toBe('ask');
    });

    it('desligar a busca de B não mexe na de A', async () => {
      await aceitesDaIa.setWebSearch(owned.userB, false);

      expect(await aceitesDaIa.webSearchMode(owned.userB)).toBe('off');
      expect(await aceitesDaIa.webSearchMode(owned.userA)).toBe('on');
    });
  });

  describe('cópia de refeição e refeições salvas', () => {
    let templateA = '';
    let diaDaRefeicaoA = '';
    const refeicoesDoB = () => prisma.meal.count({ where: { userId: owned.userB } });

    beforeAll(async () => {
      templateA = (
        await mealTemplates.create(owned.userA, { name: 'Café de A', mealId: owned.mealId })
      ).id;
      const meal = await meals.findById(owned.userA, owned.mealId);
      diaDaRefeicaoA = dateInTz(meal.eatenAt, TZ);
    });

    it('copy_meal recusa a refeição de outro, e o vizinho não ganha nada', async () => {
      const antes = await refeicoesDoB();
      await expect(
        mealCopies.copyMeal(owned.userB, owned.mealId, { toDate: '2030-01-01' }, TZ),
      ).rejects.toThrow(NotFoundException);
      await expect(refeicoesDoB()).resolves.toBe(antes);
    });

    it('copy_day só enxerga as refeições de quem pede', async () => {
      const antes = await refeicoesDoB();
      await expect(
        mealCopies.copyDay(owned.userB, diaDaRefeicaoA, '2030-01-02', TZ),
      ).rejects.toThrow(NotFoundException);
      await expect(refeicoesDoB()).resolves.toBe(antes);
    });

    it('list_meal_templates do user-B não traz a refeição salva do user-A', async () => {
      const deA = await mealTemplates.list(owned.userA);
      expect(deA.map((t) => t.id)).toContain(templateA);
      const deB = await mealTemplates.list(owned.userB);
      expect(deB.map((t) => t.id)).not.toContain(templateA);
    });

    it('log_meal_template recusa a refeição salva de outro, e nada é registrado', async () => {
      const antes = await refeicoesDoB();
      await expect(
        mealTemplates.log(owned.userB, templateA, { eatenAt: '2030-01-03T12:00:00Z' }),
      ).rejects.toThrow(NotFoundException);
      await expect(refeicoesDoB()).resolves.toBe(antes);
    });

    it('delete_meal_template recusa a de outro, e ela continua lá', async () => {
      await expect(mealTemplates.remove(owned.userB, templateA)).rejects.toThrow(NotFoundException);
      await expect(prisma.mealTemplate.count({ where: { id: templateA } })).resolves.toBe(1);
    });

    it('save_meal_template recusa salvar a refeição de outro', async () => {
      await expect(
        mealTemplates.create(owned.userB, { name: 'Roubado', mealId: owned.mealId }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        prisma.mealTemplate.count({ where: { userId: owned.userB, name: 'Roubado' } }),
      ).resolves.toBe(0);
    });

    it('save_meal_template recusa itens com o alimento custom de outro', async () => {
      await expect(
        mealTemplates.create(owned.userB, {
          name: 'Com alimento alheio',
          items: [{ foodId: owned.customFoodId, grams: 100 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sugestão de metas e onboarding', () => {
    it('suggest_nutrition_goals do user-B não usa a pesagem do user-A', async () => {
      // O user-A tem pesagem de 80 kg; o user-B não tem nenhuma.
      await expect(
        onboarding.suggest(
          owned.userB,
          {
            sex: 'FEMALE',
            birthDate: '1990-01-01',
            heightCm: 165,
            activityLevel: 'LIGHT',
            objective: 'MAINTAIN',
          },
          TZ,
        ),
      ).rejects.toThrow('Faltam dados para calcular: peso.');
    });

    it('o onboarding do user-B não toca nas metas nem nas pesagens do user-A', async () => {
      const metasA = await prisma.userGoals.findUnique({ where: { userId: owned.userA } });
      const pesagensA = await prisma.weightLog.count({ where: { userId: owned.userA } });

      await onboarding.complete(
        owned.userB,
        {
          sex: 'MALE',
          birthDate: '1990-01-01',
          heightCm: 180,
          weightKg: 77,
          activityLevel: 'LIGHT',
          objective: 'MAINTAIN',
          goals: {
            kcalMin: 2400,
            kcalMax: 2600,
            proteinMinG: 110,
            proteinMaxG: 140,
            carbsMinG: 250,
            carbsMaxG: 350,
            fatMinG: 60,
            fatMaxG: 90,
          },
        },
        TZ,
      );

      expect(await prisma.userGoals.findUnique({ where: { userId: owned.userA } })).toEqual(metasA);
      expect(await prisma.weightLog.count({ where: { userId: owned.userA } })).toBe(pesagensA);
      expect(await prisma.weightLog.count({ where: { userId: owned.userB, weightKg: 77 } })).toBe(
        1,
      );
    });
  });

  describe('memória do assistente', () => {
    it('list_memories do user-B não traz a memória do user-A', async () => {
      expect(await memorias.list(owned.userB)).toEqual([]);
    });

    it('forget_memory recusa o id do user-A, e a memória fica', async () => {
      await expect(memorias.forget(owned.userB, owned.memoryId)).rejects.toThrow(NotFoundException);
      expect(await prisma.userMemory.findUnique({ where: { id: owned.memoryId } })).toBeTruthy();
    });

    it('"Apagar todas" do user-B não apaga a memória do user-A (#385)', async () => {
      await memorias.forgetAll(owned.userB);
      expect(await prisma.userMemory.findUnique({ where: { id: owned.memoryId } })).toBeTruthy();
      expect(await memorias.count(owned.userB)).toBe(0);
    });
  });

  describe('Configurações da IA e Desfazer (#385)', () => {
    const registry = {
      useAutoWriter: () => undefined,
      entidades: () => [],
      buscar: () => undefined,
    } as unknown as McpToolRegistry;
    const autoWrites = new AutoWriteService(
      prisma,
      registry,
      new PreviaDaAcaoService(registry, prisma),
      new ChatRunRegistry(),
    );

    it('o modo de uma pessoa não muda o da outra', async () => {
      await autoWrites.setMode(owned.userA, 'DAY_LOG', 'AUTO');
      expect((await autoWrites.modes(owned.userB)).DAY_LOG).toBe('ASK');
      await autoWrites.setMode(owned.userB, 'DAY_LOG', 'OFF');
      expect((await autoWrites.modes(owned.userA)).DAY_LOG).toBe('AUTO');
      await autoWrites.setMode(owned.userA, 'DAY_LOG', 'ASK');
      await autoWrites.setMode(owned.userB, 'DAY_LOG', 'ASK');
    });

    it('o user-B não desfaz a gravação automática do user-A, e nada muda', async () => {
      const conversa = await prisma.conversation.create({ data: { userId: owned.userA } });
      const log = await prisma.waterLog.create({
        data: { userId: owned.userA, date: '2026-11-16', ml: 300 },
      });
      const linha = await prisma.aiAutoWrite.create({
        data: {
          userId: owned.userA,
          conversationId: conversa.id,
          runId: 'r',
          answerKey: 'r',
          doneAt: new Date(),
          toolCallId: `iso-${conversa.id}`,
          tool: 'log_water',
          input: { ml: 300 },
          result: { waterLogId: log.id },
        },
      });
      await expect(autoWrites.undo(owned.userB, linha.id)).rejects.toThrow(NotFoundException);
      expect(await prisma.waterLog.findUnique({ where: { id: log.id } })).toBeTruthy();
      expect(
        (await prisma.aiAutoWrite.findUnique({ where: { id: linha.id } }))?.undoneAt,
      ).toBeNull();
      await prisma.conversation.delete({ where: { id: conversa.id } });
      await prisma.waterLog.delete({ where: { id: log.id } });
    });
  });

  describe('Você: foto, preferências, novidades e exportação (#387)', () => {
    const store = new MemoryObjectStore();
    const media = new MediaService(prisma, store);
    const perfil = new ProfileService(prisma, media);
    const voce = new YouService(prisma);
    const exportacoes = new DataExportService(
      prisma,
      new AccountService(prisma, {} as LogtoManagementService, {} as CheckpointPurgeService),
    );
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    let fotoA = '';

    beforeAll(async () => {
      const t = await media.requestUpload(owned.userA, {
        purpose: 'user_avatar',
        mime: 'image/png',
        bytes: PNG.length,
      });
      const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: t.fileId } });
      store.upload(f.key, PNG, 'image/png');
      fotoA = t.fileId;
      await perfil.setAvatar(owned.userA, fotoA);
      await perfil.updateMe(
        owned.userA,
        { nickname: 'Usuária A', bio: 'Só minha', loadUnit: 'LB', keepMealPhotos: true },
        TZ,
      );
      await voce.markNewsRead(owned.userA);
      await voce.markTutorialSeen(owned.userA, 'registrar-por-foto');
    });

    it('a foto do user-A não vira a do user-B, e continua do user-A', async () => {
      await expect(perfil.setAvatar(owned.userB, fotoA)).rejects.toThrow(NotFoundException);
      expect((await perfil.getMe(owned.userB)).avatarUrl).toBeNull();
      const a = await prisma.user.findUniqueOrThrow({ where: { id: owned.userA } });
      expect(a.avatarFileId).toBe(fotoA);
    });

    it('remover a foto do user-B não apaga a do user-A', async () => {
      await perfil.removeAvatar(owned.userB);
      expect(await prisma.mediaFile.findUnique({ where: { id: fotoA } })).toBeTruthy();
    });

    it('as preferências do user-A não aparecem no perfil do user-B', async () => {
      expect(await perfil.getMe(owned.userB)).toMatchObject({
        nickname: null,
        bio: null,
        loadUnit: 'KG',
        keepMealPhotos: null,
      });
    });

    it('novidades lidas e tutoriais vistos do user-A não contam para o user-B', async () => {
      const deA = await voce.news(owned.userA);
      expect(deA.unreadCount).toBe(0);
      await prisma.user.update({
        where: { id: owned.userB },
        data: { createdAt: new Date('2026-01-01') },
      });
      expect((await voce.news(owned.userB)).unreadCount).toBeGreaterThan(0);
      expect(await voce.tutorialsSeen(owned.userB)).toEqual({ seen: [] });
    });

    it('o link de exportação do user-B só traz o dado do user-B', async () => {
      const link = await exportacoes.createLink(owned.userB);
      const { body } = await exportacoes.download(link.url.split('/').at(-1)!);
      expect(body.user.id).toBe(owned.userB);
      expect(body.meals).toEqual([]);
      expect(body.newsRead).toEqual([]);
      expect(body.mediaUploaded).toEqual([]);
    });
  });

  /**
   * Conectar sua IA (#388). O token que o Claude ou o ChatGPT recebem pelo
   * facade OAuth é do Logto, emitido para o app do facade: a única coisa que
   * diz de quem ele é é o `sub`. Este bloco faz o fluxo inteiro (DCR →
   * authorize → callback → token) com o Logto falso e confere que a conexão, o
   * guard e o último acesso ficam com o dono do token, e só com ele.
   */
  describe('Conectar sua IA: conexões e o caminho OAuth (#388)', () => {
    const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
    const CALLBACK = 'https://api.example.com/oauth/callback';
    const config = {
      getOrThrow: (key: string) =>
        ({
          LOGTO_ENDPOINT: 'https://logto.example.com',
          LOGTO_AUDIENCE: 'https://api.example.com',
          LOGTO_MCP_APP_ID: 'mcp-app',
          LOGTO_MCP_APP_SECRET: 'segredo',
        })[key],
    } as unknown as ConfigService;
    /** access token → sub, como o Logto assinaria. */
    const issued: Record<string, string> = {};
    const validation = {
      verify: async (token: string) => {
        const sub = issued[token];
        if (!sub) throw new UnauthorizedException('Invalid token');
        return { sub };
      },
    } as unknown as JwtValidationService;
    const provisioning = new UserProvisioningService(prisma);
    const connections = new McpConnectionService(prisma);
    const recorder = new McpConnectionRecorder(prisma, validation, provisioning, connections);
    const facade = new OAuthFacadeService(prisma, config, recorder);
    const users = new UsersController(
      {} as AccountService,
      {} as ProfileService,
      {} as DataExportService,
      connections,
      {} as IdentitySyncService,
    );
    const realFetch = global.fetch;
    const clientIds: string[] = [];
    let subA = '';
    let subB = '';

    /** O Logto responde ao /oidc/token com estes tokens. */
    function logtoIssues(sub: string) {
      const accessToken = `at-${randomUUID()}`;
      const refreshToken = `rt-${randomUUID()}`;
      issued[accessToken] = sub;
      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      })) as unknown as typeof fetch;
      return { accessToken, refreshToken };
    }

    /** Renova pelo facade e espera a gravação da conexão, que roda depois da resposta. */
    async function refreshAs(sub: string, presented: string, clientId?: string) {
      const tokens = logtoIssues(sub);
      await facade.refreshToken({ refreshToken: presented, clientId });
      await recorder.flush();
      return tokens;
    }

    /** Conecta um app de IA como a pessoa do `sub`, pelo facade, e devolve os tokens. */
    async function connectAs(sub: string, clientName: string) {
      const reg = await facade.registerClient({ redirectUris: [REDIRECT], clientName });
      clientIds.push(reg.client_id);
      const verifier = randomUUID() + randomUUID();
      const { logtoAuthorizeUrl } = await facade.startAuthorization(
        {
          clientId: reg.client_id,
          redirectUri: REDIRECT,
          clientState: 'st',
          clientCodeChallenge: createHash('sha256').update(verifier).digest('base64url'),
          scope: undefined,
          resource: undefined,
        },
        CALLBACK,
      );
      const state = new URL(logtoAuthorizeUrl).searchParams.get('state')!;
      const { redirectUrl } = await facade.handleCallback(state, `logto-${randomUUID()}`);
      const tokens = logtoIssues(sub);
      await facade.exchangeCode(
        {
          code: new URL(redirectUrl).searchParams.get('code')!,
          redirectUri: REDIRECT,
          clientId: reg.client_id,
          codeVerifier: verifier,
        },
        CALLBACK,
      );
      await recorder.flush();
      return { clientId: reg.client_id, ...tokens };
    }

    /** O guard de toda rota, com o token no cabeçalho, como o /mcp recebe. */
    async function guardUser(token: string) {
      const guard = new JwtAuthGuard(
        { getAllAndOverride: () => false } as unknown as Reflector,
        validation,
        provisioning,
      );
      const req = { headers: { authorization: `Bearer ${token}`, host: 'api.example.com' } } as {
        headers: Record<string, string>;
        user?: { id: string };
      };
      const ctx = {
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ setHeader() {} }) }),
      } as unknown as ExecutionContext;
      await guard.canActivate(ctx);
      return req.user!.id;
    }

    let claudeA = { clientId: '', accessToken: '', refreshToken: '' };
    let claudeB = { clientId: '', accessToken: '', refreshToken: '' };

    beforeAll(async () => {
      subA = (await prisma.user.findUniqueOrThrow({ where: { id: owned.userA } })).logtoSub;
      subB = (await prisma.user.findUniqueOrThrow({ where: { id: owned.userB } })).logtoSub;
      claudeA = await connectAs(subA, 'Claude');
    });

    afterAll(async () => {
      global.fetch = realFetch;
      await prisma.mcpOAuthClient.deleteMany({ where: { clientId: { in: clientIds } } });
    });

    it('a conexão que o user-A autorizou é dele (caminho feliz)', async () => {
      const deA = await users.mcpConnections({ id: owned.userA } as never);
      expect(deA.connections.map((c) => c.clientName)).toEqual(['Claude']);
    });

    it('GET /users/me/mcp-connections do user-B não mostra a do user-A', async () => {
      const deB = await users.mcpConnections({ id: owned.userB } as never);
      expect(deB.connections).toEqual([]);
      expect(deB.serverUrl).toMatch(/\/mcp$/);
    });

    it('o token que o user-A deu à IA resolve para o user-A no guard, nunca para o user-B', async () => {
      expect(await guardUser(claudeA.accessToken)).toBe(owned.userA);
    });

    it('o user-B conectando o mesmo tipo de app ganha a própria conexão, sem herdar a do user-A', async () => {
      claudeB = await connectAs(subB, 'Claude');
      expect(await guardUser(claudeB.accessToken)).toBe(owned.userB);

      const deB = await users.mcpConnections({ id: owned.userB } as never);
      expect(deB.connections).toHaveLength(1);
      const noBanco = await prisma.mcpOAuthConnection.findMany({
        where: { clientId: { in: [claudeA.clientId, claudeB.clientId] } },
      });
      expect(noBanco.map((c) => [c.clientId, c.userId]).sort()).toEqual(
        [
          [claudeA.clientId, owned.userA],
          [claudeB.clientId, owned.userB],
        ].sort(),
      );
    });

    // Revisão da #388: o client_id do corpo é público. B mandando o do app da A
    // não pode criar linha de B no cliente da A nem renovar a conexão da A.
    it('refresh do user-B com o client_id do app do user-A não cria linha do B no cliente da A', async () => {
      const novo = await refreshAs(subB, claudeB.refreshToken, claudeA.clientId);
      claudeB = { ...claudeB, ...novo };

      const noClienteDaA = await prisma.mcpOAuthConnection.findMany({
        where: { clientId: claudeA.clientId },
      });
      expect(noClienteDaA.map((c) => c.userId)).toEqual([owned.userA]);
      // O token novo do B não ficou preso à conexão da A.
      const daA = await prisma.mcpOAuthConnectionToken.findMany({
        where: { connection: { userId: owned.userA, clientId: claudeA.clientId } },
      });
      expect(daA.map((t) => t.hash)).not.toContain(
        createHash('sha256').update(novo.accessToken).digest('hex'),
      );
      expect((await users.mcpConnections({ id: owned.userB } as never)).connections).toHaveLength(
        1,
      );
    });

    it('refresh do user-A sem client_id renova a conexão da A e só ela', async () => {
      const novo = await refreshAs(subA, claudeA.refreshToken);
      claudeA = { ...claudeA, ...novo };

      const antigo = new Date('2026-01-01T00:00:00Z');
      await prisma.mcpOAuthConnection.updateMany({
        where: { userId: { in: [owned.userA, owned.userB] } },
        data: { lastUsedAt: antigo },
      });
      await connections.touch(novo.accessToken);

      const linhas = await prisma.mcpOAuthConnection.findMany({
        where: { userId: { in: [owned.userA, owned.userB] } },
      });
      for (const linha of linhas) {
        const daA = linha.userId === owned.userA && linha.clientId === claudeA.clientId;
        expect(linha.lastUsedAt.getTime() > antigo.getTime()).toBe(daA);
      }
    });

    it('o toque do /mcp com o token do user-A não mexe no último acesso do user-B', async () => {
      const antigo = new Date('2026-01-01T00:00:00Z');
      await prisma.mcpOAuthConnection.updateMany({
        where: { userId: { in: [owned.userA, owned.userB] } },
        data: { lastUsedAt: antigo },
      });

      await connections.touch(claudeA.accessToken);

      const linhas = await prisma.mcpOAuthConnection.findMany({
        where: { userId: { in: [owned.userA, owned.userB] } },
      });
      for (const linha of linhas) {
        if (linha.userId === owned.userA && linha.clientId === claudeA.clientId) {
          expect(linha.lastUsedAt.getTime()).toBeGreaterThan(antigo.getTime());
        } else {
          expect(linha.lastUsedAt.getTime()).toBe(antigo.getTime());
        }
      }
    });
  });

  /**
   * Plano alimentar do profissional (#376). O plano é do aluno: refeição, opção,
   * item, equivalente e troca são procurados dentro do plano de quem chama, e a
   * equipe só lê trocas e aderência pela porta de Alimentação.
   *
   * Grupo próprio, do `pro`, para não depender do estado em que os blocos acima
   * deixaram a academia do user-B (saídas, remoções, revogações).
   */
  describe('plano alimentar do profissional (#376)', () => {
    const studentView = new StudentViewService(
      prisma,
      access,
      plans,
      sessions,
      progress,
      nutritionSummary,
      goals,
      meals,
      nutritionPlans,
    );
    const p = {
      groupId: '',
      membershipA: '',
      planId: '',
      planMealId: '',
      optionId: '',
      itemId: '',
      equivalentId: '',
      swapId: '',
    };

    beforeAll(async () => {
      const stamp = `plano-${Date.now()}`;
      const grupo = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Nutri do Pro',
          slug: `${stamp}-nutri`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              { userId: owned.colega, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      p.groupId = grupo.id;
      p.membershipA = grupo.memberships.find((m) => m.userId === owned.userA)!.id;

      const outro = await prisma.food.create({
        data: {
          name: `${stamp}-equivalente`,
          searchName: `${stamp}-equivalente`,
          source: 'TACO',
          kcalPer100g: 300,
          proteinPer100g: 1,
          carbsPer100g: 70,
          fatPer100g: 1,
        },
      });
      const enviado = await nutritionPlans.send(owned.pro, p.membershipA, {
        goals: {
          kcalMin: 1800,
          kcalMax: 2000,
          proteinMinG: 100,
          proteinMaxG: 140,
          carbsMinG: 180,
          carbsMaxG: 240,
          fatMinG: 50,
          fatMaxG: 70,
        },
        meals: [
          {
            mealType: MealType.BREAKFAST,
            name: 'Café da manhã',
            options: [
              {
                items: [
                  {
                    foodId: owned.publicFoodId,
                    grams: 50,
                    equivalents: [{ foodId: outro.id, grams: 40 }],
                  },
                ],
              },
            ],
          },
        ],
      });
      p.planId = enviado.id;
      await nutritionPlans.accept(owned.userA, enviado.id);
      const meal = enviado.meals[0]!;
      p.planMealId = meal.id;
      p.optionId = meal.options[0]!.id;
      p.itemId = meal.options[0]!.items[0]!.id;
      p.equivalentId = meal.options[0]!.items[0]!.equivalents[0]!.id;
      p.swapId = (
        await nutritionPlans.swap(
          owned.userA,
          { itemId: p.itemId, equivalentId: p.equivalentId },
          TZ,
        )
      ).swap.id;
    });

    it('o user-B não vê o plano do user-A', async () => {
      const visao = await nutritionPlans.overview(owned.userB, TZ);
      expect(visao).toMatchObject({ active: null, pending: null, teamSees: false });
    });

    it('o user-B não aceita, registra, troca nem desfaz no plano do user-A', async () => {
      await expect(nutritionPlans.accept(owned.userB, p.planId)).rejects.toThrow(NotFoundException);
      await expect(nutritionPlans.logMeal(owned.userB, p.planMealId, {}, TZ)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        nutritionPlans.swap(owned.userB, { itemId: p.itemId, equivalentId: p.equivalentId }, TZ),
      ).rejects.toThrow(NotFoundException);
      await expect(nutritionPlans.undoSwap(owned.userB, p.swapId)).rejects.toThrow(
        NotFoundException,
      );
      // Nada mudou do lado do user-A.
      const swap = await prisma.nutritionSwap.findUniqueOrThrow({ where: { id: p.swapId } });
      expect(swap.undoneAt).toBeNull();
      expect(await prisma.nutritionPlanLog.count({ where: { planMealId: p.planMealId } })).toBe(0);
    });

    it('colega da mesma comunidade não envia plano ao user-A', async () => {
      await expect(
        nutritionPlans.send(owned.colega, p.membershipA, {
          goals: {
            kcalMin: 1,
            kcalMax: 2,
            proteinMinG: 1,
            proteinMaxG: 2,
            carbsMinG: 1,
            carbsMaxG: 2,
            fatMinG: 1,
            fatMaxG: 2,
          },
          meals: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('sem Alimentação liberada, a equipe não lê trocas nem aderência, e a recusa fica na trilha', async () => {
      await expect(
        studentView.read(owned.pro, p.membershipA, ShareScope.NUTRITION, 7),
      ).rejects.toThrow(NotFoundException);
      const ultima = await prisma.professionalAccessLog.findFirst({
        where: {
          subjectUserId: owned.userA,
          professionalId: owned.pro,
          scope: ShareScope.NUTRITION,
        },
        orderBy: { at: 'desc' },
      });
      expect(ultima).toMatchObject({ denied: true });
    });

    it('com Alimentação liberada, a leitura traz a troca e a aderência, sem o userId', async () => {
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: p.groupId,
        scopes: [ShareScope.NUTRITION],
      });
      const r = await studentView.read(owned.pro, p.membershipA, ShareScope.NUTRITION, 7);
      if (r.reading.scope !== ShareScope.NUTRITION) throw new Error('escopo errado');
      expect(r.reading.plan.plan).toMatchObject({ version: 1, status: 'ACCEPTED' });
      expect(r.reading.plan.swaps).toEqual([
        expect.objectContaining({ mealName: 'Café da manhã', grams: 40, undone: false }),
      ]);
      expect(r.reading.plan.adherence.days).toBe(7);
      expect(JSON.stringify(r)).not.toContain(owned.userA);
      const ultima = await prisma.professionalAccessLog.findFirst({
        where: {
          subjectUserId: owned.userA,
          professionalId: owned.pro,
          scope: ShareScope.NUTRITION,
        },
        orderBy: { at: 'desc' },
      });
      expect(ultima).toMatchObject({ denied: false, action: 'get_student_progress' });
    });

    it('o export do user-A leva o plano e a troca; o do user-B, nada disso', async () => {
      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
      );
      const deA = await conta.exportData(owned.userA);
      expect(deA.nutritionPlans.map((x) => x.id)).toContain(p.planId);
      const plano = deA.nutritionPlans.find((x) => x.id === p.planId)!;
      expect(plano.swaps.map((s) => s.id)).toEqual([p.swapId]);
      const deB = await conta.exportData(owned.userB);
      expect(deB.nutritionPlans).toEqual([]);
    });
  });

  describe('foto da refeição (#374, ADR 038)', () => {
    const studentView = new StudentViewService(
      prisma,
      access,
      plans,
      sessions,
      progress,
      nutritionSummary,
      goals,
      meals,
      nutritionPlans,
    );
    let fotoA = '';
    let fotoSoltaA = '';
    let refeicaoComFoto = '';

    const jpeg = () =>
      sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 9, g: 8, b: 7 } } })
        .jpeg()
        .toBuffer();

    beforeAll(async () => {
      fotoA = (await mealMedia.storePersonalImage(owned.userA, 'meal_photo', await jpeg()))!.id;
      fotoSoltaA = (await mealMedia.storePersonalImage(owned.userA, 'meal_photo', await jpeg()))!
        .id;
      const meal = await meals.create(owned.userA, {
        mealType: MealType.LUNCH,
        eatenAt: new Date().toISOString(),
        photoFileId: fotoA,
        items: [{ foodName: 'Prato feito', grams: 300, kcal: 600, source: 'AI' }],
      });
      refeicaoComFoto = meal.id;
    });

    afterEach(async () => {
      await prisma.professionalAccessLog.deleteMany({ where: { subjectUserId: owned.userA } });
      await prisma.professionalLink.deleteMany({ where: { subjectUserId: owned.userA } });
    });

    afterAll(async () => {
      await prisma.meal.deleteMany({ where: { id: refeicaoComFoto } });
      await prisma.mediaFile.deleteMany({ where: { id: { in: [fotoA, fotoSoltaA] } } });
    });

    it('o user-B não liga a foto do user-A a uma refeição dele', async () => {
      // A foto solta é a candidata perfeita: pronta e sem refeição. Só o dono
      // a liga; o id vindo do corpo não atravessa contas.
      // A refeição do B é gravada sem foto: o id alheio é ignorado, sem dizer
      // se o arquivo existe.
      const doB = await meals.create(owned.userB, {
        mealType: MealType.SNACK,
        eatenAt: new Date().toISOString(),
        photoFileId: fotoSoltaA,
        items: [{ foodName: 'Banana', grams: 100, kcal: 90 }],
      });
      expect(doB.hasPhoto).toBe(false);
      await prisma.meal.delete({ where: { id: doB.id } });
      const solta = await prisma.mediaFile.findUniqueOrThrow({
        where: { id: fotoSoltaA },
        include: { mealPhotoOf: true },
      });
      expect(solta.mealPhotoOf).toBeNull();
    });

    it('o user-B não lê a refeição com foto do user-A nem apaga só a foto', async () => {
      await expect(meals.findWithPhoto(owned.userB, refeicaoComFoto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(meals.deletePhoto(owned.userB, refeicaoComFoto)).rejects.toThrow(
        NotFoundException,
      );
      const arquivo = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fotoA } });
      expect(mealPhotoStore.objects.has(arquivo.key)).toBe(true);
      // A dona vê a foto, por URL assinada.
      const daDona = await meals.findWithPhoto(owned.userA, refeicaoComFoto);
      expect(daDona.hasPhoto).toBe(true);
      expect(daDona.photo?.url).toContain('memory://get/users/');
      expect(await meals.listPhotos(owned.userB, 30, TZ)).toEqual([]);
    });

    it('a equipe com Alimentação não vê as fotos; com Fotos das refeições vê, e fica na trilha', async () => {
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.NUTRITION],
      });
      await expect(
        studentView.read(owned.pro, owned.membershipA, ShareScope.MEAL_PHOTOS, 30),
      ).rejects.toThrow(NotFoundException);
      const nutricao = await studentView.read(
        owned.pro,
        owned.membershipA,
        ShareScope.NUTRITION,
        30,
      );
      // Os números de Alimentação não carregam foto nenhuma.
      expect(JSON.stringify(nutricao)).not.toContain('memory://');

      await prisma.professionalLink.deleteMany({ where: { subjectUserId: owned.userA } });
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.NUTRITION, ShareScope.MEAL_PHOTOS],
      });
      const fotos = await studentView.read(
        owned.pro,
        owned.membershipA,
        ShareScope.MEAL_PHOTOS,
        30,
      );
      if (fotos.reading.scope !== ShareScope.MEAL_PHOTOS) throw new Error('escopo errado');
      expect(fotos.reading.photos.map((p) => p.mealId)).toEqual([refeicaoComFoto]);

      const trilha = await prisma.professionalAccessLog.findMany({
        where: { subjectUserId: owned.userA, scope: ShareScope.MEAL_PHOTOS },
        select: { denied: true },
        orderBy: { at: 'asc' },
      });
      expect(trilha).toEqual([{ denied: true }, { denied: false }]);
    });
  });

  describe('treino #377: plano no início, sensação, respostas e resumo', () => {
    const studentView = new StudentViewService(
      prisma,
      access,
      plans,
      sessions,
      progress,
      nutritionSummary,
      goals,
      meals,
      nutritionPlans,
    );
    /** Treino terminado do user-A, com as respostas do fim. */
    let feitoA = '';

    beforeAll(async () => {
      const feito = await prisma.workoutSession.create({
        data: {
          userId: owned.userA,
          planId: owned.planId,
          startedAt: new Date(Date.now() - 5 * 86_400_000),
          completedAt: new Date(Date.now() - 5 * 86_400_000 + 3_600_000),
          feeling: 3,
        },
      });
      feitoA = feito.id;
      await sessions.saveCheckin(owned.userA, feitoA, {
        fatigue: 4,
        pain: true,
        painLocation: 'joelho',
      });
    });

    afterEach(async () => {
      await prisma.professionalAccessLog.deleteMany({ where: { subjectUserId: owned.userA } });
      await prisma.professionalLink.deleteMany({ where: { subjectUserId: owned.userA } });
    });

    it('start_workout_session com o plano do user-A no corpo recusa, sem abrir sessão', async () => {
      const antes = await prisma.workoutSession.count({ where: { userId: owned.userB } });
      await expect(sessions.start(owned.userB, { planId: owned.planId })).rejects.toThrow(
        NotFoundException,
      );
      expect(await prisma.workoutSession.count({ where: { userId: owned.userB } })).toBe(antes);
    });

    it('responder as perguntas na sessão do user-A recusa e não grava', async () => {
      await expect(
        sessions.saveCheckin(owned.userB, feitoA, { fatigue: 1, skipped: true }),
      ).rejects.toThrow(NotFoundException);
      expect(
        await prisma.workoutCheckin.findUnique({ where: { sessionId: feitoA } }),
      ).toMatchObject({ userId: owned.userA, fatigue: 4, skipped: false });
    });

    it('o resumo do treino do user-A não abre para o user-B', async () => {
      await expect(sessions.summary(owned.userB, feitoA)).rejects.toThrow(NotFoundException);
      // Caminho feliz: o dono vê as respostas, sem o userId na linha.
      const dono = await sessions.summary(owned.userA, feitoA);
      expect(dono.checkin).toMatchObject({ fatigue: 4, pain: true, painLocation: 'joelho' });
      expect(dono.checkin).not.toHaveProperty('userId');
    });

    it('os números do exercício são só os de quem pergunta', async () => {
      await expect(sets.exerciseStats(owned.userB, owned.customExerciseId)).rejects.toThrow(
        NotFoundException,
      );
      const deA = await sets.exerciseStats(owned.userA, owned.sharedExerciseId);
      expect(deA.record).toMatchObject({ weightKg: 60, reps: 8 });
      const deB = await sets.exerciseStats(owned.userB, owned.sharedExerciseId);
      expect(deB).toMatchObject({ record: null, last: null, estimated1RM: null });
    });

    it('série do user-A pela URL de uma sessão do user-B recusa', async () => {
      const deB = await prisma.workoutSession.create({
        data: { userId: owned.userB, startedAt: new Date(), completedAt: new Date() },
      });
      try {
        await expect(sets.update(owned.userB, owned.setId, { reps: 1 }, deB.id)).rejects.toThrow(
          NotFoundException,
        );
        await expect(sets.delete(owned.userB, owned.setId, deB.id)).rejects.toThrow(
          NotFoundException,
        );
        expect(await prisma.sessionSet.findUnique({ where: { id: owned.setId } })).toMatchObject({
          reps: 8,
        });
      } finally {
        await prisma.workoutSession.delete({ where: { id: deB.id } });
      }
    });

    it('a equipe lê as respostas só com Treino liberado, e a leitura fica na trilha', async () => {
      // Sem Treino: recusa (e a recusa também é registrada).
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.NUTRITION],
      });
      await expect(
        studentView.read(owned.pro, owned.membershipA, ShareScope.WORKOUT, 30),
      ).rejects.toThrow(NotFoundException);
      // A pergunta só aparece para quem tem Treino liberado.
      expect((await sessions.summary(owned.userA, feitoA)).questions).toBeNull();

      await prisma.professionalLink.deleteMany({ where: { subjectUserId: owned.userA } });
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.pro,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });
      const r = await studentView.read(owned.pro, owned.membershipA, ShareScope.WORKOUT, 30);
      if (r.reading.scope !== ShareScope.WORKOUT) throw new Error('escopo errado');
      const sessao = r.reading.sessions.find((x) => x.id === feitoA);
      expect(sessao?.checkin).toMatchObject({ fatigue: 4, pain: true, painLocation: 'joelho' });
      expect(sessao?.feeling).toBe(3);
      expect(JSON.stringify(r)).not.toContain(owned.userA);
      expect((await sessions.summary(owned.userA, feitoA)).questions?.items.length).toBe(2);

      const trilha = await prisma.professionalAccessLog.findMany({
        where: { subjectUserId: owned.userA, scope: ShareScope.WORKOUT },
        select: { denied: true, professionalId: true },
        orderBy: { at: 'asc' },
      });
      expect(trilha).toEqual([
        { denied: true, professionalId: owned.pro },
        { denied: false, professionalId: owned.pro },
      ]);

      // Colega da mesma academia não lê nada.
      await expect(
        studentView.read(owned.colega, owned.membershipA, ShareScope.WORKOUT, 30),
      ).rejects.toThrow(NotFoundException);
    });

    it('o export do user-A leva a sensação e as respostas; o do user-B, nada', async () => {
      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
      );
      const deA = await conta.exportData(owned.userA);
      const sessao = deA.workoutSessions.find((x) => x.id === feitoA);
      expect(sessao).toMatchObject({ feeling: 3, checkin: { fatigue: 4, pain: true } });
      const deB = await conta.exportData(owned.userB);
      expect(JSON.stringify(deB)).not.toContain(feitoA);
    });
  });

  describe('plano de treino recebido e agenda (#379)', () => {
    const offers = new PlanOfferService(
      prisma,
      new PlanMaterializerService(prisma, exercises),
      silentNotifications,
      plans,
    );
    const agenda = new AgendaService(prisma);
    const o = {
      groupId: '',
      membershipA: '',
      offerId: '',
      versionId: '',
      planId: '',
      sessionId: '',
    };

    beforeAll(async () => {
      const stamp = `oferta-${Date.now()}`;
      const grupo = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Treino do Pro',
          slug: `${stamp}-treino`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      o.groupId = grupo.id;
      o.membershipA = grupo.memberships.find((m) => m.userId === owned.userA)!.id;
      await prisma.professionalLink.createMany({
        data: [owned.userA, owned.userB].map((subjectUserId) => ({
          subjectUserId,
          professionalId: owned.pro,
          groupId: grupo.id,
          scopes: [ShareScope.WORKOUT],
        })),
      });
      const catalogo = await prisma.exercise.findFirstOrThrow({
        where: { createdByUserId: null, groupOwned: false },
        select: { id: true },
      });
      const doPro = await prisma.workoutPlan.create({
        data: {
          userId: owned.pro,
          name: 'Inferior',
          exercises: {
            create: [{ exerciseId: catalogo.id, order: 0, targetSets: 3, targetReps: '10' }],
          },
        },
      });
      const hoje = dateInTz(new Date(), TZ);
      const enviada = await offers.send(owned.pro, o.membershipA, {
        planId: doPro.id,
        schedule: 'CALENDAR',
        startDate: hoje,
        weeks: 1,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      });
      o.offerId = enviada.id;
      o.versionId = enviada.versionId;
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: o.groupId } });
    });

    it('o aluno B não vê, não aceita e não recusa a oferta do aluno A', async () => {
      expect(await offers.list(owned.userB)).toEqual({ pending: [], accepted: [] });
      await expect(offers.get(owned.userB, o.offerId)).rejects.toThrow(NotFoundException);
      await expect(offers.accept(owned.userB, o.offerId, o.versionId, TZ)).rejects.toThrow(
        NotFoundException,
      );
      await expect(offers.decline(owned.userB, o.offerId, o.versionId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(offers.undoDecline(owned.userB, o.offerId, o.versionId)).rejects.toThrow(
        NotFoundException,
      );
      expect((await offers.get(owned.userA, o.offerId)).shown.status).toBe('PENDING');
    });

    it('a agenda do aluno A não aparece para o B, e o B não remarca sessão do A', async () => {
      const aceita = await offers.accept(owned.userA, o.offerId, o.versionId, TZ);
      o.planId = aceita.planId!;
      const daA = await agenda.range(owned.userA, TZ);
      const sessao = daA.days.flatMap((d) => d.items).find((i) => i.kind === 'planned')!;
      o.sessionId = sessao.id;

      const daB = await agenda.range(owned.userB, TZ);
      expect(daB.days.flatMap((d) => d.items)).toEqual([]);
      await expect(
        agenda.reschedule(owned.userB, TZ, o.sessionId, dateInTz(new Date(), TZ)),
      ).rejects.toThrow(NotFoundException);
      // O plano criado pelo aceite é do A: o B não o lê.
      await expect(plans.findById(owned.userB, o.planId)).rejects.toThrow(NotFoundException);
    });

    it('o export do A leva a oferta, as versões e a agenda; o do B, nada disso', async () => {
      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
      );
      const deA = await conta.exportData(owned.userA);
      expect(deA.planOffers.map((x) => x.id)).toContain(o.offerId);
      expect(deA.planOffers.find((x) => x.id === o.offerId)?.versions).toHaveLength(1);
      expect(deA.plannedSessions.map((x) => x.id)).toContain(o.sessionId);
      const deB = await conta.exportData(owned.userB);
      expect(JSON.stringify(deB)).not.toContain(o.offerId);
      expect(JSON.stringify(deB)).not.toContain(o.sessionId);
    });
  });

  describe('enviar para alunos pela biblioteca (#405)', () => {
    const offers = new PlanOfferService(
      prisma,
      new PlanMaterializerService(prisma, exercises),
      silentNotifications,
      plans,
    );
    const sends = new PlanSendService(
      prisma,
      offers,
      new NutritionPlanService(
        prisma,
        new MealService(prisma),
        new DailyAdherenceService(prisma),
        new SharedWithService(prisma),
      ),
      silentNotifications,
      new ProfessionalAccessService(prisma, new AccessAuditService(prisma)),
    );
    const s = { groupId: '', outroGrupo: '', membershipA: '', membershipFora: '', templateId: '' };

    beforeAll(async () => {
      const stamp = `envio-${Date.now()}`;
      const grupo = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Biblioteca do Pro',
          slug: `${stamp}-bib`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      const outro = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Outra do Pro',
          slug: `${stamp}-outra`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      s.groupId = grupo.id;
      s.outroGrupo = outro.id;
      s.membershipA = grupo.memberships.find((m) => m.userId === owned.userA)!.id;
      s.membershipFora = outro.memberships.find((m) => m.userId === owned.userB)!.id;
      await prisma.professionalLink.createMany({
        data: [
          { subjectUserId: owned.userA, professionalId: owned.pro, groupId: grupo.id },
          { subjectUserId: owned.userB, professionalId: owned.pro, groupId: outro.id },
        ].map((l) => ({ ...l, scopes: [ShareScope.WORKOUT] })),
      });
      const catalogo = await prisma.exercise.findFirstOrThrow({
        where: { createdByUserId: null, groupOwned: false },
        select: { id: true },
      });
      const doPro = await prisma.workoutPlan.create({
        data: {
          userId: owned.pro,
          name: 'Inferior da biblioteca',
          exercises: {
            create: [{ exerciseId: catalogo.id, order: 0, targetSets: 3, targetReps: '10' }],
          },
        },
      });
      const snapshot = buildPlanSnapshot(await plans.findById(owned.pro, doPro.id));
      s.templateId = (
        await prisma.groupPlanTemplate.create({
          data: {
            groupId: grupo.id,
            authorId: owned.pro,
            kind: 'WORKOUT',
            title: 'Inferior da biblioteca',
            snapshot: snapshot as object,
            snapshotVersion: PLAN_SNAPSHOT_VERSION,
          },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: { in: [s.groupId, s.outroGrupo] } } });
    });

    it('um lote com alguém de outra comunidade não envia nada a ninguém', async () => {
      await expect(
        sends.send(owned.pro, s.groupId, {
          templateId: s.templateId,
          membershipIds: [s.membershipA, s.membershipFora],
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(await prisma.planOffer.count({ where: { groupId: s.groupId } })).toBe(0);
    });

    it('o aluno B não lê nem aceita a oferta que a biblioteca mandou ao A', async () => {
      const enviado = await sends.send(owned.pro, s.groupId, {
        templateId: s.templateId,
        membershipIds: [s.membershipA],
        schedule: 'FLEXIBLE',
      });
      await sends.send(owned.pro, s.groupId, {
        templateId: s.templateId,
        membershipIds: [s.membershipA],
        schedule: 'FLEXIBLE',
        changeNote: 'Subiu as séries.',
      });
      const id = enviado.results[0]!.id;
      const daA = await offers.get(owned.userA, id);
      expect(daA.shown).toMatchObject({ version: 2, changeNote: 'Subiu as séries.' });
      await expect(offers.get(owned.userB, id)).rejects.toThrow(NotFoundException);
      await expect(offers.accept(owned.userB, id, daA.shown.id, TZ)).rejects.toThrow(
        NotFoundException,
      );
      // O aluno não vê a lista de envios da equipe nem cancela o envio.
      await expect(sends.list(owned.userA, s.groupId)).rejects.toThrow();
      await expect(sends.revoke(owned.userB, s.groupId, id)).rejects.toThrow();

      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
      );
      const exportA = await conta.exportData(owned.userA);
      const oferta = exportA.planOffers.find((x) => x.id === id)!;
      expect(oferta.versions.map((v) => v.changeNote)).toEqual([null, 'Subiu as séries.']);
      expect(JSON.stringify(await conta.exportData(owned.userB))).not.toContain(id);
    });
  });

  describe('editor de plano e a cópia do aluno (#406)', () => {
    const offers = new PlanOfferService(
      prisma,
      new PlanMaterializerService(prisma, exercises),
      silentNotifications,
      plans,
    );
    const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
    const copies = new PlanCopyService(prisma, offers, access, silentNotifications);
    const content = new ContentService(
      prisma,
      plans,
      mealTemplates,
      userGoals,
      new PlanMaterializerService(prisma, exercises),
      new MediaService(prisma, new MemoryObjectStore()),
    );
    const s = {
      groupId: '',
      outroGrupo: '',
      membershipA: '',
      membershipB: '',
      membershipFora: '',
      offerA: '',
      offerFora: '',
      catalogo: 0,
      daOutra: 0,
      doB: 0,
    };
    const doc = (exerciseId: number) => ({
      sessions: [
        {
          name: 'A',
          weekday: 1,
          items: [{ type: 'exercise', exerciseId, targetSets: 3, targetReps: '10' }],
        },
        {
          name: 'B',
          weekday: 4,
          items: [{ type: 'exercise', exerciseId: s.catalogo, targetSets: 3, targetReps: '8-10' }],
        },
      ],
    });

    beforeAll(async () => {
      const stamp = `editor-${Date.now()}`;
      const grupo = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Editor do Pro',
          slug: `${stamp}-ed`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      const outro = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Outra do editor',
          slug: `${stamp}-outra`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      s.groupId = grupo.id;
      s.outroGrupo = outro.id;
      s.membershipA = grupo.memberships.find((m) => m.userId === owned.userA)!.id;
      s.membershipB = grupo.memberships.find((m) => m.userId === owned.userB)!.id;
      s.membershipFora = outro.memberships.find((m) => m.userId === owned.userB)!.id;
      await prisma.professionalLink.createMany({
        data: [
          { subjectUserId: owned.userA, professionalId: owned.pro, groupId: grupo.id },
          { subjectUserId: owned.userB, professionalId: owned.pro, groupId: outro.id },
        ].map((l) => ({ ...l, scopes: [ShareScope.WORKOUT] })),
      });
      s.catalogo = (
        await prisma.exercise.findFirstOrThrow({
          where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
          select: { id: true },
        })
      ).id;
      s.daOutra = (
        await prisma.exercise.create({
          data: {
            name: `Da outra ${stamp}`,
            muscleGroup: 'pernas',
            groupOwned: true,
            groupId: outro.id,
          },
        })
      ).id;
      s.doB = (
        await prisma.exercise.create({
          data: { name: `Do B ${stamp}`, muscleGroup: 'pernas', createdByUserId: owned.userB },
        })
      ).id;
      const tpl = await content.createWorkoutTemplate(owned.pro, grupo.id, {
        title: 'Editor A/B',
        document: doc(s.catalogo),
      });
      s.offerA = (
        await offers.sendToMember(owned.pro, grupo.id, s.membershipA, {
          templateId: tpl.id,
          schedule: 'FLEXIBLE',
        })
      ).id;
      const tplFora = await content.createWorkoutTemplate(owned.pro, outro.id, {
        title: 'Da outra',
        document: doc(s.catalogo),
      });
      s.offerFora = (
        await offers.sendToMember(owned.pro, outro.id, s.membershipFora, {
          templateId: tplFora.id,
          schedule: 'FLEXIBLE',
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: { in: [s.groupId, s.outroGrupo] } } });
      await prisma.exercise.deleteMany({ where: { id: { in: [s.daOutra, s.doB] } } });
    });

    it('o modelo não aceita exercício de outra comunidade nem de outra pessoa', async () => {
      for (const id of [s.daOutra, s.doB]) {
        await expect(
          content.createWorkoutTemplate(owned.pro, s.groupId, { title: 'X', document: doc(id) }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('a cópia só abre pela ficha da própria pessoa, nesta comunidade', async () => {
      // Oferta do A pela ficha do B; oferta da outra comunidade por esta.
      await expect(copies.get(owned.pro, s.groupId, s.membershipB, s.offerA)).rejects.toThrow(
        NotFoundException,
      );
      await expect(copies.get(owned.pro, s.groupId, s.membershipA, s.offerFora)).rejects.toThrow(
        NotFoundException,
      );
      await expect(copies.get(owned.pro, s.groupId, s.membershipFora, s.offerFora)).rejects.toThrow(
        NotFoundException,
      );
      // O B não tem vínculo com o pro nesta comunidade: nem a ficha dele abre a oferta.
      await expect(
        copies.save(owned.pro, s.groupId, s.membershipB, s.offerA, { document: doc(s.catalogo) }),
      ).rejects.toThrow(NotFoundException);
    });

    it('membro não edita a cópia de ninguém, nem a própria pelo painel', async () => {
      await expect(copies.get(owned.userA, s.groupId, s.membershipA, s.offerA)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        copies.save(owned.userB, s.groupId, s.membershipA, s.offerA, { document: doc(s.catalogo) }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('salvar a cópia com exercício de outra comunidade é 400 e não grava versão', async () => {
      const antes = await prisma.planOfferVersion.count({ where: { offerId: s.offerA } });
      await expect(
        copies.save(owned.pro, s.groupId, s.membershipA, s.offerA, { document: doc(s.daOutra) }),
      ).rejects.toThrow(BadRequestException);
      expect(await prisma.planOfferVersion.count({ where: { offerId: s.offerA } })).toBe(antes);
    });
  });

  describe('editor de plano alimentar e a cópia do aluno (#407)', () => {
    const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
    const nutriCopies = new NutritionCopyService(
      prisma,
      nutritionPlans,
      access,
      silentNotifications,
    );
    const content = new ContentService(
      prisma,
      plans,
      mealTemplates,
      userGoals,
      new PlanMaterializerService(prisma, exercises),
      new MediaService(prisma, new MemoryObjectStore()),
    );
    const s = {
      groupId: '',
      outroGrupo: '',
      membershipA: '',
      membershipB: '',
      membershipFora: '',
      planoA: '',
      planoFora: '',
      base: 0,
      doB: 0,
    };
    const doc = (foodId: number) => ({
      targets: { kcal: 2000, proteinG: 150, carbsG: 210, fatG: 60 },
      meals: [{ name: 'Almoço', options: [{ items: [{ foodId, grams: 100 }] }] }],
      groups: [],
    });

    beforeAll(async () => {
      const stamp = `nutri-ed-${Date.now()}`;
      const grupo = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Dieta do Pro',
          slug: `${stamp}-ed`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      const outro = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Outra da dieta',
          slug: `${stamp}-outra`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      s.groupId = grupo.id;
      s.outroGrupo = outro.id;
      s.membershipA = grupo.memberships.find((m) => m.userId === owned.userA)!.id;
      s.membershipB = grupo.memberships.find((m) => m.userId === owned.userB)!.id;
      s.membershipFora = outro.memberships.find((m) => m.userId === owned.userB)!.id;
      await prisma.professionalLink.createMany({
        data: [
          { subjectUserId: owned.userA, professionalId: owned.pro, groupId: grupo.id },
          { subjectUserId: owned.userB, professionalId: owned.pro, groupId: outro.id },
        ].map((l) => ({ ...l, scopes: [ShareScope.NUTRITION] })),
      });
      s.base = (
        await prisma.food.findFirstOrThrow({
          where: { createdByUserId: null, carbsPer100g: { gt: 0 } },
          select: { id: true },
        })
      ).id;
      s.doB = (
        await prisma.food.create({
          data: {
            name: `Do B ${stamp}`,
            searchName: `do b ${stamp}`,
            source: 'CUSTOM',
            createdByUserId: owned.userB,
            kcalPer100g: 100,
            proteinPer100g: 10,
            carbsPer100g: 10,
            fatPer100g: 1,
          },
        })
      ).id;
      const sends = new PlanSendService(
        prisma,
        {} as PlanOfferService,
        nutritionPlans,
        silentNotifications,
        access,
      );
      const tpl = await content.createNutritionTemplate(owned.pro, grupo.id, {
        title: 'Dieta A',
        document: doc(s.base),
      });
      s.planoA = (
        await sends.send(owned.pro, grupo.id, {
          templateId: tpl.id,
          membershipIds: [s.membershipA],
        })
      ).results[0]!.id;
      const tplFora = await content.createNutritionTemplate(owned.pro, outro.id, {
        title: 'Dieta da outra',
        document: doc(s.base),
      });
      s.planoFora = (
        await sends.send(owned.pro, outro.id, {
          templateId: tplFora.id,
          membershipIds: [s.membershipFora],
        })
      ).results[0]!.id;
    });

    afterAll(async () => {
      await prisma.nutritionPlan.deleteMany({ where: { id: { in: [s.planoA, s.planoFora] } } });
      await prisma.group.deleteMany({ where: { id: { in: [s.groupId, s.outroGrupo] } } });
      await prisma.food.deleteMany({ where: { id: s.doB } });
    });

    it('o modelo não aceita o alimento pessoal de outra pessoa (ADR 045)', async () => {
      await expect(
        content.createNutritionTemplate(owned.pro, s.groupId, {
          title: 'X',
          document: doc(s.doB),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('a cópia só abre pela ficha da própria pessoa, nesta comunidade', async () => {
      // Plano do A pela ficha do B; plano da outra comunidade por esta.
      await expect(nutriCopies.get(owned.pro, s.groupId, s.membershipB, s.planoA)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        nutriCopies.get(owned.pro, s.groupId, s.membershipA, s.planoFora),
      ).rejects.toThrow(NotFoundException);
      await expect(
        nutriCopies.get(owned.pro, s.groupId, s.membershipFora, s.planoFora),
      ).rejects.toThrow(NotFoundException);
      await expect(
        nutriCopies.save(owned.pro, s.groupId, s.membershipB, s.planoA, { document: doc(s.base) }),
      ).rejects.toThrow(NotFoundException);
    });

    it('membro não edita a cópia de ninguém, nem a própria pelo painel', async () => {
      await expect(
        nutriCopies.get(owned.userA, s.groupId, s.membershipA, s.planoA),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        nutriCopies.save(owned.userB, s.groupId, s.membershipA, s.planoA, {
          document: doc(s.base),
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('salvar a cópia com alimento pessoal de outra pessoa é 404 e não grava versão', async () => {
      const antes = await prisma.nutritionPlan.count({ where: { userId: owned.userA } });
      await expect(
        nutriCopies.save(owned.pro, s.groupId, s.membershipA, s.planoA, { document: doc(s.doB) }),
      ).rejects.toThrow(NotFoundException);
      expect(await prisma.nutritionPlan.count({ where: { userId: owned.userA } })).toBe(antes);
    });
  });

  describe('mural: bloqueios e votos (#394)', () => {
    const mural = new PostService(
      prisma,
      new MediaService(prisma, new MemoryObjectStore()),
      silentNotifications,
    );
    const bloqueios = new BlockService(prisma);
    const m = { groupId: '', otherGroupId: '', postB: '', pollPost: '', blockA: '' };

    beforeAll(async () => {
      const stamp = `mural394-${Date.now()}`;
      const criar = (nome: string, slug: string) =>
        prisma.group.create({
          data: {
            type: GroupType.SPONSORED,
            name: nome,
            slug: `${stamp}-${slug}`,
            ownerId: owned.pro,
            memberships: {
              create: [
                { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
                { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
                { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              ],
            },
          },
        });
      m.groupId = (await criar('Mural A', 'a')).id;
      m.otherGroupId = (await criar('Mural B', 'b')).id;
      m.postB = (await mural.create(owned.userB, m.groupId, { body: 'post do B' })).id;
      const enquete = await mural.create(owned.pro, m.groupId, {
        kind: 'POLL',
        poll: { question: 'Horário?', options: ['8h', '9h'], days: 2 },
      });
      m.pollPost = enquete.id;
      await mural.vote(owned.userA, m.groupId, enquete.id, enquete.poll!.options[0]!.id);
      m.blockA = (await bloqueios.block(owned.userA, { groupId: m.groupId, postId: m.postB })).id;
    });

    afterAll(async () => {
      await prisma.userBlock.deleteMany({ where: { id: m.blockA } });
      await prisma.group.deleteMany({ where: { id: { in: [m.groupId, m.otherGroupId] } } });
    });

    it('GET /users/me/blocks do B não mostra o bloqueio que o A fez, e o B não desfaz', async () => {
      expect((await bloqueios.list(owned.userA)).map((b) => b.id)).toEqual([m.blockA]);
      expect(await bloqueios.list(owned.userB)).toEqual([]);
      await expect(bloqueios.unblock(owned.userB, m.blockA)).rejects.toThrow(NotFoundException);
      await expect(bloqueios.unblock(owned.pro, m.blockA)).rejects.toThrow(NotFoundException);
    });

    it('o bloqueio vale nos dois sentidos e em outra comunidade', async () => {
      const emB = await mural.create(owned.userB, m.otherGroupId, { body: 'no outro mural' });
      const visto = await mural.list(owned.userA, m.otherGroupId);
      expect(visto.posts.map((p) => p.id)).not.toContain(emB.id);
      const doA = await mural.create(owned.userA, m.otherGroupId, { body: 'do A' });
      const peloB = await mural.list(owned.userB, m.otherGroupId);
      expect(peloB.posts.map((p) => p.id)).not.toContain(doA.id);
    });

    it('o voto do A não aparece para o B nem para a equipe', async () => {
      const peloB = await mural.get(owned.userB, m.groupId, m.pollPost);
      expect(peloB.poll!.myOptionId).toBeNull();
      expect(peloB.poll!.totalVotes).toBeNull();
      const painel = await mural.polls(owned.pro, m.groupId);
      expect(JSON.stringify(painel)).not.toContain(owned.userA);
      expect(painel[0]!.totalVotes).toBeNull();
    });

    it('o export do A leva o voto e o bloqueio dele; o do B, nenhum dos dois', async () => {
      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
      );
      const deA = await conta.exportData(owned.userA);
      expect(deA.blocks).toHaveLength(1);
      const votos = deA.communityMemberships.flatMap((x) => x.pollVotes);
      expect(votos).toEqual([expect.objectContaining({ option: { label: '8h' } })]);
      const deB = await conta.exportData(owned.userB);
      expect(deB.blocks).toEqual([]);
      expect(deB.communityMemberships.flatMap((x) => x.pollVotes)).toEqual([]);
    });
  });

  describe('plano e cobrança (#386)', () => {
    const cfg = {
      get: (k: string, padrao?: unknown) =>
        (({ AI_REQUIRES_PLAN: true, BILLING_PRO_TRIAL_DAYS: 7 }) as Record<string, unknown>)[k] ??
        padrao,
    } as never;
    const provedor = {
      ensurePersonCustomer: jest.fn(),
      createSubscription: jest.fn(),
      firstPaymentUrl: jest.fn(),
      cancelSubscription: jest.fn(async () => undefined),
      verifySubscriptionWebhook: jest.fn(),
    } as unknown as SubscriptionProvider;
    const direitos = new SubscriptionEntitlementsService(prisma, cfg);
    const assinaturas = new UserSubscriptionService(prisma, cfg, direitos, provedor);
    let subA: string;

    beforeAll(async () => {
      const sub = await prisma.userSubscription.create({
        data: {
          userId: owned.userA,
          source: 'ASAAS',
          status: 'PAST_DUE',
          interval: 'MONTHLY',
          paymentMethod: 'PIX',
          providerRef: `iso-386-${owned.userA}`,
          paymentUrl: 'https://www.asaas.com/i/pay_do_A',
          currentPeriodEnd: new Date(Date.now() - 2 * 86_400_000),
          graceEndsAt: new Date(Date.now() + 5 * 86_400_000),
        },
      });
      subA = sub.id;
      await prisma.billingReminder.create({
        data: { subscriptionId: subA, kind: 'GRACE_5_LEFT', dueDate: '2026-11-08' },
      });
    });

    afterAll(async () => {
      await prisma.userSubscription.deleteMany({ where: { id: subA } });
    });

    it('o plano, a forma de pagamento e o link de pagamento são só do dono', async () => {
      expect(await assinaturas.plan(owned.userA)).toMatchObject({
        state: 'PAST_DUE',
        paymentUrl: 'https://www.asaas.com/i/pay_do_A',
        paymentMethod: 'PIX',
      });
      const deB = await assinaturas.plan(owned.userB);
      expect(deB).toMatchObject({
        tier: 'FREE',
        state: 'FREE',
        paymentUrl: null,
        paymentMethod: null,
      });
      expect(JSON.stringify(deB)).not.toContain('pay_do_A');
    });

    it('o B não cancela a assinatura do A', async () => {
      await expect(assinaturas.cancel(owned.userB)).rejects.toBeInstanceOf(NotFoundException);
      expect(provedor.cancelSubscription).not.toHaveBeenCalled();
      expect(
        (await prisma.userSubscription.findUniqueOrThrow({ where: { id: subA } }))
          .cancelAtPeriodEnd,
      ).toBe(false);
    });

    it('o teste do A não tira o teste do B', async () => {
      await prisma.user.update({
        where: { id: owned.userA },
        data: { proTrialStartedAt: new Date() },
      });
      expect(await assinaturas.trialEligible(owned.userA)).toBe(false);
      expect(await assinaturas.trialEligible(owned.userB)).toBe(true);
    });

    it('o painel da comunidade vê só se o membro tem PRO pela comunidade, não como ele paga', async () => {
      // O user-B é dono da academia em que o A é membro; o A paga o próprio PRO.
      const lista = await memberships.listMembers(owned.userB, owned.groupId);
      const a = lista.find((m) => m.membershipId === owned.membershipA)!;
      expect(a.hasAiSeat).toBe(false);
      const texto = JSON.stringify(lista);
      for (const campo of ['paymentUrl', 'paymentMethod', 'source', 'interval', 'graceEndsAt']) {
        expect(texto).not.toContain(campo);
      }
      expect(texto).not.toContain('pay_do_A');
    });

    it('o export do A leva a assinatura e os avisos; o do B, nada disso', async () => {
      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
      );
      const deA = await conta.exportData(owned.userA);
      const sub = deA.subscriptions.find((x) => x.paymentMethod === 'PIX');
      expect(sub?.reminders).toEqual([expect.objectContaining({ kind: 'GRACE_5_LEFT' })]);
      expect(JSON.stringify(deA)).not.toContain('pay_do_A'); // link de cobrança não sai
      const deB = await conta.exportData(owned.userB);
      expect(JSON.stringify(deB)).not.toContain('GRACE_5_LEFT');
    });
  });

  describe('boas-vindas da comunidade (#410)', () => {
    const welcome = new WelcomeService(prisma);
    const pagina = {
      kind: 'PLAIN' as const,
      title: 'Combinados da casa',
      body: '- Traga toalha',
      showTeam: false,
    };

    beforeAll(async () => {
      await welcome.save(owned.userB, owned.groupId, {
        pages: [pagina],
        showOnJoin: true,
        published: true,
      });
    });

    it('o dono de outra comunidade não lê nem reescreve as páginas desta', async () => {
      // O pro é dono do grupo dele, não desta academia: lá ele edita, aqui não.
      await expect(welcome.editor(owned.userB, owned.grupoDoProId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        welcome.save(owned.userA, owned.grupoDoProId, {
          pages: [pagina],
          showOnJoin: true,
          published: true,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(welcome.forMember(owned.userA, owned.grupoDoProId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // Salvar no grupo do pro não toca as páginas da academia do user-B.
      await welcome.save(owned.pro, owned.grupoDoProId, {
        pages: [{ ...pagina, title: 'Do pro' }],
        showOnJoin: true,
        published: true,
      });
      const aqui = await welcome.forMember(owned.userA, owned.groupId);
      expect(aqui.pages.map((p) => p.title)).toEqual(['Combinados da casa']);
    });

    it('o aluno lê só o publicado e não edita', async () => {
      await expect(
        welcome.save(owned.userA, owned.groupId, {
          pages: [{ ...pagina, title: 'Invasão' }],
          showOnJoin: true,
          published: true,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(welcome.editor(owned.userA, owned.groupId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const lido = await welcome.forMember(owned.userA, owned.groupId);
      expect(lido.pages.map((p) => p.title)).toEqual(['Combinados da casa']);
      // A equipe que aparece é só nome e papel, sem colega.
      expect(lido.team.map((t) => t.role)).not.toContain('MEMBER');
    });
  });

  describe('comunidade: benefícios e a equipe vista pelo membro (#393)', () => {
    const benefits = new BenefitService(prisma, new MediaService(prisma, new MemoryObjectStore()));
    let benefitId: string;

    beforeAll(async () => {
      const b = await benefits.create(owned.userB, owned.groupId, {
        partnerName: 'Suplementa',
        discountText: '15% em suplementos',
        kind: 'COUPON',
        couponCode: 'ISO393',
        validUntil: '2099-12-31',
      });
      benefitId = b.id;
      // O pro olhou o treino da colega (com vínculo nesta academia).
      const link = await prisma.professionalLink.create({
        data: {
          subjectUserId: owned.colega,
          professionalId: owned.pro,
          groupId: owned.groupId,
          scopes: [ShareScope.WORKOUT],
        },
      });
      await prisma.professionalAccessLog.create({
        data: {
          linkId: link.id,
          professionalId: owned.pro,
          subjectUserId: owned.colega,
          scope: ShareScope.WORKOUT,
          action: 'iso_393',
        },
      });
    });

    it('o membro lê os benefícios da própria comunidade; quem é de fora, 404', async () => {
      expect(await benefits.listForMember(owned.userA, owned.groupId)).toEqual([
        expect.objectContaining({ id: benefitId, couponCode: 'ISO393' }),
      ]);
      // O user-A não está no grupo do pro.
      await expect(benefits.listForMember(owned.userA, owned.grupoDoProId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('o dono de outra comunidade não mexe no benefício pela URL da dele', async () => {
      await expect(
        benefits.update(owned.pro, owned.grupoDoProId, benefitId, { couponCode: 'ROUBO' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        benefits.remove(owned.pro, owned.grupoDoProId, benefitId),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Membro e profissional da própria academia também não administram.
      await expect(
        benefits.update(owned.userA, owned.groupId, benefitId, { couponCode: 'ROUBO' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(benefits.remove(owned.pro, owned.groupId, benefitId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const intacto = await prisma.groupPartnerBenefit.findUniqueOrThrow({
        where: { id: benefitId },
      });
      expect(intacto.couponCode).toBe('ISO393');
    });

    it('a equipe vista pelo user-A não traz colega nem o que olharam da colega', async () => {
      const equipe = await memberships.teamForMember(owned.userA, owned.groupId);
      const nomes = equipe.map((m) => m.role);
      expect(nomes).not.toContain('MEMBER');
      const pro = equipe.find((m) => m.role === 'PROFESSIONAL' && m.lastViewedAt !== null);
      expect(pro).toBeUndefined();
      // E o user-A não vê a equipe de uma comunidade em que não está.
      await expect(
        memberships.teamForMember(owned.userA, owned.grupoDoProId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('desafios: check-in com foto, sinalização e fila de revisão (#395)', () => {
    const checkinStore = new MemoryObjectStore();
    const checkinMedia = new MediaService(prisma, checkinStore);
    const scoreboard = new ScoreboardService(prisma, new DailyAdherenceService(prisma));
    const challenges = new ChallengeService(prisma, scoreboard, silentNotifications, checkinMedia);
    const checkins = new ChallengeCheckinService(
      prisma,
      challenges,
      checkinMedia,
      silentNotifications,
    );
    const ids = { desafio: '', outroDesafio: '', desafioDoPro: '', checkinA: '', fotoColega: '' };
    let cor = 0;

    async function foto(userId: string, groupId: string) {
      cor += 1;
      const body = await sharp({
        create: { width: 32, height: 32, channels: 3, background: { r: cor, g: 90, b: 40 } },
      })
        .jpeg()
        .toBuffer();
      const r = await checkinMedia.requestUpload(userId, {
        purpose: 'challenge_checkin',
        groupId,
        mime: 'image/jpeg',
        bytes: body.length,
      });
      const file = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
      checkinStore.upload(file.key, body, 'image/jpeg');
      await checkinMedia.confirm(userId, r.fileId);
      return r.fileId;
    }

    /** Treino de 50 min, terminado há 5 min, gravado ao começar. */
    async function treino(userId: string) {
      const fim = new Date(Date.now() - 5 * 60_000);
      const inicio = new Date(fim.getTime() - 50 * 60_000);
      return prisma.workoutSession.create({
        data: {
          userId,
          startedAt: inicio,
          completedAt: fim,
          createdAt: inicio,
          serverCompletedAt: fim,
        },
      });
    }

    /** Desafio de foto já em andamento (começou ontem). */
    async function emAndamento(autor: string, groupId: string) {
      const hoje = todayInTz(TZ);
      const c = await challenges.create(autor, groupId, {
        title: 'Iso 395',
        kind: 'PHOTO',
        startDate: hoje,
        endDate: addDaysIso(hoje, 5),
      });
      await prisma.groupChallenge.update({
        where: { id: c.id },
        data: { startsAt: dayBoundsInTz(addDaysIso(hoje, -1), TZ).start },
      });
      return c.id;
    }

    beforeAll(async () => {
      ids.desafio = await emAndamento(owned.userB, owned.groupId);
      ids.outroDesafio = await emAndamento(owned.userB, owned.groupId);
      ids.desafioDoPro = await emAndamento(owned.pro, owned.grupoDoProId);
      for (const id of [ids.desafio, ids.outroDesafio]) {
        await challenges.join(owned.userA, owned.groupId, id, 'Ana', { acceptPhotoTerms: true });
        await challenges.join(owned.colega, owned.groupId, id, 'Cola', {
          acceptPhotoTerms: true,
        });
      }
      await challenges.join(owned.userB, owned.grupoDoProId, ids.desafioDoPro, 'Bia', {
        acceptPhotoTerms: true,
      });
      await treino(owned.userA);
      await checkins.create(owned.userA, owned.groupId, ids.desafio, {
        photoFileId: await foto(owned.userA, owned.groupId),
      });
      ids.checkinA = (await prisma.challengeCheckin.findFirstOrThrow({
        where: { participant: { challengeId: ids.desafio, membership: { userId: owned.userA } } },
      }))!.id;
      ids.fotoColega = await foto(owned.colega, owned.groupId);
    });

    afterAll(async () => {
      await prisma.groupChallenge.deleteMany({
        where: { id: { in: [ids.desafio, ids.outroDesafio, ids.desafioDoPro] } },
      });
    });

    it('a foto de outra pessoa não vira o check-in de quem a pede', async () => {
      await treino(owned.userA);
      await expect(
        checkins.create(owned.userA, owned.groupId, ids.outroDesafio, {
          photoFileId: ids.fotoColega,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // A foto já usada pelo user-A também não serve de novo, nem em outro desafio.
      const usada = await prisma.challengeCheckin.findUniqueOrThrow({
        where: { id: ids.checkinA },
      });
      await expect(
        checkins.create(owned.userA, owned.groupId, ids.outroDesafio, {
          photoFileId: usada.photoFileId!,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a foto subida para outra comunidade não serve aqui, e o treino da colega não é do user-A', async () => {
      // O user-B sobe a foto para a academia dele e tenta usá-la no grupo do pro.
      const daAcademia = await foto(owned.userB, owned.groupId);
      await treino(owned.userB);
      await expect(
        checkins.create(owned.userB, owned.grupoDoProId, ids.desafioDoPro, {
          photoFileId: daAcademia,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      // O id do treino da colega no corpo: o servidor não o acha para o user-A.
      const daColega = await treino(owned.colega);
      const e = await checkins.eligibility(
        owned.userA,
        owned.groupId,
        ids.outroDesafio,
        daColega.id,
      );
      expect(e.workout?.id).not.toBe(daColega.id);
    });

    it('o membro não abre a fila de revisão, nem a do desafio', async () => {
      await expect(checkins.queue(owned.userA, owned.groupId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(checkins.queue(owned.colega, owned.groupId, ids.desafio)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // O dono de outra comunidade não lê a fila desta pelo id do desafio.
      await expect(
        checkins.queue(owned.pro, owned.grupoDoProId, ids.desafio),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sinalizar pela URL de outro desafio ou de outra comunidade não acha o check-in', async () => {
      await expect(
        checkins.flag(owned.colega, owned.groupId, ids.outroDesafio, ids.checkinA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        checkins.flag(owned.userB, owned.grupoDoProId, ids.desafioDoPro, ids.checkinA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await prisma.challengeCheckinFlag.count({ where: { checkinId: ids.checkinA } })).toBe(
        0,
      );
    });

    it('a equipe de outra comunidade não decide o check-in pela URL dela', async () => {
      await checkins.flag(owned.colega, owned.groupId, ids.desafio, ids.checkinA);
      await expect(
        checkins.resolve(owned.pro, owned.grupoDoProId, ids.desafioDoPro, ids.checkinA, {
          decision: 'void',
          reason: 'Foto de outra academia',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Nem pelo outro desafio da mesma academia.
      await expect(
        checkins.resolve(owned.pro, owned.groupId, ids.outroDesafio, ids.checkinA, {
          decision: 'void',
          reason: 'Desafio errado',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // E o membro não decide nem o do próprio desafio.
      await expect(
        checkins.resolve(owned.colega, owned.groupId, ids.desafio, ids.checkinA, {
          decision: 'void',
          reason: 'Não gostei',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const intacto = await prisma.challengeCheckin.findUniqueOrThrow({
        where: { id: ids.checkinA },
      });
      expect(intacto.status).toBe('FLAGGED');
      expect(intacto.photoFileId).not.toBeNull();
    });

    it('o export do user-A leva o check-in e a foto dele; o da colega, só o que ela fez', async () => {
      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
        [],
        checkinMedia,
      );
      const deA = await conta.exportData(owned.userA, { photoLinks: true });
      const naAcademia = deA.communityMemberships.find((m) => m.group.name === 'Academia B')!;
      const entrada = naAcademia.challengeEntries.find((e) => e.checkins.length > 0)!;
      expect(entrada).toMatchObject({
        challenge: { kind: 'PHOTO' },
        photoConsentVersion: expect.any(String),
      });
      expect(entrada.checkins).toEqual([
        expect.objectContaining({
          type: 'PHOTO',
          photo: expect.objectContaining({
            mime: expect.stringMatching(/^image\//),
            url: expect.any(String),
          }),
        }),
      ]);
      expect(JSON.stringify(entrada)).not.toContain(ids.checkinA);

      const daColega = await conta.exportData(owned.colega, { photoLinks: true });
      const dela = daColega.communityMemberships.flatMap((m) => m.challengeEntries);
      expect(dela.flatMap((e) => e.checkins)).toEqual([]);
      // A sinalização é dela (o que ela fez), sem a foto nem o nome de quem foi sinalizado.
      await prisma.challengeCheckinFlag.upsert({
        where: {
          checkinId_membershipId: {
            checkinId: ids.checkinA,
            membershipId: (await prisma.groupMembership.findFirstOrThrow({
              where: { groupId: owned.groupId, userId: owned.colega },
            }))!.id,
          },
        },
        create: {
          checkinId: ids.checkinA,
          membershipId: (await prisma.groupMembership.findFirstOrThrow({
            where: { groupId: owned.groupId, userId: owned.colega },
          }))!.id,
        },
        update: {},
      });
      const flags = (await conta.exportData(owned.colega)).communityMemberships.flatMap(
        (m) => m.checkinFlags,
      );
      expect(flags).toEqual([{ createdAt: expect.any(Date), challenge: 'Iso 395' }]);
      expect(JSON.stringify(flags)).not.toMatch(/Ana|image\/jpeg/);
    });

    it('a colega vê o dia do user-A, nunca a foto dele', async () => {
      const visto = await challenges.get(owned.colega, owned.groupId, ids.desafio);
      const itemDoA = visto.activity.filter((i) => !i.isMe);
      expect(itemDoA.length).toBeGreaterThan(0);
      expect(JSON.stringify(visto)).not.toMatch(/photoUrl":"/);
      const proprio = await challenges.get(owned.userA, owned.groupId, ids.desafio);
      expect(proprio.activity.some((i) => i.isMe && i.photoUrl)).toBe(true);
    });
  });

  describe('conteúdo da equipe: planos, dicas e guias (#396)', () => {
    const store = new MemoryObjectStore();
    const media = new MediaService(prisma, store);
    const content = new ContentService(
      prisma,
      plans,
      mealTemplates,
      userGoals,
      new PlanMaterializerService(prisma, exercises),
      media,
    );
    const guides = new GroupExerciseService(prisma, media);
    const c = {
      dono: '',
      membro: '',
      groupId: '',
      tipId: '',
      workoutId: '',
      nutritionId: '',
      exerciseId: 0,
      videoId: '',
    };

    /** Um arquivo pronto da comunidade, como se o envio tivesse terminado. */
    async function arquivo(purpose: string, kind: 'IMAGE' | 'VIDEO', mime: string) {
      const f = await prisma.mediaFile.create({
        data: {
          uploaderId: c.dono,
          groupId: c.groupId,
          purpose,
          kind,
          status: 'READY',
          key: `iso396/${randomUUID()}`,
          mime,
          bytes: 10,
          confirmedAt: new Date(),
        },
      });
      store.upload(f.key, Buffer.from('x'), mime);
      return f.id;
    }

    beforeAll(async () => {
      const stamp = `iso396-${Date.now()}`;
      const [dono, membro] = await Promise.all(
        ['dono', 'membro'].map((n) =>
          prisma.user.create({
            data: {
              logtoSub: `${stamp}-${n}`,
              email: `${stamp}-${n}@test.local`,
              name: n,
              timezone: TZ,
            },
          }),
        ),
      );
      c.dono = dono.id;
      c.membro = membro.id;
      // O user-A não está nesta academia: é o "de fora". Na dele (owned.groupId) é membro.
      const g = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Academia 396',
          slug: `${stamp}-academia`,
          ownerId: c.dono,
          memberships: {
            create: [
              { userId: c.dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: c.membro, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
      });
      c.groupId = g.id;

      const imagem = await arquivo('group_content', 'IMAGE', 'image/webp');
      const tip = await content.createTip(c.dono, c.groupId, {
        title: 'Água antes do treino',
        body: 'Beba 500 ml.',
        category: 'HABITS',
        imageFileId: imagem,
      });
      await content.setTipState(c.dono, c.groupId, tip.id, { published: true });
      c.tipId = tip.id;

      c.exerciseId = owned.sharedExerciseId;
      c.videoId = await arquivo('exercise_video', 'VIDEO', 'video/mp4');
      await guides.setGuide(c.dono, c.groupId, c.exerciseId, {
        videoFileId: c.videoId,
        tips: 'Máquina do fundo.',
      });

      const plano = await plans.create(c.dono, { name: 'Pernas e glúteos' });
      await plans.addExercise(c.dono, plano.id, { exerciseId: c.exerciseId, order: 0 });
      const treino = await content.createWorkoutTemplate(c.dono, c.groupId, { planId: plano.id });
      await content.setTemplatePublished(c.dono, c.groupId, treino.id, true);
      c.workoutId = treino.id;

      const refeicao = await prisma.mealTemplate.create({
        data: {
          userId: c.dono,
          name: 'Café 396',
          items: {
            create: [
              {
                position: 0,
                foodName: 'Aveia',
                grams: 40,
                kcal: 150,
                proteinG: 5,
                carbsG: 27,
                fatG: 3,
              },
            ],
          },
        },
      });
      const dieta = await content.createNutritionTemplate(c.dono, c.groupId, {
        title: 'Cutting 396',
        mealTemplateIds: [refeicao.id],
      });
      await content.setTemplatePublished(c.dono, c.groupId, dieta.id, true);
      c.nutritionId = dieta.id;
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: c.groupId } });
      await prisma.workoutPlan.deleteMany({ where: { userId: { in: [c.dono, c.membro] } } });
      await prisma.user.deleteMany({ where: { id: { in: [c.dono, c.membro] } } });
    });

    it('quem é de fora não lê dica, guia, equipamento nem plano (nem a mídia deles)', async () => {
      const fora = owned.userA;
      const tentativas = [
        content.listTipsForMember(fora, c.groupId),
        content.getTipForMember(fora, c.groupId, c.tipId),
        content.listTemplatesForMember(fora, c.groupId),
        content.getTemplateForMember(fora, c.groupId, c.workoutId),
        guides.listForMember(fora, c.groupId),
        guides.getForMember(fora, c.groupId, c.exerciseId),
        guides.equipmentForMember(fora, c.groupId),
        content.adopt(fora, c.groupId, c.workoutId),
      ];
      for (const t of tentativas) await expect(t).rejects.toBeInstanceOf(NotFoundException);
      expect(
        await prisma.workoutPlan.count({ where: { userId: fora, fromTemplateId: c.workoutId } }),
      ).toBe(0);
    });

    it('id de outra comunidade pela URL da própria comunidade não abre', async () => {
      // O user-A é membro ativo de owned.groupId; os ids são da Academia 396.
      await expect(
        content.getTipForMember(owned.userA, owned.groupId, c.tipId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        guides.getForMember(owned.userA, owned.groupId, c.exerciseId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        content.getTemplateForMember(owned.userA, owned.groupId, c.nutritionId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        content.adopt(owned.userA, owned.groupId, c.nutritionId, { applyGoals: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('o membro vê a mídia; depois de sair, perde a mídia e fica com as cópias', async () => {
      expect((await content.getTipForMember(c.membro, c.groupId, c.tipId)).image?.url).toBeTruthy();
      expect((await guides.getForMember(c.membro, c.groupId, c.exerciseId)).video?.id).toBe(
        c.videoId,
      );
      const treino = await content.adopt(c.membro, c.groupId, c.workoutId);
      const dieta = await content.adopt(c.membro, c.groupId, c.nutritionId, { saveMeals: true });
      expect(dieta.mealsSaved).toBe(1);

      await memberships.leave(c.membro, c.groupId);

      for (const t of [
        content.getTipForMember(c.membro, c.groupId, c.tipId),
        guides.getForMember(c.membro, c.groupId, c.exerciseId),
        content.listTemplatesForMember(c.membro, c.groupId),
      ]) {
        await expect(t).rejects.toBeInstanceOf(NotFoundException);
      }
      // A cópia é dela: sair não apaga o plano nem as refeições salvas.
      const plano = await plans.findById(c.membro, treino.planId!);
      expect(plano.name).toBe('Pernas e glúteos');
      expect(
        await prisma.mealTemplate.count({
          where: { userId: c.membro, fromTemplateId: c.nutritionId },
        }),
      ).toBe(1);
      // E o export LGPD leva as duas cópias, com a proveniência.
      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
      );
      const exportado = await conta.exportData(c.membro);
      expect(exportado.workoutPlans).toEqual([
        expect.objectContaining({ id: treino.planId, fromTemplateId: c.workoutId }),
      ]);
      expect(exportado.mealTemplates).toEqual([
        expect.objectContaining({ fromTemplateId: c.nutritionId }),
      ]);
    });
  });

  describe('painel base: visão geral, busca ⌘K e descadastro (#398)', () => {
    const panel = new PanelService(prisma);
    const p = {
      donoA: '',
      profA: '',
      anaA: '',
      saiuA: '',
      donoB: '',
      beaB: '',
      grupoA: '',
      grupoB: '',
    };

    beforeAll(async () => {
      const stamp = `iso398-${Date.now()}`;
      const nomes = ['Dono A', 'Prof A', 'Ana Alves', 'Ana Saiu', 'Dono B', 'Ana Bernardes'];
      const [donoA, profA, anaA, saiuA, donoB, beaB] = await Promise.all(
        nomes.map((name, i) =>
          prisma.user.create({
            data: {
              logtoSub: `${stamp}-${i}`,
              email: `${stamp}-${i}@test.local`,
              name,
              timezone: TZ,
            },
          }),
        ),
      );
      Object.assign(p, {
        donoA: donoA!.id,
        profA: profA!.id,
        anaA: anaA!.id,
        saiuA: saiuA!.id,
        donoB: donoB!.id,
        beaB: beaB!.id,
      });
      const a = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Academia A 398',
          slug: `${stamp}-a`,
          ownerId: p.donoA,
          memberships: {
            create: [
              { userId: p.donoA, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: p.profA, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
              { userId: p.anaA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              { userId: p.saiuA, role: GroupRole.MEMBER, status: MembershipStatus.LEFT },
            ],
          },
        },
      });
      const b = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Academia B 398',
          slug: `${stamp}-b`,
          ownerId: p.donoB,
          memberships: {
            create: [
              { userId: p.donoB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: p.beaB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
      });
      p.grupoA = a.id;
      p.grupoB = b.id;
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: b.id,
          kind: 'WORKOUT',
          title: 'Ana Plano B',
          snapshot: {},
          snapshotVersion: 1,
        },
      });
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: { in: [p.grupoA, p.grupoB] } } });
      await prisma.user.deleteMany({
        where: { id: { in: [p.donoA, p.profA, p.anaA, p.saiuA, p.donoB, p.beaB] } },
      });
    });

    it('a busca devolve só gente e planos da comunidade da URL, e só para quem tem papel nela', async () => {
      const r = await panel.search(p.donoA, p.grupoA, 'Ana');
      expect(r.members.map((m) => m.name)).toEqual(['Ana Alves']);
      expect(r.plans).toEqual([]);
      // O dono de B não busca dentro de A (nem descobre que A existe).
      await expect(panel.search(p.donoB, p.grupoA, 'Ana')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // Membro de A não busca em A.
      await expect(panel.search(p.anaA, p.grupoA, 'Ana')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Quem saiu não aparece.
      expect(JSON.stringify(r)).not.toContain('Ana Saiu');
    });

    it('visão geral e contadores de A não abrem para B, nem para o membro', async () => {
      await expect(panel.overview(p.donoB, p.grupoA, 30)).rejects.toBeInstanceOf(NotFoundException);
      await expect(panel.counts(p.donoB, p.grupoA)).rejects.toBeInstanceOf(NotFoundException);
      await expect(panel.overview(p.anaA, p.grupoA, 30)).rejects.toBeInstanceOf(ForbiddenException);
      const prof = await panel.overview(p.profA, p.grupoA, 30);
      expect(prof.aggregates).toBeNull();
      expect(prof.counts.pendingRequests).toBeNull();
    });

    it('o link de descadastro só mexe na pessoa que ele nomeia', async () => {
      const segredo = 'segredo-iso-398-0123456789abcdef';
      const mail = new AnnouncementEmailService(
        prisma,
        { enabled: true, send: async () => true } as never,
        { get: (k: string) => (k === 'EMAIL_UNSUBSCRIBE_SECRET' ? segredo : undefined) } as never,
      );
      await mail.setSubscribed(announcementUnsubscribeToken(p.anaA, segredo), false);
      const [ana, bea] = await Promise.all(
        [p.anaA, p.beaB].map((id) => prisma.user.findUniqueOrThrow({ where: { id } })),
      );
      expect(ana!.announcementEmailOptOutAt).not.toBeNull();
      expect(bea!.announcementEmailOptOutAt).toBeNull();
      await expect(
        mail.setSubscribed(announcementUnsubscribeToken(p.beaB, 'outro-segredo-0123456789'), false),
      ).rejects.toThrow();
    });
  });

  describe('membros, convites e ativação pendente (#401)', () => {
    const config401 = {
      get: (k: string) =>
        k === 'INVITE_LINK_SECRET' ? 'segredo-iso-401-com-variedade-0123' : 'https://fatia.test/',
    } as unknown as ConfigService;
    const seats401 = new SeatPoolService(prisma, config401, null);
    const invites401 = new InviteService(
      prisma,
      memberships,
      { send: async () => true } as never,
      config401,
      silentNotifications,
      seats401,
    );
    const admin401 = new MemberAdminService(prisma, seats401);
    const p = { donoA: '', profA: '', anaA: '', donoB: '', beaB: '', grupoA: '', grupoB: '' };
    const m = { profA: '', anaA: '', beaB: '' };
    let conviteA = '';
    let tokenA = '';

    beforeAll(async () => {
      const stamp = `iso401-${Date.now()}`;
      const nomes = ['Dono A', 'Prof A', 'Ana A', 'Dono B', 'Bea B'];
      const [donoA, profA, anaA, donoB, beaB] = await Promise.all(
        nomes.map((name, i) =>
          prisma.user.create({
            data: { logtoSub: `${stamp}-${i}`, email: `${stamp}-${i}@test.local`, name },
          }),
        ),
      );
      Object.assign(p, {
        donoA: donoA!.id,
        profA: profA!.id,
        anaA: anaA!.id,
        donoB: donoB!.id,
        beaB: beaB!.id,
      });
      const a = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Academia A 401',
          slug: `${stamp}-a`,
          ownerId: p.donoA,
          memberships: {
            create: [
              { userId: p.donoA, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: p.profA, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
              { userId: p.anaA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      const b = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Academia B 401',
          slug: `${stamp}-b`,
          ownerId: p.donoB,
          memberships: {
            create: [
              { userId: p.donoB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: p.beaB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      p.grupoA = a.id;
      p.grupoB = b.id;
      m.profA = a.memberships.find((x) => x.userId === p.profA)!.id;
      m.anaA = a.memberships.find((x) => x.userId === p.anaA)!.id;
      m.beaB = b.memberships.find((x) => x.userId === p.beaB)!.id;
      const c = await invites401.create(p.donoA, p.grupoA, {
        role: GroupRole.MEMBER,
        email: `${stamp}-convidada@test.local`,
      });
      conviteA = c.invite.id;
      tokenA = new URL(c.url).pathname.replace(/^\/c\//, '');
      await prisma.groupInvite.update({
        where: { id: conviteA },
        data: { createdAt: new Date(Date.now() - 5 * 86_400_000) },
      });
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: { in: [p.grupoA, p.grupoB] } } });
      await prisma.user.deleteMany({
        where: { id: { in: [p.donoA, p.profA, p.anaA, p.donoB, p.beaB] } },
      });
    });

    it('convites e ativação de A não abrem para o dono de B nem para o membro de A', async () => {
      await expect(invites401.overview(p.donoB, p.grupoA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(invites401.pending(p.donoB, p.grupoA, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(invites401.pending(p.anaA, p.grupoA, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const deB = await invites401.pending(p.donoB, p.grupoB, {});
      expect(JSON.stringify(deB)).not.toContain(conviteA);
    });

    it('id de convite de A pela URL de B: reenviar, renovar e gerar link não passam', async () => {
      const r = await invites401.resendMany(p.donoB, p.grupoB, [conviteA]);
      expect(r.sent).toEqual([]);
      expect(r.skipped).toEqual([{ id: conviteA, reason: 'not_found' }]);
      await expect(invites401.renew(p.donoB, p.grupoB, conviteA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(invites401.freshLink(p.donoB, p.grupoB, conviteA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const intacto = await prisma.groupInvite.findUniqueOrThrow({ where: { id: conviteA } });
      expect(intacto.sendCount).toBe(1);
    });

    it('só a conta do e-mail recusa o convite nominal', async () => {
      await expect(invites401.decline(p.beaB, tokenA)).rejects.toBeInstanceOf(NotFoundException);
      const c = await prisma.groupInvite.findUniqueOrThrow({ where: { id: conviteA } });
      expect(c.declinedAt).toBeNull();
    });

    it('acompanhar e ações em massa: membership de B pela URL de A não passa', async () => {
      await expect(
        admin401.setAccompaniedBy(p.donoA, p.grupoA, m.beaB, m.profA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        admin401.setAccompaniedBy(p.donoB, p.grupoB, m.beaB, m.profA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        admin401.bulk(p.donoB, p.grupoB, {
          action: 'accompany',
          membershipIds: [m.anaA],
          accompaniedByMembershipId: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        admin401.bulk(p.profA, p.grupoA, { action: 'unseat', membershipIds: [m.anaA] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const bea = await prisma.groupMembership.findUniqueOrThrow({ where: { id: m.beaB } });
      expect(bea.accompaniedById).toBeNull();
    });

    it('a lista de membros de A, com quem saiu, não abre para B', async () => {
      await expect(
        memberships.listMembers(p.donoB, p.grupoA, { includeLeft: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // O membro comum não vê quem saiu, nem a origem dos outros.
      const vista = await memberships.listMembers(p.anaA, p.grupoA, { includeLeft: true });
      expect(vista.every((x) => x.status === 'ACTIVE' || x.status === 'INVITED')).toBe(true);
      expect(vista.every((x) => x.joinedVia === undefined)).toBe(true);
    });
  });

  describe('ficha da pessoa no painel (#402)', () => {
    const fichaOffers = new PlanOfferService(
      prisma,
      new PlanMaterializerService(prisma, exercises),
      silentNotifications,
      plans,
    );
    const fichaNotes = new MemberNoteService(prisma);
    const ficha = new MemberFileService(prisma, access, nutritionSummary, progress, fichaNotes);
    const f = { g: '', h: '', aInG: '', bInG: '', aInH: '', tpl: '', offer: '', note: '' };

    beforeAll(async () => {
      const stamp = `ficha-${Date.now()}`;
      const g = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Ficha G',
          slug: `${stamp}-g`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      // Na H, o B é o dono e a A é membro: equipe de uma comunidade não lê a outra.
      const h = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Ficha H',
          slug: `${stamp}-h`,
          ownerId: owned.userB,
          memberships: {
            create: [
              { userId: owned.userB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      f.g = g.id;
      f.h = h.id;
      f.aInG = g.memberships.find((m) => m.userId === owned.userA)!.id;
      f.bInG = g.memberships.find((m) => m.userId === owned.userB)!.id;
      f.aInH = h.memberships.find((m) => m.userId === owned.userA)!.id;
      await prisma.professionalLink.create({
        data: {
          subjectUserId: owned.userA,
          professionalId: owned.pro,
          groupId: g.id,
          scopes: [ShareScope.WORKOUT],
        },
      });
      const catalogo = await prisma.exercise.findFirstOrThrow({
        where: { createdByUserId: null, groupOwned: false },
        select: { id: true },
      });
      f.tpl = (
        await prisma.groupPlanTemplate.create({
          data: {
            groupId: g.id,
            authorId: owned.pro,
            kind: 'WORKOUT',
            title: 'Modelo G',
            snapshot: {
              version: PLAN_SNAPSHOT_VERSION,
              name: 'Modelo G',
              exercises: [
                {
                  source: 'catalog',
                  catalogExerciseId: catalogo.id,
                  order: 0,
                  targetSets: 3,
                  targetReps: '10',
                },
              ],
            },
            snapshotVersion: PLAN_SNAPSHOT_VERSION,
          },
        })
      ).id;
      f.offer = (
        await fichaOffers.sendToMember(owned.pro, g.id, f.aInG, {
          templateId: f.tpl,
          schedule: 'FLEXIBLE',
        })
      ).id;
      f.note = (await fichaNotes.create(owned.pro, g.id, f.aInG, 'Nota da G')).id;
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: { in: [f.g, f.h] } } });
    });

    it('a ficha só abre com a associação da comunidade da URL e para quem é da equipe', async () => {
      // O dono da H usa o id da A na G com a URL da H, e o contrário.
      await expect(ficha.file(owned.userB, f.h, f.aInG)).rejects.toThrow(NotFoundException);
      await expect(ficha.file(owned.pro, f.g, f.aInH)).rejects.toThrow(NotFoundException);
      await expect(ficha.agenda(owned.userB, f.h, f.aInG)).rejects.toThrow(NotFoundException);
      // Na G o B é só membro.
      await expect(ficha.file(owned.userB, f.g, f.aInG)).rejects.toThrow(ForbiddenException);
    });

    it('a ficha da A na H não traz plano, nota nem trilha da G', async () => {
      const naH = await ficha.file(owned.userB, f.h, f.aInH);
      expect(naH.plans.workout).toEqual([]);
      expect(naH.notes).toEqual([]);
      expect(naH.grantedToMe).toEqual([]);
      expect(JSON.stringify(naH)).not.toContain(f.offer);
      expect(JSON.stringify(naH)).not.toContain('Nota da G');
      // A leitura da G (o pro abriu a ficha da A lá) não aparece no histórico da H.
      await ficha.file(owned.pro, f.g, f.aInG);
      // Na H só ficam as linhas do próprio B (a abertura e as negadas da H).
      const logH = (await ficha.file(owned.userB, f.h, f.aInH)).accessLog;
      expect(logH.length).toBeGreaterThan(0);
      expect(logH.every((l) => l.isMe)).toBe(true);
    });

    it('oferta e anotação da A não se mexem pela H nem pela associação do B', async () => {
      await expect(
        fichaOffers.removeForMember(owned.userB, f.h, f.aInH, f.offer, {
          notify: false,
          endToday: false,
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        fichaOffers.removeForMember(owned.pro, f.g, f.bInG, f.offer, {
          notify: false,
          endToday: false,
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        fichaOffers.reorderForMember(owned.userB, f.h, f.aInH, [f.offer]),
      ).rejects.toThrow(NotFoundException);
      await expect(fichaNotes.update(owned.userB, f.h, f.aInH, f.note, 'x')).rejects.toThrow(
        NotFoundException,
      );
      await expect(fichaNotes.remove(owned.pro, f.g, f.bInG, f.note)).rejects.toThrow(
        NotFoundException,
      );
      // Modelo da G não sai pela H.
      await expect(
        fichaOffers.sendToMember(owned.userB, f.h, f.aInH, {
          templateId: f.tpl,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(NotFoundException);
      // Sem vínculo, nem o dono manda plano.
      await expect(
        fichaOffers.sendToMember(owned.pro, f.g, f.bInG, {
          templateId: f.tpl,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(await prisma.planOffer.count({ where: { id: f.offer, removedAt: null } })).toBe(1);
      expect((await prisma.memberNote.findUniqueOrThrow({ where: { id: f.note } })).text).toBe(
        'Nota da G',
      );
    });

    it('as notas da A só ela lê; o B não lê, nem pela comunidade dele', async () => {
      expect((await fichaNotes.mine(owned.userA, f.g)).map((n) => n.id)).toEqual([f.note]);
      expect(await fichaNotes.mine(owned.userB, f.g)).toEqual([]);
      expect(await fichaNotes.mine(owned.userB, f.h)).toEqual([]);
    });

    it('a ordem dos planos é de cada um: o B não reordena plano da A', async () => {
      const daA = await prisma.workoutPlan.create({
        data: { userId: owned.userA, name: 'Plano da A (#402)' },
      });
      await expect(plans.reorder(owned.userB, [daA.id])).rejects.toThrow(NotFoundException);
      expect((await plans.order(owned.userB)).planIds).not.toContain(daA.id);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: owned.userA } })).plansOrderedAt,
      ).toBeNull();
      await prisma.workoutPlan.delete({ where: { id: daA.id } });
    });
  });

  describe('para revisar, em risco e sessão feita (#399)', () => {
    const fila = new ReviewService(prisma, access, sessions, silentNotifications);
    const r = { g: '', h: '', sessA: '', sessB: '', metaA: '' };

    beforeAll(async () => {
      const stamp = `revisar-${Date.now()}`;
      // Na G o pro é dono e A e B são membros; a A dá Treino e Metas ao pro.
      const g = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Revisar G',
          slug: `${stamp}-g`,
          ownerId: owned.pro,
          memberships: {
            create: [
              { userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
              { userId: owned.userB, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
      });
      // Na H o B é o dono e a A é membro, sem vínculo com ele.
      const h = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Revisar H',
          slug: `${stamp}-h`,
          ownerId: owned.userB,
          memberships: {
            create: [
              { userId: owned.userB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: owned.userA, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            ],
          },
        },
      });
      r.g = g.id;
      r.h = h.id;
      await prisma.professionalLink.create({
        data: {
          subjectUserId: owned.userA,
          professionalId: owned.pro,
          groupId: g.id,
          scopes: [ShareScope.WORKOUT, ShareScope.GOALS],
        },
      });
      const fim = new Date(Date.now() - 3_600_000);
      r.sessA = (
        await prisma.workoutSession.create({
          data: {
            userId: owned.userA,
            startedAt: new Date(fim.getTime() - 3_600_000),
            completedAt: fim,
          },
        })
      ).id;
      r.sessB = (
        await prisma.workoutSession.create({
          data: {
            userId: owned.userB,
            startedAt: new Date(fim.getTime() - 3_600_000),
            completedAt: fim,
          },
        })
      ).id;
      r.metaA = (
        await prisma.goal.create({
          data: {
            userId: owned.userA,
            kind: 'custom',
            title: 'Meta da A (#399)',
            startValue: 0,
            targetValue: 1,
            unit: 'x',
            status: 'completed',
            completedAt: fim,
          },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.workoutSession.deleteMany({ where: { id: { in: [r.sessA, r.sessB] } } });
      await prisma.goal.deleteMany({ where: { id: r.metaA } });
      await prisma.group.deleteMany({ where: { id: { in: [r.g, r.h] } } });
    });

    it('a fila e o em risco do dono da H não trazem nada da A, que não deu vínculo a ele', async () => {
      const q = await fila.queue(owned.userB, r.h);
      expect(JSON.stringify(q)).not.toContain(r.sessA);
      expect(JSON.stringify(q)).not.toContain(r.metaA);
      expect((await fila.atRisk(owned.userB, r.h)).rows).toEqual([]);
      // Na G, o B é só membro: nem abre.
      await expect(fila.queue(owned.userB, r.g)).rejects.toThrow(ForbiddenException);
      await expect(fila.atRisk(owned.userB, r.g)).rejects.toThrow(ForbiddenException);
    });

    it('a fila do pro traz a A (com vínculo) e nunca o B (sem vínculo)', async () => {
      const q = await fila.queue(owned.pro, r.g);
      const refs = q.items.map((i) => i.refId);
      expect(refs).toEqual(expect.arrayContaining([r.sessA, r.metaA]));
      expect(refs).not.toContain(r.sessB);
      const risco = await fila.atRisk(owned.pro, r.g);
      expect(JSON.stringify(risco)).not.toContain(owned.userB);
    });

    it('a sessão e o comentário só pela comunidade da URL e com Treino liberado', async () => {
      // O dono da H usa o id da sessão da A com a URL da H: sem vínculo, nada de detalhe.
      expect((await fila.session(owned.userB, r.h, r.sessA)).shared).toBe(false);
      await expect(
        fila.sendFeedback(owned.userB, r.h, r.sessA, { reaction: 'CLAP' }),
      ).rejects.toThrow(NotFoundException);
      // O pro não abre a sessão do B (sem vínculo) nem a da A pela H.
      expect((await fila.session(owned.pro, r.g, r.sessB)).shared).toBe(false);
      await expect(fila.session(owned.pro, r.h, r.sessA)).rejects.toThrow(NotFoundException);
      await expect(fila.sendFeedback(owned.pro, r.g, r.sessB, { body: 'oi' })).rejects.toThrow(
        NotFoundException,
      );
      expect(
        await prisma.sessionFeedback.count({ where: { sessionId: { in: [r.sessA, r.sessB] } } }),
      ).toBe(0);
    });

    it('"visto" não marca item de outra pessoa nem pela comunidade errada', async () => {
      await expect(fila.markSeen(owned.userB, r.h, 'WORKOUT', r.sessA)).rejects.toThrow(
        NotFoundException,
      );
      await expect(fila.markSeen(owned.userB, r.h, 'GOAL', r.metaA)).rejects.toThrow(
        NotFoundException,
      );
      await expect(fila.markSeen(owned.pro, r.g, 'WORKOUT', r.sessB)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        await prisma.reviewSeen.count({ where: { refId: { in: [r.sessA, r.sessB, r.metaA] } } }),
      ).toBe(0);
    });

    it('o comentário na sessão da A só a A lê', async () => {
      await fila.sendFeedback(owned.pro, r.g, r.sessA, { body: 'Boa (#399)' });
      expect((await sessions.summary(owned.userA, r.sessA)).feedback).toHaveLength(1);
      await expect(sessions.summary(owned.userB, r.sessA)).rejects.toThrow(NotFoundException);
      await expect(sessions.findById(owned.userB, r.sessA)).rejects.toThrow(NotFoundException);
    });
  });

  describe('relatório do mês e origens dos convites (#400)', () => {
    const relatorio = new ReportService(prisma);
    const r = { a: '', b: '', profB: '' };

    beforeAll(async () => {
      const stamp = `relatorio-${Date.now()}`;
      // A é a comunidade do pro; B é a do user-B, com uma profissional (a própria A).
      const a = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Relatório A',
          slug: `${stamp}-a`,
          ownerId: owned.pro,
          memberships: {
            create: [{ userId: owned.pro, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE }],
          },
        },
      });
      const b = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Relatório B',
          slug: `${stamp}-b`,
          ownerId: owned.userB,
          weeklySessionsGoal: 50,
          memberships: {
            create: [
              { userId: owned.userB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              {
                userId: owned.userA,
                role: GroupRole.PROFESSIONAL,
                status: MembershipStatus.ACTIVE,
              },
            ],
          },
        },
      });
      r.a = a.id;
      r.b = b.id;
      r.profB = (
        await prisma.groupMembership.findUniqueOrThrow({
          where: { groupId_userId: { groupId: b.id, userId: owned.userA } },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: { in: [r.a, r.b] } } });
    });

    it('o dono de A não lê o relatório, as origens nem as configurações de B', async () => {
      await expect(relatorio.report(owned.pro, r.b)).rejects.toThrow(NotFoundException);
      await expect(relatorio.origins(owned.pro, r.b, 30)).rejects.toThrow(NotFoundException);
      await expect(relatorio.settings(owned.pro, r.b)).rejects.toThrow(NotFoundException);
      await expect(
        relatorio.updateSettings(owned.pro, r.b, { weeklySessionsGoal: 1 }),
      ).rejects.toThrow(NotFoundException);
      // A profissional de B também não: o relatório é do dono.
      await expect(relatorio.report(owned.userA, r.b)).rejects.toThrow(ForbiddenException);
      const g = await prisma.group.findUniqueOrThrow({ where: { id: r.b } });
      expect(g.weeklySessionsGoal).toBe(50);
    });

    it('a pessoa da equipe de B não é marcada pela URL de A', async () => {
      await expect(relatorio.setRecipient(owned.pro, r.a, r.profB, true)).rejects.toThrow(
        NotFoundException,
      );
      const m = await prisma.groupMembership.findUniqueOrThrow({ where: { id: r.profB } });
      expect(m.reportEmail).toBe(false);
      const meu = await relatorio.settings(owned.pro, r.a);
      expect(meu.team.map((t) => t.membershipId)).not.toContain(r.profB);
    });
  });

  describe('equipe, papéis e permissões (#404)', () => {
    const team404 = new TeamService(prisma, links);
    const panel404 = new PanelService(prisma);
    const t = {
      donoA: '',
      admA: '',
      recA: '',
      profA: '',
      anaA: '',
      donoB: '',
      profB: '',
      a: '',
      b: '',
    };
    const mm = { donoA: '', admA: '', recA: '', profA: '', anaA: '', profB: '' };

    beforeAll(async () => {
      const stamp = `iso404-${Date.now()}`;
      const nomes = ['Dono A', 'Admin A', 'Recepção A', 'Prof A', 'Ana A', 'Dono B', 'Prof B'];
      const [donoA, admA, recA, profA, anaA, donoB, profB] = await Promise.all(
        nomes.map((name, i) =>
          prisma.user.create({
            data: { logtoSub: `${stamp}-${i}`, email: `${stamp}-${i}@test.local`, name },
          }),
        ),
      );
      Object.assign(t, {
        donoA: donoA!.id,
        admA: admA!.id,
        recA: recA!.id,
        profA: profA!.id,
        anaA: anaA!.id,
        donoB: donoB!.id,
        profB: profB!.id,
      });
      const a = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Academia A 404',
          slug: `${stamp}-a`,
          ownerId: t.donoA,
          memberships: {
            create: [
              { userId: t.donoA, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: t.admA, role: 'ADMIN' as GroupRole, status: MembershipStatus.ACTIVE },
              { userId: t.recA, role: 'RECEPTION' as GroupRole, status: MembershipStatus.ACTIVE },
              { userId: t.profA, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
              {
                userId: t.anaA,
                role: GroupRole.MEMBER,
                status: MembershipStatus.ACTIVE,
                consentScopes: Object.values(ShareScope),
              },
            ],
          },
        },
        include: { memberships: true },
      });
      const b = await prisma.group.create({
        data: {
          type: GroupType.SPONSORED,
          name: 'Academia B 404',
          slug: `${stamp}-b`,
          ownerId: t.donoB,
          memberships: {
            create: [
              { userId: t.donoB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
              { userId: t.profB, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
            ],
          },
        },
        include: { memberships: true },
      });
      t.a = a.id;
      t.b = b.id;
      const id = (g: typeof a, u: string) => g.memberships.find((x) => x.userId === u)!.id;
      Object.assign(mm, {
        donoA: id(a, t.donoA),
        admA: id(a, t.admA),
        recA: id(a, t.recA),
        profA: id(a, t.profA),
        anaA: id(a, t.anaA),
        profB: id(b, t.profB),
      });
      // Um vínculo "esquecido" com a recepção e o administrador: a porta barra assim mesmo.
      await prisma.professionalLink.createMany({
        data: [t.recA, t.admA, t.profA].map((professionalId) => ({
          subjectUserId: t.anaA,
          professionalId,
          groupId: t.a,
          scopes: Object.values(ShareScope),
        })),
      });
    });

    it('o administrador não se promove a dono nem promove alguém a administrador', async () => {
      await expect(
        memberships.changeRole(t.admA, t.a, mm.admA, GroupRole.PROFESSIONAL),
      ).rejects.toThrow(ForbiddenException);
      await expect(memberships.changeRole(t.admA, t.a, mm.profA, 'ADMIN' as never)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        memberships.changeRole(t.admA, t.a, mm.profA, GroupRole.OWNER as never),
      ).rejects.toThrow();
      await expect(groups.transferOwnership(t.admA, t.a, mm.admA)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(memberships.ban(t.admA, t.a, mm.donoA)).rejects.toThrow(ConflictException);
      const eu = await prisma.groupMembership.findUniqueOrThrow({ where: { id: mm.admA } });
      expect(eu.role).toBe('ADMIN');
      const prof = await prisma.groupMembership.findUniqueOrThrow({ where: { id: mm.profA } });
      expect(prof.role).toBe(GroupRole.PROFESSIONAL);
    });

    it('papel e especialidade não mudam em outra comunidade pela URL desta', async () => {
      await expect(
        memberships.changeRole(t.donoA, t.a, mm.profB, GroupRole.MEMBER),
      ).rejects.toThrow(NotFoundException);
      await expect(memberships.changeRole(t.admA, t.a, mm.profB, GroupRole.MEMBER)).rejects.toThrow(
        NotFoundException,
      );
      await expect(team404.setSpecialty(t.donoA, t.a, mm.profB, 'NUTRITION')).rejects.toThrow(
        NotFoundException,
      );
      // O dono de B não troca papel em A, nem pela URL de B.
      await expect(
        memberships.changeRole(t.donoB, t.a, mm.profA, GroupRole.MEMBER),
      ).rejects.toThrow(NotFoundException);
      await expect(
        memberships.changeRole(t.donoB, t.b, mm.profA, GroupRole.MEMBER),
      ).rejects.toThrow(NotFoundException);
      const pb = await prisma.groupMembership.findUniqueOrThrow({ where: { id: mm.profB } });
      expect(pb.role).toBe(GroupRole.PROFESSIONAL);
      expect(pb.specialty).toBeNull();
    });

    it('recepção e administrador não leem dado de aluno, nem com vínculo', async () => {
      for (const quem of [t.recA, t.admA]) {
        for (const scope of Object.values(ShareScope)) {
          await expect(access.assertReadable(quem, mm.anaA, scope, 'iso_404')).rejects.toThrow(
            NotFoundException,
          );
        }
      }
      expect(
        await prisma.professionalAccessLog.count({
          where: { subjectUserId: t.anaA, professionalId: { in: [t.recA, t.admA] }, denied: true },
        }),
      ).toBe(Object.values(ShareScope).length * 2);
    });

    it('a recepção vê só nome, papel e situação, e não busca planos', async () => {
      const lista = await memberships.listMembers(t.recA, t.a);
      const ana = lista.find((x) => x.membershipId === mm.anaA)!;
      expect(ana.scopesGrantedToMe).toBeUndefined();
      expect(ana.whatsapp).toBeUndefined();
      expect(ana.accompaniedBy).toBeUndefined();
      const busca = await panel404.search(t.recA, t.a, 'Ana');
      expect(busca.members.map((x) => Object.keys(x).sort())).toEqual([
        ['membershipId', 'name', 'role', 'status'],
      ]);
    });

    it('a equipe de outra comunidade não lista a equipe desta', async () => {
      await expect(team404.staff(t.donoB, t.a)).rejects.toThrow(NotFoundException);
      await expect(team404.staff(t.recA, t.a)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('catálogo da equipe, favorito e guia da casa (#408)', () => {
    const store = new MemoryObjectStore();
    const media = new MediaService(prisma, store);
    const catalog408 = new GroupExerciseService(prisma, media);
    const k = { a: '', b: '', donoA: '', profA: '', membroA: '', donoB: '', membroB: '' };
    let daB = 0;
    let videoB = '';
    let geral = 0;

    beforeAll(async () => {
      const stamp = `iso408-${Date.now()}`;
      const [donoA, profA, membroA, donoB, membroB] = await Promise.all(
        ['donoA', 'profA', 'membroA', 'donoB', 'membroB'].map((n) =>
          prisma.user.create({
            data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: n },
          }),
        ),
      );
      Object.assign(k, {
        donoA: donoA.id,
        profA: profA.id,
        membroA: membroA.id,
        donoB: donoB.id,
        membroB: membroB.id,
      });
      const grupo = (nome: string, dono: string, outros: [string, GroupRole][]) =>
        prisma.group.create({
          data: {
            type: GroupType.SPONSORED,
            name: nome,
            slug: `${stamp}-${nome}`,
            ownerId: dono,
            memberships: {
              create: [
                { userId: dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
                ...outros.map(([userId, role]) => ({
                  userId,
                  role,
                  status: MembershipStatus.ACTIVE,
                })),
              ],
            },
          },
        });
      k.a = (
        await grupo('a', k.donoA, [
          [k.profA, GroupRole.PROFESSIONAL],
          [k.membroA, GroupRole.MEMBER],
        ])
      ).id;
      k.b = (await grupo('b', k.donoB, [[k.membroB, GroupRole.MEMBER]])).id;
      daB = (
        await catalog408.create(k.donoB, k.b, {
          name: `Máquina secreta ${stamp}`,
          muscleGroup: 'pernas',
          instructions: ['Segredo da B.'],
        })
      ).exerciseId;
      const f = await prisma.mediaFile.create({
        data: {
          uploaderId: k.donoB,
          groupId: k.b,
          purpose: 'exercise_video',
          kind: 'VIDEO',
          status: 'READY',
          key: `iso408/${randomUUID()}`,
          mime: 'video/mp4',
          bytes: 10,
          confirmedAt: new Date(),
        },
      });
      videoB = f.id;
      geral = (
        await prisma.exercise.findFirstOrThrow({
          where: { createdByUserId: null, groupOwned: false },
          select: { id: true },
          orderBy: { id: 'asc' },
        })
      ).id;
      await catalog408.setGuide(k.donoB, k.b, geral, {
        steps: ['Passo só da B.'],
        commonMistakes: ['Erro só da B.'],
        homeFriendly: true,
      });
      await catalog408.setFavorite(k.donoB, k.b, geral, true);
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: { in: [k.a, k.b] } } });
      await prisma.exercise.deleteMany({ where: { id: daB } });
      await prisma.user.deleteMany({
        where: { id: { in: [k.donoA, k.profA, k.membroA, k.donoB, k.membroB] } },
      });
    });

    it('a equipe de A não acha, abre, favorita, duplica nem grava guia no exercício da B', async () => {
      const lista = await catalog408.listForTeam(k.profA, k.a, { limit: 200, q: 'secreta' });
      expect(lista.items.map((i) => i.exerciseId)).not.toContain(daB);
      await expect(catalog408.getForTeam(k.profA, k.a, daB)).rejects.toThrow(NotFoundException);
      await expect(catalog408.setFavorite(k.profA, k.a, daB, true)).rejects.toThrow(
        NotFoundException,
      );
      await expect(catalog408.duplicate(k.profA, k.a, daB)).rejects.toThrow(NotFoundException);
      await expect(catalog408.setGuide(k.profA, k.a, daB, { steps: ['x'] })).rejects.toThrow(
        NotFoundException,
      );
      expect(await prisma.groupExerciseFavorite.count({ where: { groupId: k.a } })).toBe(0);
    });

    it('o vídeo da B não entra no guia de A', async () => {
      await expect(
        catalog408.setGuide(k.profA, k.a, geral, { videoFileId: videoB }),
      ).rejects.toThrow(NotFoundException);
    });

    it('o favorito, o selo e os passos da B não aparecem para A', async () => {
      const a = await catalog408.getForTeam(k.profA, k.a, geral);
      expect(a).toMatchObject({ favorite: false, homeFriendly: false, steps: [], hasGuide: false });
      const favs = await catalog408.listForTeam(k.profA, k.a, { favorite: true });
      expect(favs.items).toEqual([]);
      const casa = await catalog408.listForTeam(k.profA, k.a, { house: true });
      expect(casa.items).toEqual([]);
      // O membro de A, no detalhe do exercício, não vê o guia da B.
      const detalhe = await exercises.getWithMedia(k.membroA, geral);
      expect(detalhe.community).toBeNull();
      expect(JSON.stringify(await exercises.explainForm(k.membroA, 'a'))).not.toContain(
        'Passo só da B.',
      );
    });

    it('só a equipe abre o catálogo e mexe nele; quem é de fora nem sabe que existe', async () => {
      await expect(catalog408.listForTeam(k.membroA, k.a, {})).rejects.toThrow(ForbiddenException);
      await expect(catalog408.setFavorite(k.membroA, k.a, geral, true)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(catalog408.listForTeam(k.donoB, k.a, {})).rejects.toThrow(NotFoundException);
      await expect(catalog408.setFavorite(k.donoB, k.a, geral, true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('configurações, chaves de API e novidades do painel (#413)', () => {
    const store = new MemoryObjectStore();
    const media = new MediaService(prisma, store);
    const groups413 = new GroupService(prisma, new ProfessionalLinkService(prisma), [], media);
    const keys = new ApiKeyService(prisma);
    const reads = new IntegrationReadService(prisma);
    const you413 = new YouService(prisma);
    const k = { a: '', b: '', donoA: '', adminA: '', membroA: '', donoB: '', membroB: '' };
    let secretA = '';
    let keyA = '';
    let keyB = '';
    let capaB = '';

    beforeAll(async () => {
      const stamp = `iso413-${Date.now()}`;
      const [donoA, adminA, membroA, donoB, membroB] = await Promise.all(
        ['donoA', 'adminA', 'membroA', 'donoB', 'membroB'].map((n) =>
          prisma.user.create({
            data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: n },
          }),
        ),
      );
      Object.assign(k, {
        donoA: donoA.id,
        adminA: adminA.id,
        membroA: membroA.id,
        donoB: donoB.id,
        membroB: membroB.id,
      });
      const grupo = (nome: string, dono: string, outros: [string, GroupRole][]) =>
        prisma.group.create({
          data: {
            type: GroupType.SPONSORED,
            name: nome,
            slug: `${stamp}-${nome}`,
            ownerId: dono,
            memberships: {
              create: [
                { userId: dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
                ...outros.map(([userId, role]) => ({
                  userId,
                  role,
                  status: MembershipStatus.ACTIVE,
                })),
              ],
            },
          },
        });
      k.a = (
        await grupo('a', k.donoA, [
          [k.adminA, GroupRole.ADMIN],
          [k.membroA, GroupRole.MEMBER],
        ])
      ).id;
      k.b = (await grupo('b', k.donoB, [[k.membroB, GroupRole.MEMBER]])).id;
      const criadaA = await keys.create(k.donoA, k.a, { name: 'Zapier A' });
      secretA = criadaA.secret;
      keyA = criadaA.key.id;
      keyB = (await keys.create(k.donoB, k.b, { name: 'Make B' })).key.id;
      capaB = (
        await prisma.mediaFile.create({
          data: {
            uploaderId: k.donoB,
            groupId: k.b,
            purpose: 'group_cover',
            kind: 'IMAGE',
            mime: 'image/jpeg',
            bytes: 10,
            key: `groups/${k.b}/cover/${stamp}.jpg`,
            status: 'READY',
          },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: { in: [k.a, k.b] } } });
      await prisma.user.deleteMany({
        where: { id: { in: [k.donoA, k.adminA, k.membroA, k.donoB, k.membroB] } },
      });
    });

    it('a chave da A só lê a A: nenhum membro, convite ou envio da B sai por ela', async () => {
      const stamp = `iso413b-${Date.now()}`;
      const ctx = await keys.authenticate(secretA);
      expect(ctx.groupId).toBe(k.a);
      // O que existe na B: associações, um convite, um plano enviado e uma venda.
      const assocB = (
        await prisma.groupMembership.findMany({ where: { groupId: k.b }, select: { id: true } })
      ).map((m) => m.id);
      expect(assocB).toHaveLength(2);
      const conviteB = await prisma.groupInvite.create({
        data: {
          groupId: k.b,
          tokenHash: `${stamp}-convite-b`,
          role: GroupRole.MEMBER,
          email: 'convidada-b@exemplo.com',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });
      const ofertaB = await prisma.planOffer.create({
        data: {
          userId: k.membroB,
          authorId: k.donoB,
          groupId: k.b,
          versions: {
            create: [
              {
                version: 1,
                title: 'Treino da B',
                snapshot: {},
                snapshotVersion: 1,
                schedule: 'FLEXIBLE',
              },
            ],
          },
        },
        include: { versions: true },
      });
      const vendaB = await prisma.groupOfferPurchase.create({
        data: {
          offer: {
            create: {
              groupId: k.b,
              slug: `${stamp}-oferta-b`,
              title: 'Programa da B',
              priceCents: 9900,
              status: 'ACTIVE',
            },
          },
          buyerName: 'Compradora B',
          buyerEmail: 'compradora-b@exemplo.com',
          amountCents: 9900,
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      const membros = await reads.members(ctx, {});
      expect(membros.items.length).toBeGreaterThan(0);
      for (const id of assocB) expect(membros.items.map((m) => m.id)).not.toContain(id);
      expect(JSON.stringify(membros)).not.toMatch(/membroB|donoB/);

      const convites = [
        ...(await reads.invites(ctx, {})).items,
        ...(await reads.invites(ctx, { pending: true })).items,
      ];
      expect(convites.map((i) => i.id)).not.toContain(conviteB.id);
      expect(JSON.stringify(convites)).not.toContain('convidada-b');

      const envios = (await reads.sends(ctx, {})).items;
      const idsEnvios = envios.map((e) => e.id);
      expect(idsEnvios).not.toContain(ofertaB.versions[0]!.id);
      expect(idsEnvios).not.toContain(vendaB.id);
      expect(JSON.stringify(envios)).not.toMatch(/Treino da B|Programa da B|Compradora B/);
    });

    it('a dona da B não lista, não revoga e não descobre a chave da A', async () => {
      await expect(keys.list(k.donoB, k.a)).rejects.toThrow(NotFoundException);
      await expect(keys.revoke(k.donoB, k.a, keyA)).rejects.toThrow(NotFoundException);
      // O id da chave da A pela rota da B: como inexistente.
      await expect(keys.revoke(k.donoB, k.b, keyA)).rejects.toThrow(NotFoundException);
      expect((await prisma.groupApiKey.findUniqueOrThrow({ where: { id: keyA } })).revokedAt).toBe(
        null,
      );
      expect((await keys.list(k.donoB, k.b)).keys.map((c) => c.id)).toEqual([keyB]);
    });

    it('admin e membro da A não cuidam das chaves; nenhuma resposta traz hash', async () => {
      await expect(keys.list(k.adminA, k.a)).rejects.toThrow(ForbiddenException);
      await expect(keys.create(k.membroA, k.a, { name: 'x' })).rejects.toThrow(ForbiddenException);
      const lista = await keys.list(k.donoA, k.a);
      expect(JSON.stringify(lista)).not.toMatch(/hash|fatia_live_[A-Za-z0-9]{8}/);
    });

    it('a capa de outra comunidade não entra como capa desta', async () => {
      await expect(groups413.setCover(k.donoA, k.a, capaB)).rejects.toThrow(NotFoundException);
      expect((await prisma.group.findUniqueOrThrow({ where: { id: k.a } })).coverFileId).toBeNull();
      // Nem a dona da B, pela rota da A.
      await expect(groups413.setCover(k.donoB, k.a, capaB)).rejects.toThrow(NotFoundException);
    });

    it('a dona da B não muda cor, seções nem tipo da A', async () => {
      await expect(
        groups413.update(k.donoB, k.a, { brandColor: '#1d4ed8', hiddenSections: ['FEED'] }),
      ).rejects.toThrow(NotFoundException);
      await expect(groups413.update(k.membroA, k.a, { hiddenSections: ['FEED'] })).rejects.toThrow(
        ForbiddenException,
      );
      const a = await prisma.group.findUniqueOrThrow({ where: { id: k.a } });
      expect(a.brandColor).toBeNull();
      expect(a.hiddenSections).toEqual([]);
    });

    it('a chave revogada pára na hora', async () => {
      await keys.revoke(k.donoA, k.a, keyA);
      await expect(keys.authenticate(secretA)).rejects.toThrow(UnauthorizedException);
    });

    it('o membro não lê as novidades do painel; a equipe lê', async () => {
      await expect(you413.panelNews(k.membroB)).rejects.toThrow(NotFoundException);
      expect((await you413.panelNews(k.adminA)).items.length).toBeGreaterThan(0);
    });
  });

  describe('comunidade de demonstração (#412)', () => {
    const demoSessions = new DemoSessionService(prisma);
    const demos = new DemoService(
      prisma,
      demoSessions,
      new PlanMaterializerService(prisma, exercises),
      new ProfessionalLinkService(prisma),
    );
    const studentView412 = new StudentViewService(
      prisma,
      access,
      plans,
      sessions,
      progress,
      nutritionSummary,
      goals,
      meals,
      nutritionPlans,
    );
    const content412 = new ContentService(
      prisma,
      plans,
      mealTemplates,
      userGoals,
      new PlanMaterializerService(prisma, exercises),
      new MediaService(prisma, new MemoryObjectStore()),
    );
    const conta412 = new AccountService(
      prisma,
      { deleteUser: async () => true } as unknown as LogtoManagementService,
      { apagarDoUsuario: async () => undefined } as unknown as CheckpointPurgeService,
    );
    const d = { donaA: '', donaB: '', alunaA: '', realA: '', realB: '', demoA: '', ana: '' };

    beforeAll(async () => {
      const stamp = `iso412-${Date.now()}`;
      const [donaA, donaB, alunaA] = await Promise.all(
        ['donaA', 'donaB', 'alunaA'].map((n) =>
          prisma.user.create({
            data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: n },
          }),
        ),
      );
      Object.assign(d, { donaA: donaA.id, donaB: donaB.id, alunaA: alunaA.id });
      d.realA = (await groups.create(d.donaA, { type: GroupType.SPONSORED, name: 'Real A' })).id;
      d.realB = (await groups.create(d.donaB, { type: GroupType.SPONSORED, name: 'Real B' })).id;
      await prisma.groupMembership.create({
        data: {
          groupId: d.realA,
          userId: d.alunaA,
          role: GroupRole.MEMBER,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
      const criada = await demos.create(d.donaA);
      d.demoA = criada.demo!.groupId;
      d.ana = criada.demo!.student.userId;
      // Um plano publicado na demo: não pode virar "modelo" da dona no app.
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: d.demoA,
          authorId: d.donaA,
          kind: 'WORKOUT',
          title: 'Modelo da demo',
          snapshot: { version: 1, name: 'Modelo da demo', exercises: [] },
          snapshotVersion: 1,
          publishedAt: new Date(),
        },
      });
    });

    afterAll(async () => {
      for (const id of [d.donaA, d.donaB]) await demos.remove(id);
      await prisma.group.deleteMany({ where: { id: { in: [d.realA, d.realB] } } });
      await prisma.user.deleteMany({ where: { id: { in: [d.donaA, d.donaB, d.alunaA] } } });
    });

    it('outra dona não vê, não abre e não apaga a demo da dona A', async () => {
      expect((await demos.get(d.donaB)).demo).toBeNull();
      await expect(groups.findByIdForMember(d.donaB, d.demoA)).rejects.toThrow(NotFoundException);
      expect((await groups.listMine(d.donaB)).map((g) => g.id)).toEqual([d.realB]);
      expect(await demos.remove(d.donaB)).toEqual({ removed: false });
      expect(await prisma.group.findUnique({ where: { id: d.demoA } })).not.toBeNull();
    });

    it('nenhum membro de verdade vê a demo nem a Ana', async () => {
      expect((await groups.listMine(d.alunaA)).map((g) => g.id)).toEqual([d.realA]);
      await expect(groups.findByIdForMember(d.alunaA, d.demoA)).rejects.toThrow(NotFoundException);
      // Nem a própria dona tem a demo em "Minhas comunidades".
      expect((await groups.listMine(d.donaA)).map((g) => g.id)).toEqual([d.realA]);
    });

    it('a Ana não entra na lista de alunos nem nos modelos da dona fora da demo', async () => {
      const alunos = await studentView412.listStudents(d.donaA);
      expect(alunos.map((a) => a.groupId)).not.toContain(d.demoA);
      expect(JSON.stringify(alunos)).not.toContain('Ana Exemplo');
      expect(JSON.stringify(alunos)).toContain('alunaA');
      const modelos = await content412.listWorkoutTemplatesForMe(d.donaA);
      expect(JSON.stringify(modelos)).not.toContain('Modelo da demo');
    });

    it('a sessão do app da demo resolve só para a Ana, nunca para a dona ou outra conta', async () => {
      const s = await demos.openSession(d.donaA);
      const quem = await demoSessions.authenticate(s.token);
      expect(quem.id).toBe(d.ana);
      expect([d.donaA, d.donaB, d.alunaA]).not.toContain(quem.id);
      await expect(demos.openSession(d.donaB)).rejects.toThrow(NotFoundException);
    });

    it('a Ana só entra no export da dona que criou a demo', async () => {
      const deA = await conta412.exportData(d.donaA);
      expect(deA.demoCommunity).toMatchObject({
        name: 'Academia Exemplo',
        student: { name: 'Ana Exemplo' },
      });
      for (const outra of [d.donaB, d.alunaA]) {
        const exp = await conta412.exportData(outra);
        expect(exp.demoCommunity).toBeNull();
        expect(JSON.stringify(exp)).not.toContain('Ana Exemplo');
        expect(JSON.stringify(exp)).not.toContain('Academia Exemplo');
      }
    });

    it('apagar a conta da dona leva a demo e a Ana; a conta de outra pessoa não toca nelas', async () => {
      await conta412.deleteAccount(d.alunaA, DELETE_CONFIRMATION);
      expect(await prisma.user.findUnique({ where: { id: d.ana } })).not.toBeNull();

      await conta412.deleteAccount(d.donaA, DELETE_CONFIRMATION);
      expect(await prisma.user.findUnique({ where: { id: d.ana } })).toBeNull();
      expect(await prisma.group.findUnique({ where: { id: d.demoA } })).toBeNull();
      expect(await prisma.workoutSession.count({ where: { userId: d.ana } })).toBe(0);
      expect(await prisma.group.findUnique({ where: { id: d.realB } })).not.toBeNull();
    });
  });

  describe('checklist de primeiros passos do dono (#372)', () => {
    const setup372 = new CommunitySetupService(prisma);
    const c = { donoA: '', donoB: '', proA: '', grupoA: '' };

    beforeAll(async () => {
      const stamp = `iso372-${Date.now()}`;
      const [donoA, donoB, proA] = await Promise.all(
        ['donoA', 'donoB', 'proA'].map((n) =>
          prisma.user.create({
            data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: n },
          }),
        ),
      );
      Object.assign(c, { donoA: donoA.id, donoB: donoB.id, proA: proA.id });
      c.grupoA = (await groups.create(c.donoA, { type: GroupType.SPONSORED, name: 'Grupo A' })).id;
      await prisma.groupMembership.create({
        data: {
          groupId: c.grupoA,
          userId: c.proA,
          role: GroupRole.PROFESSIONAL,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
    });

    afterAll(async () => {
      await prisma.group.deleteMany({ where: { id: c.grupoA } });
      await prisma.user.deleteMany({ where: { id: { in: [c.donoA, c.donoB, c.proA] } } });
    });

    it('o dono de outra comunidade não lê, não marca e não fecha o guia (404)', async () => {
      await expect(setup372.get(c.donoB, c.grupoA)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        setup372.setStep(c.donoB, c.grupoA, SetupStep.PLAN, true),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(setup372.setGuide(c.donoB, c.grupoA, false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(setup372.firstSteps(c.donoB, c.grupoA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const g = await prisma.group.findUniqueOrThrow({ where: { id: c.grupoA } });
      expect(g.setupSteps).toEqual([]);
      expect(g.setupHiddenAt).toBeNull();
    });

    it('a profissional da comunidade não mexe no checklist do dono (403)', async () => {
      await expect(setup372.get(c.proA, c.grupoA)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(setup372.setStep(c.proA, c.grupoA, SetupStep.TEAM, true)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  it('o dado do user-A continua intacto depois de todas as tentativas', async () => {
    // Fecha o ciclo: nenhuma das chamadas acima pode ter tido efeito colateral.
    const meal = await meals.findById(owned.userA, owned.mealId);
    expect(meal.notes).toBeNull();

    const session = await sessions.findById(owned.userA, owned.sessionId);
    expect(session).toBeTruthy();

    const stillThere = await prisma.weightLog.findUnique({ where: { id: owned.weightLogId } });
    expect(stillThere).toBeTruthy();
  });
});
