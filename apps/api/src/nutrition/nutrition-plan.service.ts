import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupRole,
  MembershipStatus,
  Prisma,
  ShareScope,
  type MealType,
  type NutritionPlanStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { assertDay, parseInstant } from '../common/dates';
import { addDaysIso, dateInTz, todayInTz } from '../progress/helpers/date-tz';
import { TEAM_ROLES } from '../sharing/permissions';
import { MealService, type ResolvedItem } from './meal.service';
import { DailyAdherenceService } from './daily-adherence.service';
import { assertGoalsValid } from './user-goals.service';
import { calcMacrosFromFood, calcNutrientsFromFood } from './helpers/calc-macros';
import { snapshotOf, type ItemSnapshotSource } from './helpers/meal-snapshot';
import {
  MAX_TEMPLATE_ITEMS,
  MAX_TEMPLATE_NAME,
  MAX_TEMPLATES_PER_USER,
} from './dto/meal-template.dto';
import type {
  LogPlanMealDto,
  SendNutritionPlanInput,
  SendPlanFood,
  SwapPlanItemDto,
} from './dto/nutrition-plan.dto';

export interface PlanFoodView {
  id: string;
  foodName: string;
  grams: number;
  portionLabel: string | null;
  portionQuantity: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PlanSwapView {
  id: string;
  equivalentId: string;
  foodName: string;
  grams: number;
  kcal: number;
}

export interface PlanItemView extends PlanFoodView {
  equivalenceGroup: string | null;
  equivalents: PlanFoodView[];
  /** A troca valendo no dia pedido, ou nulo. */
  swap: PlanSwapView | null;
}

export interface PlanOptionView {
  id: string;
  position: number;
  /** Totais da opção já com as trocas do dia. */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: PlanItemView[];
}

export interface PlanMealView {
  id: string;
  mealType: MealType;
  name: string;
  position: number;
  /** "Comi isso" no dia pedido. */
  logged: { mealId: string; optionId: string } | null;
  options: PlanOptionView[];
}

export interface PlanGoals {
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
}

export interface NutritionPlanView {
  id: string;
  version: number;
  status: NutritionPlanStatus;
  /** Nulo quando o autor apagou a conta. */
  author: { name: string } | null;
  sentAt: Date;
  acceptedAt: Date | null;
  goals: PlanGoals;
  applyGoals: boolean;
  note: string | null;
  meals: PlanMealView[];
}

export interface NutritionPlanOverview {
  /** Dia a que "feito" e trocas se referem (YYYY-MM-DD, fuso da pessoa). */
  date: string;
  /** O plano em uso, ou nulo. */
  active: NutritionPlanView | null;
  /** Um plano (ou versão) novo esperando o aceite, ou nulo. */
  pending: NutritionPlanView | null;
  /**
   * Se o autor do plano em uso vê as trocas e o consumo: só com Alimentação
   * liberada para ele (ADR 045). O texto do aviso de troca depende disto.
   */
  teamSees: boolean;
  /** Primeiro nome de quem vê ("Helena"), ou nulo. */
  viewerName: string | null;
  /** Dias com as calorias na faixa nos últimos 7 (ADR 027). Só a contagem. */
  week: { inRangeDays: number; days: number };
}

export interface SwapResult {
  swap: PlanSwapView & { itemId: string; date: string };
  /** Nome do item do plano que saiu ("pão integral"). */
  replaced: string;
  teamSees: boolean;
  /** Primeiro nome de quem vê, para "a Helena vê no seu diário". */
  viewerName: string | null;
}

/** O que a equipe lê do plano na leitura de Alimentação (#376). */
export interface PlanTeamView {
  plan: { version: number; status: NutritionPlanStatus; acceptedAt: Date | null } | null;
  swaps: Array<{
    date: string;
    mealName: string;
    replaced: string;
    foodName: string;
    grams: number;
    kcalDelta: number;
    undone: boolean;
  }>;
  adherence: { inRangeDays: number; days: number };
}

/** Recusa única: plano, refeição, opção, item ou troca alheios ou inexistentes (#92). */
const PLAN_NOT_FOUND = 'Nutrition plan not found';

/** Tetos do que o editor manda: um plano é um dia de refeições, não um livro. */
const MAX_MEALS = 8;
const MAX_OPTIONS = 4;
const MAX_EQUIVALENTS = 8;
const MAX_NOTE = 1000;
const MAX_MEAL_NAME = 40;
const MAX_GROUP_NAME = 40;
const MAX_GRAMS = 5000;

/** Dias da aderência do cabeçalho ("N/7 na semana"). */
const WEEK_DAYS = 7;

const PLAN_INCLUDE = {
  author: { select: { name: true } },
  meals: {
    orderBy: { position: 'asc' },
    include: {
      options: {
        orderBy: { position: 'asc' },
        include: {
          items: {
            orderBy: { position: 'asc' },
            include: { equivalents: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  },
} satisfies Prisma.NutritionPlanInclude;

type PlanRow = Prisma.NutritionPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

function goalsOf(plan: PlanGoals): PlanGoals {
  return {
    kcalMin: plan.kcalMin,
    kcalMax: plan.kcalMax,
    proteinMinG: plan.proteinMinG,
    proteinMaxG: plan.proteinMaxG,
    carbsMinG: plan.carbsMinG,
    carbsMaxG: plan.carbsMaxG,
    fatMinG: plan.fatMinG,
    fatMaxG: plan.fatMaxG,
  };
}

function foodView(row: ItemSnapshotSource & { id: string }): PlanFoodView {
  return {
    id: row.id,
    foodName: row.foodName,
    grams: row.grams,
    portionLabel: row.portionLabel,
    portionQuantity: row.portionQuantity,
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
  };
}

/** Os campos de `MealItem` que uma troca reescreve, a partir de um retrato. */
function mealItemData(src: ItemSnapshotSource): Prisma.MealItemUncheckedUpdateManyInput {
  return {
    foodId: src.foodId,
    groupId: src.groupId,
    foodName: src.foodName,
    grams: src.grams,
    kcal: src.kcal,
    proteinG: src.proteinG,
    carbsG: src.carbsG,
    fatG: src.fatG,
    nutrients: src.nutrients === null ? Prisma.DbNull : (src.nutrients as Prisma.InputJsonValue),
    portionLabel: src.portionLabel,
    portionQuantity: src.portionQuantity,
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Plano alimentar do profissional, do lado do aluno (#376, ADR 045).
 *
 * O plano é escrito pela equipe e é dado do aluno. Aqui o aluno lê, aceita,
 * registra uma refeição do plano ("comi isso") e troca um item por um
 * equivalente que o profissional liberou. O editor da equipe é a #407 e chama
 * `send`; o envio com aviso é a #405.
 *
 * Todo acesso do aluno parte do `userId` dele: refeição, opção, item e
 * equivalente são procurados **através** do plano dele, e um id de outro plano
 * responde igual a um que não existe.
 */
@Injectable()
export class NutritionPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meals: MealService,
    private readonly adherence: DailyAdherenceService,
  ) {}

  /**
   * Envia um plano (ou uma versão nova) a um aluno. É a porta que o editor da
   * equipe (#407) vai chamar: o autor sai do contexto autenticado, o aluno da
   * associação (`membershipId`), nunca de um `userId` de entrada.
   *
   * O autor precisa ser da equipe ativa da mesma comunidade, e o aluno, membro
   * ativo dela. Enviar não lê dado do aluno, então não passa pelo
   * consentimento; ver o que ele fez com o plano passa (`teamView`).
   */
  async send(
    authorId: string,
    membershipId: string,
    input: SendNutritionPlanInput,
  ): Promise<NutritionPlanView> {
    const student = await this.prisma.groupMembership.findUnique({
      where: { id: membershipId },
      select: { userId: true, groupId: true, role: true, status: true },
    });
    const author = student
      ? await this.prisma.groupMembership.findUnique({
          where: { groupId_userId: { groupId: student.groupId, userId: authorId } },
          select: { role: true, status: true },
        })
      : null;
    if (
      !student ||
      student.status !== MembershipStatus.ACTIVE ||
      student.role !== GroupRole.MEMBER ||
      !author ||
      author.status !== MembershipStatus.ACTIVE ||
      !TEAM_ROLES.includes(author.role)
    ) {
      throw new NotFoundException('Membership not found');
    }

    assertGoalsValid(input.goals);
    this.assertShape(input);

    const foods = await this.baseFoods(input);
    const resolve = (f: SendPlanFood) => {
      const food = foods.get(f.foodId)!;
      if (!(f.grams > 0) || f.grams > MAX_GRAMS) {
        throw new BadRequestException('A quantidade de cada alimento vai de 1 g a 5 kg.');
      }
      const nutrients = calcNutrientsFromFood(food.nutrients, f.grams);
      return {
        foodId: food.id,
        groupId: food.groupId,
        foodName: food.name,
        grams: f.grams,
        ...calcMacrosFromFood(food, f.grams),
        ...(nutrients ? { nutrients } : {}),
        portionLabel: f.portionLabel ?? null,
        portionQuantity: f.portionLabel ? (f.portionQuantity ?? null) : null,
      };
    };
    // Resolve fora da transação: um 400 de quantidade não abre transação à toa.
    const meals = input.meals.map((meal, mealPos) => ({
      mealType: meal.mealType,
      name: meal.name.trim(),
      position: mealPos,
      options: {
        create: meal.options.map((option, optionPos) => ({
          position: optionPos,
          items: {
            create: option.items.map((item, itemPos) => ({
              ...resolve(item),
              position: itemPos,
              equivalenceGroup: item.equivalenceGroup?.trim() || null,
              equivalents: {
                create: (item.equivalents ?? []).map((eq, eqPos) => ({
                  ...resolve(eq),
                  position: eqPos,
                })),
              },
            })),
          },
        })),
      },
    }));

    const created = await this.prisma.$transaction(async (db) => {
      const last = await db.nutritionPlan.findFirst({
        where: { userId: student.userId, authorId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      // A versão anterior que ainda esperava o aceite sai: a nova a substitui.
      await db.nutritionPlan.updateMany({
        where: { userId: student.userId, authorId, status: 'SENT' },
        data: { status: 'SUPERSEDED', supersededAt: new Date() },
      });
      return db.nutritionPlan.create({
        data: {
          userId: student.userId,
          authorId,
          groupId: student.groupId,
          version: (last?.version ?? 0) + 1,
          ...goalsOf(input.goals),
          applyGoals: input.applyGoals ?? true,
          note: input.note?.trim() || null,
          meals: { create: meals },
        },
        include: PLAN_INCLUDE,
      });
    });
    return this.view(created, new Map(), new Map());
  }

  /** O plano em uso e o que espera aceite, com o "feito" e as trocas de um dia. */
  async overview(userId: string, timezone: string, date?: string): Promise<NutritionPlanOverview> {
    const day = date ? assertDay(date, 'date') : todayInTz(timezone);
    const [active, pending] = await Promise.all([
      this.prisma.nutritionPlan.findFirst({
        where: { userId, status: 'ACCEPTED' },
        include: PLAN_INCLUDE,
      }),
      this.prisma.nutritionPlan.findFirst({
        where: { userId, status: 'SENT' },
        orderBy: { sentAt: 'desc' },
        include: PLAN_INCLUDE,
      }),
    ]);

    const [logs, swaps, viewer, week] = await Promise.all([
      active
        ? this.logsOf(active.id, day)
        : new Map<string, { mealId: string; optionId: string }>(),
      active ? this.swapsOf(active.id, day) : new Map<string, PlanSwapView>(),
      active ? this.viewerOf(userId, active) : null,
      this.week(userId, timezone),
    ]);

    return {
      date: day,
      active: active ? this.view(active, logs, swaps) : null,
      pending: pending ? this.view(pending, new Map(), new Map()) : null,
      teamSees: viewer !== null,
      viewerName: viewer,
      week,
    };
  }

  /**
   * Aceita o plano que chegou. O que estava em uso vira `SUPERSEDED`, as faixas
   * viram as metas do dia (com `applyGoals`) e cada opção vira uma refeição
   * salva da pessoa. As refeições salvas do plano anterior saem: foram criadas
   * por ele, e ficariam apontando para um plano que não vale mais.
   */
  async accept(userId: string, planId: string): Promise<NutritionPlanView> {
    const plan = await this.prisma.nutritionPlan.findFirst({
      where: { id: planId, userId, status: 'SENT' },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw new NotFoundException(PLAN_NOT_FOUND);

    await this.prisma.$transaction(async (db) => {
      const fromPrevious = await db.nutritionPlanOption.findMany({
        where: { meal: { plan: { userId, status: 'ACCEPTED' } }, mealTemplateId: { not: null } },
        select: { mealTemplateId: true },
      });
      await db.mealTemplate.deleteMany({
        where: { userId, id: { in: fromPrevious.map((o) => o.mealTemplateId!) } },
      });
      const now = new Date();
      await db.nutritionPlan.updateMany({
        where: { userId, status: 'ACCEPTED' },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });
      await db.nutritionPlan.update({
        where: { id: plan.id },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });

      if (plan.applyGoals) {
        const goals = goalsOf(plan);
        await db.userGoals.upsert({
          where: { userId },
          create: { userId, ...goals },
          update: goals,
        });
      }

      let room = MAX_TEMPLATES_PER_USER - (await db.mealTemplate.count({ where: { userId } }));
      for (const meal of plan.meals) {
        for (const option of meal.options) {
          // O teto de refeições salvas vale também aqui. O que não couber fica
          // só no plano, que continua registrando pelo "comi isso".
          if (room <= 0) continue;
          const suffix = meal.options.length > 1 ? ` · opção ${option.position + 1}` : '';
          const tag = ` (plano v${plan.version})`;
          const room4name = MAX_TEMPLATE_NAME - suffix.length - tag.length;
          const name = `${meal.name.slice(0, room4name)}${suffix}${tag}`;
          const clash = await db.mealTemplate.findFirst({
            where: { userId, name },
            select: { id: true },
          });
          if (clash) continue;
          const template = await db.mealTemplate.create({
            data: {
              userId,
              name,
              mealType: meal.mealType,
              items: {
                create: option.items.map((item, position) => ({ ...snapshotOf(item), position })),
              },
            },
            select: { id: true },
          });
          await db.nutritionPlanOption.update({
            where: { id: option.id },
            data: { mealTemplateId: template.id },
          });
          room -= 1;
        }
      }
    });

    const accepted = await this.prisma.nutritionPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: PLAN_INCLUDE,
    });
    return this.view(accepted, new Map(), new Map());
  }

  /**
   * "Comi isso": registra a opção da refeição do plano no diário, com as trocas
   * do dia aplicadas. Passa por `MealService.createResolved`, o mesmo caminho da
   * refeição salva (`log_meal_template`).
   */
  async logMeal(
    userId: string,
    planMealId: string,
    dto: LogPlanMealDto,
    timezone: string,
  ): Promise<{ mealId: string; date: string }> {
    const planMeal = await this.prisma.nutritionPlanMeal.findFirst({
      where: { id: planMealId, plan: { userId, status: 'ACCEPTED' } },
      include: {
        options: {
          orderBy: { position: 'asc' },
          include: { items: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!planMeal) throw new NotFoundException(PLAN_NOT_FOUND);

    let option: (typeof planMeal.options)[number] | undefined = planMeal.options[0];
    if (dto.optionId !== undefined) {
      option = planMeal.options.find((o) => o.id === dto.optionId);
    } else if (planMeal.options.length > 1) {
      throw new BadRequestException(
        `${planMeal.name} tem ${planMeal.options.length} opções: informe optionId com a que você comeu.`,
      );
    }
    if (!option) throw new NotFoundException(PLAN_NOT_FOUND);
    const chosen = option;

    const eatenAt = dto.eatenAt ? parseInstant(dto.eatenAt, 'eatenAt') : new Date();
    const date = dateInTz(eatenAt, timezone);
    const already = await this.prisma.nutritionPlanLog.findFirst({
      where: { planMealId, date },
      select: { mealId: true },
    });
    if (already) {
      throw new ConflictException(
        `${planMeal.name} do plano já foi registrado em ${date} (refeição ${already.mealId}). ` +
          'Para registrar de novo, apague a refeição do diário antes.',
      );
    }

    const swaps = await this.prisma.nutritionSwap.findMany({
      where: { itemId: { in: chosen.items.map((i) => i.id) }, date, undoneAt: null },
      include: { equivalent: true },
    });
    const swapOf = new Map(swaps.map((s) => [s.itemId, s]));
    const items: ResolvedItem[] = chosen.items.map((item) =>
      snapshotOf(swapOf.get(item.id)?.equivalent ?? item),
    );

    const meal = await this.meals.createResolved(
      userId,
      { mealType: planMeal.mealType, eatenAt },
      items,
    );
    try {
      await this.prisma.$transaction(async (db) => {
        await db.nutritionPlanLog.create({
          data: { planMealId, optionId: chosen.id, mealId: meal.id, date },
        });
        // A troca passa a apontar o item gravado, para "Desfazer" devolvê-lo.
        for (const [index, item] of chosen.items.entries()) {
          const swap = swapOf.get(item.id);
          const mealItem = meal.items[index];
          if (swap && mealItem) {
            await db.nutritionSwap.update({
              where: { id: swap.id },
              data: { mealItemId: mealItem.id },
            });
          }
        }
      });
    } catch (error) {
      // Refeição sem o vínculo com o plano ficaria "não feita" e duplicaria no
      // próximo toque: desfaz e deixa o erro subir.
      await this.prisma.meal.delete({ where: { id: meal.id } });
      throw error;
    }
    return { mealId: meal.id, date };
  }

  /**
   * Troca registrada: num dia, o equivalente no lugar do item. Uma troca por
   * item e dia (a anterior vira desfeita). Se a refeição já estava registrada,
   * o item dela muda junto — é o diário que a equipe vê.
   */
  async swap(userId: string, dto: SwapPlanItemDto, timezone: string): Promise<SwapResult> {
    const item = await this.prisma.nutritionPlanItem.findFirst({
      where: { id: dto.itemId, option: { meal: { plan: { userId, status: 'ACCEPTED' } } } },
      include: {
        equivalents: true,
        option: {
          include: {
            meal: {
              include: {
                plan: {
                  select: { authorId: true, groupId: true, author: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });
    // O equivalente é procurado entre os do item: o id de outro item, de outro
    // plano ou de outra pessoa responde igual a um que não existe.
    const equivalent = item?.equivalents.find((e) => e.id === dto.equivalentId);
    if (!item || !equivalent) throw new NotFoundException(PLAN_NOT_FOUND);

    const date = dto.date ? assertDay(dto.date, 'date') : todayInTz(timezone);
    const log = await this.prisma.nutritionPlanLog.findFirst({
      where: { planMealId: item.option.mealId, optionId: item.optionId, date },
      include: { meal: { include: { items: { orderBy: { seq: 'asc' } } } } },
    });

    const swap = await this.prisma.$transaction(async (db) => {
      const previous = await db.nutritionSwap.findFirst({
        where: { itemId: item.id, date, undoneAt: null },
      });
      if (previous) {
        await db.nutritionSwap.update({
          where: { id: previous.id },
          data: { undoneAt: new Date() },
        });
      }
      let mealItemId: string | null = null;
      if (log) {
        // O item gravado é o que a troca anterior apontou, ou o que ainda é o do plano.
        const target =
          (previous?.mealItemId
            ? log.meal.items.find((i) => i.id === previous.mealItemId)
            : undefined) ??
          log.meal.items.find((i) => i.foodName === item.foodName && i.grams === item.grams);
        if (target) {
          await db.mealItem.updateMany({
            where: { id: target.id, meal: { userId } },
            data: mealItemData(equivalent),
          });
          mealItemId = target.id;
        }
      }
      return db.nutritionSwap.create({
        data: {
          planId: item.option.meal.planId,
          itemId: item.id,
          equivalentId: equivalent.id,
          date,
          foodName: equivalent.foodName,
          grams: equivalent.grams,
          kcal: equivalent.kcal,
          mealItemId,
        },
      });
    });

    const viewer = await this.viewerOf(userId, item.option.meal.plan);
    return {
      swap: {
        id: swap.id,
        itemId: item.id,
        equivalentId: equivalent.id,
        date,
        foodName: swap.foodName,
        grams: swap.grams,
        kcal: swap.kcal,
      },
      replaced: item.foodName,
      teamSees: viewer !== null,
      viewerName: viewer,
    };
  }

  /** "Desfazer": volta ao item do plano, inclusive no diário. */
  async undoSwap(userId: string, swapId: string): Promise<{ undone: true; restored: string }> {
    const swap = await this.prisma.nutritionSwap.findFirst({
      where: { id: swapId, undoneAt: null, plan: { userId } },
      include: { item: true },
    });
    if (!swap) throw new NotFoundException(PLAN_NOT_FOUND);

    await this.prisma.$transaction(async (db) => {
      await db.nutritionSwap.update({ where: { id: swap.id }, data: { undoneAt: new Date() } });
      if (swap.mealItemId) {
        await db.mealItem.updateMany({
          where: { id: swap.mealItemId, meal: { userId } },
          data: mealItemData(swap.item),
        });
      }
    });
    return { undone: true, restored: swap.item.foodName };
  }

  /**
   * O que a equipe lê do plano, **depois** da porta de consentimento: quem chama
   * é `StudentViewService` na leitura de Alimentação, com o `userId` que a porta
   * devolveu. Aqui não há conferência de acesso nenhuma, de propósito — é a
   * mesma regra dos outros services de domínio (ADR 014).
   */
  async teamView(userId: string, timezone: string, days: number): Promise<PlanTeamView> {
    const today = todayInTz(timezone);
    const first = addDaysIso(today, -(days - 1));
    const [plan, swaps, inRangeDays] = await Promise.all([
      this.prisma.nutritionPlan.findFirst({
        where: { userId, status: 'ACCEPTED' },
        select: { version: true, status: true, acceptedAt: true },
      }),
      this.prisma.nutritionSwap.findMany({
        where: { plan: { userId }, date: { gte: first, lte: today } },
        include: {
          item: { include: { option: { include: { meal: { select: { name: true } } } } } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      this.inRange(userId, timezone, first, today),
    ]);
    return {
      plan,
      swaps: swaps.map((s) => ({
        date: s.date,
        mealName: s.item.option.meal.name,
        replaced: s.item.foodName,
        foodName: s.foodName,
        grams: s.grams,
        kcalDelta: Math.round(s.kcal - s.item.kcal),
        undone: s.undoneAt !== null,
      })),
      adherence: { inRangeDays, days },
    };
  }

  // ---------------------------------------------------------------------------

  private assertShape(input: SendNutritionPlanInput): void {
    if (input.meals.length === 0 || input.meals.length > MAX_MEALS) {
      throw new BadRequestException(`Um plano tem de 1 a ${MAX_MEALS} refeições.`);
    }
    if (input.note && input.note.length > MAX_NOTE) {
      throw new BadRequestException(`O recado vai até ${MAX_NOTE} caracteres.`);
    }
    for (const meal of input.meals) {
      if (!meal.name.trim() || meal.name.length > MAX_MEAL_NAME) {
        throw new BadRequestException(`O nome da refeição vai de 1 a ${MAX_MEAL_NAME} caracteres.`);
      }
      if (meal.options.length === 0 || meal.options.length > MAX_OPTIONS) {
        throw new BadRequestException(`Cada refeição tem de 1 a ${MAX_OPTIONS} opções.`);
      }
      for (const option of meal.options) {
        if (option.items.length === 0 || option.items.length > MAX_TEMPLATE_ITEMS) {
          throw new BadRequestException(`Cada opção tem de 1 a ${MAX_TEMPLATE_ITEMS} alimentos.`);
        }
        for (const item of option.items) {
          if ((item.equivalents?.length ?? 0) > MAX_EQUIVALENTS) {
            throw new BadRequestException(`Cada alimento tem até ${MAX_EQUIVALENTS} equivalentes.`);
          }
          if ((item.equivalenceGroup?.length ?? 0) > MAX_GROUP_NAME) {
            throw new BadRequestException(
              `O grupo de equivalência vai até ${MAX_GROUP_NAME} caracteres.`,
            );
          }
        }
      }
    }
  }

  /** Os alimentos citados, todos da base (sem dono). Qualquer outro é 404. */
  private async baseFoods(input: SendNutritionPlanInput) {
    const ids = new Set<number>();
    for (const meal of input.meals)
      for (const option of meal.options)
        for (const item of option.items) {
          ids.add(item.foodId);
          for (const eq of item.equivalents ?? []) ids.add(eq.foodId);
        }
    const foods = await this.prisma.food.findMany({
      where: { id: { in: [...ids] }, createdByUserId: null },
    });
    const byId = new Map(foods.map((f) => [f.id, f]));
    for (const id of ids) if (!byId.has(id)) throw new NotFoundException(`Food ${id} not found`);
    return byId;
  }

  private async logsOf(planId: string, date: string) {
    const logs = await this.prisma.nutritionPlanLog.findMany({
      where: { date, planMeal: { planId } },
      select: { planMealId: true, optionId: true, mealId: true },
    });
    return new Map(logs.map((l) => [l.planMealId, { mealId: l.mealId, optionId: l.optionId }]));
  }

  private async swapsOf(planId: string, date: string) {
    const swaps = await this.prisma.nutritionSwap.findMany({
      where: { planId, date, undoneAt: null },
    });
    return new Map<string, PlanSwapView>(
      swaps.map((s) => [
        s.itemId,
        {
          id: s.id,
          equivalentId: s.equivalentId,
          foodName: s.foodName,
          grams: s.grams,
          kcal: s.kcal,
        },
      ]),
    );
  }

  /**
   * Primeiro nome do autor quando ele vê o diário: vínculo vivo com
   * Alimentação, na comunidade em que o plano veio, e o autor ainda ativo nela.
   * Nulo em qualquer outro caso — e o aviso diz "fica só no seu diário".
   */
  private async viewerOf(
    userId: string,
    plan: { authorId: string | null; groupId: string | null; author: { name: string } | null },
  ): Promise<string | null> {
    if (!plan.authorId || !plan.groupId || !plan.author) return null;
    const [link, membership] = await Promise.all([
      this.prisma.professionalLink.findFirst({
        where: {
          subjectUserId: userId,
          professionalId: plan.authorId,
          groupId: plan.groupId,
          revokedAt: null,
          scopes: { has: ShareScope.NUTRITION },
        },
        select: { id: true },
      }),
      this.prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: plan.groupId, userId: plan.authorId } },
        select: { status: true },
      }),
    ]);
    return link && membership?.status === MembershipStatus.ACTIVE
      ? firstName(plan.author.name)
      : null;
  }

  private async week(userId: string, timezone: string) {
    const today = todayInTz(timezone);
    const first = addDaysIso(today, -(WEEK_DAYS - 1));
    return { inRangeDays: await this.inRange(userId, timezone, first, today), days: WEEK_DAYS };
  }

  /** Dias com calorias na faixa (ADR 027): a mesma conta dos desafios. */
  private async inRange(userId: string, timezone: string, first: string, last: string) {
    const days = await this.adherence.forDays([{ userId, timezone }], first, last);
    return days.get(userId)?.kcalInRange.size ?? 0;
  }

  private view(
    plan: PlanRow,
    logs: Map<string, { mealId: string; optionId: string }>,
    swaps: Map<string, PlanSwapView>,
  ): NutritionPlanView {
    return {
      id: plan.id,
      version: plan.version,
      status: plan.status,
      author: plan.author ? { name: plan.author.name } : null,
      sentAt: plan.sentAt,
      acceptedAt: plan.acceptedAt,
      goals: goalsOf(plan),
      applyGoals: plan.applyGoals,
      note: plan.note,
      meals: plan.meals.map((meal) => ({
        id: meal.id,
        mealType: meal.mealType,
        name: meal.name,
        position: meal.position,
        logged: logs.get(meal.id) ?? null,
        options: meal.options.map((option) => {
          const eaten = option.items.map((item) => {
            const s = swaps.get(item.id);
            return (s && item.equivalents.find((e) => e.id === s.equivalentId)) || item;
          });
          return {
            id: option.id,
            position: option.position,
            kcal: round2(eaten.reduce((n, i) => n + i.kcal, 0)),
            proteinG: round2(eaten.reduce((n, i) => n + i.proteinG, 0)),
            carbsG: round2(eaten.reduce((n, i) => n + i.carbsG, 0)),
            fatG: round2(eaten.reduce((n, i) => n + i.fatG, 0)),
            items: option.items.map((item) => ({
              ...foodView(item),
              equivalenceGroup: item.equivalenceGroup,
              equivalents: item.equivalents.map(foodView),
              swap: swaps.get(item.id) ?? null,
            })),
          };
        }),
      })),
    };
  }
}
