import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupRole, GroupType, MealType, MembershipStatus, ShareScope } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AccessAuditService } from '../../sharing/access-audit.service';
import { GroupService } from '../../sharing/group.service';
import { MembershipService } from '../../sharing/membership.service';
import { ProfessionalAccessService } from '../../sharing/professional-access.service';
import { ProfessionalLinkService } from '../../sharing/professional-link.service';
import { GoalsService } from '../../goals/goals.service';
import { FoodService } from '../../nutrition/food.service';
import { MealItemService } from '../../nutrition/meal-item.service';
import { MealService } from '../../nutrition/meal.service';
import { NutrientTargetService } from '../../nutrition/nutrient-target.service';
import { UserGoalsService } from '../../nutrition/user-goals.service';
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
  const exercises = new ExerciseService(prisma);
  const plans = new WorkoutPlanService(prisma);
  const sessions = new WorkoutSessionService(prisma);
  const sets = new SessionSetService(prisma);
  const links = new ProfessionalLinkService(prisma);
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const groups = new GroupService(prisma);
  const memberships = new MembershipService(prisma, links);

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
    const [userA, userB, pro, pro2] = await Promise.all([
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
    ]);
    owned.userA = userA.id;
    owned.userB = userB.id;
    owned.pro = pro.id;
    owned.pro2 = pro2.id;

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
  }, 60_000);

  afterAll(async () => {
    // Cascade limpa tudo que pende dos usuários; o exercício público é solto.
    await prisma.user
      .deleteMany({
        where: { id: { in: [owned.userA, owned.userB, owned.pro, owned.pro2].filter(Boolean) } },
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
      // O `AccessAuditService` engole erro de escrita de propósito (a trilha não
      // pode derrubar a requisição), então só um teste contra Postgres real
      // percebe se a linha nunca chega ao banco.
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

      // O dono administra e vê todo mundo (ele, o aluno e os dois profissionais).
      expect(peloDono).toHaveLength(4);
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
