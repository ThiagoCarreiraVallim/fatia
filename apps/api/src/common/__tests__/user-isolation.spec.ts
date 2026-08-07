import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GroupRole, GroupType, MealType, MembershipStatus, ShareScope } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AccessAuditService } from '../../sharing/access-audit.service';
import { ConsentService } from '../../sharing/consent.service';
import { GroupService } from '../../sharing/group.service';
import { MembershipService } from '../../sharing/membership.service';
import { PlanMaterializerService } from '../../sharing/plan-materializer.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION } from '../../sharing/plan-snapshot';
import { ProfessionalAccessService } from '../../sharing/professional-access.service';
import { ProfessionalLinkService } from '../../sharing/professional-link.service';
import { StudentViewService } from '../../sharing/student-view.service';
import { ConversationService } from '../../chat/conversation.service';
import { GoalsService } from '../../goals/goals.service';
import { FoodService } from '../../nutrition/food.service';
import { MealItemService } from '../../nutrition/meal-item.service';
import { MealService } from '../../nutrition/meal.service';
import { NutrientTargetService } from '../../nutrition/nutrient-target.service';
import { NutritionSummaryService } from '../../nutrition/nutrition-summary.service';
import { UserGoalsService } from '../../nutrition/user-goals.service';
import { ProgressService } from '../../progress/progress.service';
import { StepLogService } from '../../progress/step-log.service';
import { WaterLogService } from '../../progress/water-log.service';
import { WeightLogService } from '../../progress/weight-log.service';
import { ExerciseService } from '../../workout/exercise.service';
import { SessionSetService } from '../../workout/session-set.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { WorkoutSessionService } from '../../workout/workout-session.service';

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

describe('isolamento entre usuários', () => {
  const prisma = new PrismaService();

  const meals = new MealService(prisma);
  const foods = new FoodService(prisma);
  const mealItems = new MealItemService(prisma, meals);
  const nutrientTargets = new NutrientTargetService(prisma);
  const userGoals = new UserGoalsService(prisma);
  const weights = new WeightLogService(prisma);
  const steps = new StepLogService(prisma);
  const waters = new WaterLogService(prisma);
  const goals = new GoalsService(prisma, weights, steps);
  const progress = new ProgressService(prisma, steps, waters);
  const nutritionSummary = new NutritionSummaryService(prisma);
  const exercises = new ExerciseService(prisma);
  const plans = new WorkoutPlanService(prisma);
  const sessions = new WorkoutSessionService(prisma);
  const sets = new SessionSetService(prisma);
  const links = new ProfessionalLinkService(prisma);
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const groups = new GroupService(prisma);
  const memberships = new MembershipService(prisma, links);
  const consent = new ConsentService(prisma, links);
  const conversas = new ConversationService(prisma);

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
      data: { name: `${stamp}-shared-ex`, muscleGroup: 'peito' },
    });
    owned.sharedExerciseId = shared.id;

    // --- estrutura B2B (ADR 014) ---
    //
    // O grupo é do **user-B**, e o user-A é aluno dele. Isso é de propósito:
    // todos os casos deste arquivo passam a rodar com o user-B na posição de
    // dono da academia do user-A, e continuam exigindo recusa. Dono de grupo
    // não lê dado de aluno — a garantia sai de graça em ~50 casos.
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
    });
    owned.customFoodId = customFood.id;

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

    const weightLog = await weights.create({ weightKg: 80 }, owned.userA);
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
    const turno = await conversas.iniciarTurno(owned.userA, undefined, 'quanto comi hoje?');
    owned.conversationId = turno.conversationId;
    await conversas.concluirTurno(owned.userA, turno.conversationId, {
      texto: 'Você comeu 1.800 kcal hoje.',
      tools: [{ name: 'get_nutrition_summary' }],
    });
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

    it('list_nutrient_targets volta vazio', async () => {
      await expect(nutrientTargets.list(owned.userB)).resolves.toEqual([]);
    });

    it('list_personal_records volta vazio', async () => {
      await expect(sets.listPersonalRecords(owned.userB)).resolves.toEqual([]);
    });

    it('get_active_workout_session não vê a sessão aberta do user-A', async () => {
      await expect(sessions.findActive(owned.userB)).resolves.toBeNull();
    });

    it('search_food não retorna o alimento custom do user-A', async () => {
      const found = await foods.search(owned.userB, {});
      expect(found.map((food) => food.id)).not.toContain(owned.customFoodId);
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

    it('delete_custom_food recusa', async () => {
      await expect(foods.deleteCustom(owned.userB, owned.customFoodId)).rejects.toThrow(
        NotFoundException,
      );
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
      await expect(weights.update(owned.weightLogId, { weightKg: 1 }, owned.userB)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete_weight_log recusa', async () => {
      await expect(weights.delete(owned.weightLogId, owned.userB)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('update_step_log recusa', async () => {
      await expect(steps.update(owned.stepLogId, { steps: 1 }, owned.userB)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete_step_log recusa', async () => {
      await expect(steps.delete(owned.stepLogId, owned.userB)).rejects.toThrow(NotFoundException);
    });

    it('update_water_log recusa', async () => {
      await expect(waters.update(owned.waterLogId, { ml: 1 }, owned.userB)).rejects.toThrow(
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

    it('finish_workout_session recusa', async () => {
      await expect(sessions.finish(owned.userB, owned.sessionId, {})).rejects.toThrow(
        NotFoundException,
      );
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

    it('DONO do grupo não lê nem com vínculo concedido em nome dele', async () => {
      // O user-B é OWNER da academia. Se alguém (ou um bug de #154) criar um
      // vínculo com ele na ponta do profissional, o papel ainda barra: dono
      // gere grupo, membros e cobrança e não lê dado de saúde (ADR 014). É
      // também o que mantém os ~50 casos deste arquivo válidos, já que todos
      // rodam com o user-B nessa posição.
      await links.grant({
        subjectUserId: owned.userA,
        professionalId: owned.userB,
        groupId: owned.groupId,
        scopes: [ShareScope.WORKOUT],
      });

      await expect(
        access.assertReadable(owned.userB, owned.membershipA, ShareScope.WORKOUT, 'probe'),
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
      expect(alunos.map((a) => a.name).sort()).toEqual(['Colega', 'User A']);

      // A lista não é dado de saúde, mas também não pode virar diretório: o
      // `pro` é dono de um segundo grupo, e ninguém de lá entra aqui.
      expect(alunos.every((a) => a.groupId === owned.groupId)).toBe(true);
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

        const depois = await studentView.listStudents(owned.pro);
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

    it('quem não é PROFESSIONAL não tem lista de alunos, nem sendo dono da academia', async () => {
      // O user-B é OWNER do grupo do user-A. Dono administra e cobra; não
      // atende. Devolver a lista a ele daria ao painel de dono um caminho de
      // aquisição de acesso que a ADR 014 nega.
      await expect(studentView.listStudents(owned.userB)).resolves.toEqual([]);
      await expect(studentView.listStudents(owned.creator)).resolves.toEqual([]);
      await expect(studentView.listStudents(owned.colega)).resolves.toEqual([]);
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

        await expect(studentView.listStudents(owned.pro)).resolves.toEqual([]);
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
      // outra pessoa: tudo que sai daqui é referenciado por `membershipId`.
      expect(Object.keys(peloDono[0]).sort()).toEqual([
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
        'professionalName',
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

    const papeisQueNaoLeem = [
      { papel: GroupRole.OWNER, quem: () => owned.userB },
      { papel: GroupRole.CREATOR, quem: () => owned.creator },
      { papel: GroupRole.MEMBER, quem: () => owned.colega },
    ];

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
      const lista = await conversas.listar(owned.userA);
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

    it('a listagem do vizinho não inclui a conversa do user-A', async () => {
      const lista = await conversas.listar(owned.userB);
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

    it('gravar a resposta numa conversa alheia não escreve nada', async () => {
      const antes = await mensagensNoBanco();

      // `concluirTurno` roda depois do streaming, com um id que atravessou o
      // turno inteiro. Ele não lança — o cabeçalho já foi para o cliente e não há
      // mais status a devolver —, mas também não pode gravar na conversa alheia.
      await conversas.concluirTurno(owned.userB, owned.conversationId, {
        texto: 'texto injetado',
        tools: [],
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
        undefined,
        'descartável',
      );

      await conversas.apagar(owned.userA, conversationId);

      expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).toBeNull();
      expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
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
