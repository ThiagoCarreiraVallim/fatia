import { NotFoundException } from '@nestjs/common';
import { GroupRole, GroupType, MealType, MembershipStatus, ShareScope } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AccessAuditService } from '../../sharing/access-audit.service';
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

  /** Dados do user-A. Preenchido no beforeAll e sondado como user-B. */
  const owned = {
    userA: '',
    userB: '',
    /** Terceiro usuário: profissional da academia do user-A (ADR 014). */
    pro: '',
    groupId: '',
    /** Membership do user-A (o titular do dado) no grupo. */
    membershipA: '',
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
    const [userA, userB, pro] = await Promise.all([
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
    ]);
    owned.userA = userA.id;
    owned.userB = userB.id;
    owned.pro = pro.id;

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
          ],
        },
      },
      include: { memberships: true },
    });
    owned.groupId = group.id;
    owned.membershipA = group.memberships.find((m) => m.userId === owned.userA)!.id;

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
        where: { id: { in: [owned.userA, owned.userB, owned.pro].filter(Boolean) } },
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
