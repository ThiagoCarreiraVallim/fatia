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
import { SharedWithService } from '../sharing/shared-with.service';
import { MealService, type ResolvedItem } from './meal.service';
import { DailyAdherenceService } from './daily-adherence.service';
import { assertGoalsValid, upsertWithHistory } from './user-goals.service';
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
  /** Horário sugerido ("07:00", #407), ou nulo. */
  time: string | null;
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
  /** "O que mudou" (#405), da versão 2 em diante. */
  changeNote: string | null;
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
    source: 'PLAN',
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
const PLAN_ALREADY_HANDLED =
  'Esse plano já foi aceito ou substituído. Atualize a tela para ver o plano em uso.';
const CONCURRENT_CHANGE = 'O plano mudou ao mesmo tempo em outro lugar. Tente de novo.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** O item do diário ligado ao item do plano, pelo `itemLinks` do registro. */
function linkOf(links: Prisma.JsonValue, planItemId: string): string | null {
  if (!links || typeof links !== 'object' || Array.isArray(links)) return null;
  const value = (links as Prisma.JsonObject)[planItemId];
  return typeof value === 'string' ? value : null;
}

/** Enfileira quem grava plano alimentar para a mesma pessoa (revisão do PR #461). */
async function lockPlanOf(db: Prisma.TransactionClient, userId: string) {
  const key = `nutrition-plan:${userId}`;
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

@Injectable()
export class NutritionPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meals: MealService,
    private readonly adherence: DailyAdherenceService,
    private readonly sharedWith: SharedWithService,
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
    const student = await this.receiver(authorId, membershipId);
    const meals = await this.prepareMeals(input);
    const { plan } = await this.prisma.$transaction((db) =>
      this.writePlan(db, authorId, student, input, meals, {}),
    );
    return this.view(plan, new Map(), new Map());
  }

  /**
   * O plano alimentar da biblioteca para várias pessoas (#405). Tudo numa
   * transação: ou o lote inteiro recebe, ou ninguém. A versão, o "o que mudou"
   * e a substituição do que esperava aceite contam só o MESMO modelo
   * (`sourceTemplateId`) do mesmo autor: um modelo diferente é plano novo e
   * não tira o pendente do outro (revisão do PR #461).
   */
  async sendFromTemplate(
    authorId: string,
    membershipIds: string[],
    inputs: SendNutritionPlanInput[],
    origin: { sourceTemplateId: string; changeNote?: string | null },
  ): Promise<Array<{ plan: NutritionPlanView; update: boolean }>> {
    const students: Array<{ userId: string; groupId: string }> = [];
    for (const id of membershipIds) students.push(await this.receiver(authorId, id));
    // Cada pessoa com o seu plano: o ajuste às kcal dela (#407) muda as quantidades.
    const prepared = await Promise.all(inputs.map((input) => this.prepareMeals(input)));
    const out = await this.prisma.$transaction(
      async (db) => {
        for (const userId of [...new Set(students.map((s) => s.userId))].sort()) {
          await lockPlanOf(db, userId);
        }
        const written = [];
        for (const [i, student] of students.entries()) {
          written.push(
            await this.writePlan(db, authorId, student, inputs[i]!, prepared[i]!, origin),
          );
        }
        return written;
      },
      { timeout: 60_000 },
    );
    return out.map((w) => ({ plan: this.view(w.plan, new Map(), new Map()), update: w.update }));
  }

  /**
   * Uma versão nova pela cópia do aluno (#407, Pn-24c): a mesma linhagem
   * (aluno, autor e modelo), com quem editou e o "o que mudou". A versão
   * aceita segue em uso até a pessoa aceitar a nova; a que esperava aceite
   * sai. `baseVersionId` é a versão que o editor abriu: se outra foi salva
   * depois, 409 e nada muda.
   */
  async writeCopyVersion(
    /** O autor da linhagem; nulo se ele apagou a conta (a cópia segue na mesma linhagem). */
    authorId: string | null,
    student: { userId: string; groupId: string },
    input: SendNutritionPlanInput,
    origin: {
      sourceTemplateId: string | null;
      changeNote: string | null;
      editedById: string;
      baseVersionId?: string;
    },
  ): Promise<{ plan: NutritionPlanView; update: boolean }> {
    const meals = await this.prepareMeals(input);
    const w = await this.prisma.$transaction((db) =>
      this.writePlan(db, authorId, student, input, meals, {
        sourceTemplateId: origin.sourceTemplateId ?? undefined,
        changeNote: origin.changeNote,
        editedById: origin.editedById,
        baseVersionId: origin.baseVersionId,
        // A cópia é uma linhagem só: o mesmo autor e o mesmo modelo, ou nenhum.
        exactLineage: true,
      }),
    );
    return { plan: this.view(w.plan, new Map(), new Map()), update: w.update };
  }

  /** O aluno que recebe e quem envia, da equipe ativa da mesma comunidade. */
  private async receiver(authorId: string, membershipId: string) {
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
    return { userId: student.userId, groupId: student.groupId };
  }

  /** Valida e resolve os alimentos fora da transação: um 400 não abre transação à toa. */
  private async prepareMeals(input: SendNutritionPlanInput) {
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
    const meals = input.meals.map((meal, mealPos) => ({
      mealType: meal.mealType,
      name: meal.name.trim(),
      position: mealPos,
      time: meal.time ?? null,
      key: meal.key ?? null,
      options: {
        create: meal.options.map((option, optionPos) => ({
          position: optionPos,
          items: {
            create: option.items.map((item, itemPos) => ({
              ...resolve(item),
              position: itemPos,
              equivalenceGroup: item.equivalenceGroup?.trim() || null,
              key: item.key ?? null,
              groupKey: item.groupKey ?? null,
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

    return meals;
  }

  /**
   * Grava uma versão. Trava a pessoa antes de ler a última versão: dois envios
   * ao mesmo tempo não saem com o mesmo número nem deixam dois pendentes.
   */
  private async writePlan(
    db: Prisma.TransactionClient,
    authorId: string | null,
    student: { userId: string; groupId: string },
    input: SendNutritionPlanInput,
    meals: Awaited<ReturnType<NutritionPlanService['prepareMeals']>>,
    origin: {
      sourceTemplateId?: string;
      changeNote?: string | null;
      editedById?: string;
      baseVersionId?: string;
      exactLineage?: boolean;
    },
  ) {
    await lockPlanOf(db, student.userId);
    const last = await db.nutritionPlan.findFirst({
      where: { userId: student.userId, authorId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    // Pela biblioteca, só o mesmo modelo conta como versão anterior.
    const lineage = Boolean(origin.sourceTemplateId) || origin.exactLineage === true;
    const mesmo = lineage ? { sourceTemplateId: origin.sourceTemplateId ?? null } : {};
    if (origin.baseVersionId) {
      // Duas pessoas da equipe na mesma cópia: a segunda não sobrescreve a primeira.
      const ultima = await db.nutritionPlan.findFirst({
        where: { userId: student.userId, authorId, ...mesmo },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      if (ultima && ultima.id !== origin.baseVersionId) {
        throw new ConflictException('Outra pessoa salvou esta cópia; recarregue.');
      }
    }
    const previous = lineage
      ? await db.nutritionPlan.findFirst({
          where: {
            userId: student.userId,
            authorId,
            ...mesmo,
            status: { in: ['SENT', 'ACCEPTED'] },
          },
          select: { id: true },
        })
      : last;
    // A versão anterior que ainda esperava o aceite sai: a nova a substitui.
    await db.nutritionPlan.updateMany({
      where: { userId: student.userId, authorId, ...mesmo, status: 'SENT' },
      data: { status: 'SUPERSEDED', supersededAt: new Date() },
    });
    const plan = await db.nutritionPlan.create({
      data: {
        userId: student.userId,
        authorId,
        groupId: student.groupId,
        version: (last?.version ?? 0) + 1,
        ...goalsOf(input.goals),
        applyGoals: input.applyGoals ?? true,
        note: input.note?.trim() || null,
        // A primeira versão não tem o que mudou.
        changeNote: previous ? origin.changeNote?.trim() || null : null,
        sourceTemplateId: origin.sourceTemplateId ?? null,
        editedById: origin.editedById ?? null,
        ...(input.equivalenceGroups !== undefined
          ? { equivalenceGroups: input.equivalenceGroups as Prisma.InputJsonValue }
          : {}),
        meals: { create: meals },
      },
      include: PLAN_INCLUDE,
    });
    return { plan, update: Boolean(previous) };
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
      active ? this.viewerOf(userId, active) : { teamSees: false, viewerName: null },
      this.week(userId, timezone),
    ]);

    return {
      date: day,
      active: active ? this.view(active, logs, swaps) : null,
      pending: pending ? this.view(pending, new Map(), new Map()) : null,
      ...viewer,
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
      where: { id: planId, userId },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw new NotFoundException(PLAN_NOT_FOUND);
    // Já aceito ou substituído: 409, e nada muda (o mesmo que o segundo toque
    // ao mesmo tempo recebe, lá dentro da transação).
    if (plan.status !== 'SENT') throw new ConflictException(PLAN_ALREADY_HANDLED);
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = todayInTz(owner.timezone);

    await this.inTransaction(async (db) => {
      // Primeiro, e dentro da transação: trava a linha e confere que o plano
      // ainda espera aceite. Um segundo toque (ou um plano já substituído)
      // para aqui, antes de mexer nas refeições salvas.
      const now = new Date();
      const claimed = await db.nutritionPlan.updateMany({
        where: { id: plan.id, userId, status: 'SENT' },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) throw new ConflictException(PLAN_ALREADY_HANDLED);

      const previous = await db.nutritionPlan.findFirst({
        where: { userId, status: 'ACCEPTED' },
        select: { id: true },
      });
      const fromPrevious = await db.nutritionPlanOption.findMany({
        where: { meal: { plan: { userId, status: 'ACCEPTED' } }, mealTemplateId: { not: null } },
        select: { mealTemplateId: true },
      });
      await db.mealTemplate.deleteMany({
        where: { userId, id: { in: fromPrevious.map((o) => o.mealTemplateId!) } },
      });
      await db.nutritionPlan.updateMany({
        where: { userId, status: 'ACCEPTED' },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });
      await db.nutritionPlan.update({
        where: { id: plan.id },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      if (previous) await this.carryOver(db, previous.id, plan, today);

      if (plan.applyGoals) {
        const goals = goalsOf(plan);
        // As metas de antes ficam no histórico (#396).
        await upsertWithHistory(db, userId, goals, { source: 'nutrition_plan' });
      }

      let room = MAX_TEMPLATES_PER_USER - (await db.mealTemplate.count({ where: { userId } }));
      for (const meal of plan.meals) {
        for (const option of meal.options) {
          // O teto de refeições salvas vale também aqui. O que não couber fica
          // só no plano, que continua registrando pelo "comi isso".
          if (room <= 0) continue;
          // Refeição "sem sugestão" (#407) não vira refeição salva vazia.
          if (option.items.length === 0) continue;
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
   * O que a pessoa já fez de hoje em diante no plano que sai segue na versão
   * nova (#407, "as trocas que ela já fez continuam"): a troca e o "comi isso"
   * passam a apontar o item e a refeição de mesma chave (`key`, ou o id no
   * plano sem chave, que é a chave que a cópia devolve). Nada se apaga: é a
   * mesma linha, com o vínculo trocado. Sem par na versão nova (alimento ou
   * equivalente que saiu), fica no plano antigo, como histórico.
   */
  private async carryOver(
    db: Prisma.TransactionClient,
    previousId: string,
    next: PlanRow,
    today: string,
  ): Promise<void> {
    const nextMeals = new Map(next.meals.map((m) => [m.key ?? m.id, m]));
    const nextItems = new Map(
      next.meals.flatMap((m) => m.options.flatMap((o) => o.items.map((i) => [i.key ?? i.id, i]))),
    );
    const swaps = await db.nutritionSwap.findMany({
      where: { planId: previousId, date: { gte: today }, undoneAt: null },
      include: { item: true, equivalent: { select: { foodId: true } } },
    });
    for (const swap of swaps) {
      const item = nextItems.get(swap.item.key ?? swap.item.id);
      if (!item || item.foodId !== swap.item.foodId) continue;
      const eq = item.equivalents.find((e) => e.foodId === swap.equivalent.foodId);
      if (!eq) continue;
      await db.nutritionSwap.update({
        where: { id: swap.id },
        data: { planId: next.id, itemId: item.id, equivalentId: eq.id },
      });
    }

    const logs = await db.nutritionPlanLog.findMany({
      where: { planMeal: { planId: previousId }, date: { gte: today } },
      include: {
        planMeal: { select: { id: true, key: true } },
        option: { select: { position: true, items: { select: { id: true, key: true } } } },
      },
    });
    for (const log of logs) {
      const meal = nextMeals.get(log.planMeal.key ?? log.planMeal.id);
      const option = meal?.options.find((o) => o.position === log.option.position);
      if (!option) continue;
      const keyOf = new Map(log.option.items.map((i) => [i.id, i.key ?? i.id]));
      const idOfKey = new Map(option.items.map((i) => [i.key ?? i.id, i.id]));
      const links: Record<string, string> = {};
      for (const [oldItemId, mealItemId] of Object.entries(
        (log.itemLinks ?? {}) as Record<string, string>,
      )) {
        const novo = idOfKey.get(keyOf.get(oldItemId) ?? '');
        if (novo) links[novo] = mealItemId;
      }
      await db.nutritionPlanLog.update({
        where: { id: log.id },
        data: { planMealId: meal!.id, optionId: option.id, itemLinks: links },
      });
    }
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
    if (chosen.items.length === 0) {
      throw new BadRequestException(
        `${planMeal.name} não tem sugestão no plano: registre o que comeu pela busca.`,
      );
    }

    const eatenAt = dto.eatenAt ? parseInstant(dto.eatenAt, 'eatenAt') : new Date();
    const date = dateInTz(eatenAt, timezone);
    // Toque repetido devolve o mesmo registro. A conferência é atalho; quem
    // garante é o índice único (planMealId, date), lá embaixo.
    const already = await this.prisma.nutritionPlanLog.findUnique({
      where: { planMealId_date: { planMealId, date } },
      select: { mealId: true },
    });
    if (already) return { mealId: already.mealId, date };

    const swaps = await this.prisma.nutritionSwap.findMany({
      where: { itemId: { in: chosen.items.map((i) => i.id) }, date, undoneAt: null },
      include: { equivalent: true },
    });
    const swapOf = new Map(swaps.map((s) => [s.itemId, s]));
    // Origem do item (#374): o que entra pelo plano fica marcado como PLAN.
    const items: ResolvedItem[] = chosen.items.map((item) => ({
      ...snapshotOf(swapOf.get(item.id)?.equivalent ?? item),
      source: 'PLAN',
    }));

    const meal = await this.meals.createResolved(
      userId,
      { mealType: planMeal.mealType, eatenAt },
      items,
    );
    // Item do plano -> item gravado, para a troca achar o item mesmo depois de
    // a pessoa editar nome ou gramas no diário.
    const itemLinks: Record<string, string> = {};
    for (const [index, item] of chosen.items.entries()) {
      const mealItem = meal.items[index];
      if (mealItem) itemLinks[item.id] = mealItem.id;
    }
    try {
      await this.prisma.$transaction(async (db) => {
        await db.nutritionPlanLog.create({
          data: { planMealId, optionId: chosen.id, mealId: meal.id, date, itemLinks },
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
      // próximo toque: desfaz.
      await this.prisma.meal.delete({ where: { id: meal.id } });
      // Dois toques ao mesmo tempo: o outro gravou primeiro. É o mesmo registro.
      if (isUniqueViolation(error)) {
        const winner = await this.prisma.nutritionPlanLog.findUnique({
          where: { planMealId_date: { planMealId, date } },
          select: { mealId: true },
        });
        if (winner) return { mealId: winner.mealId, date };
      }
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
      select: { itemLinks: true },
    });
    const linkedMealItemId = log ? linkOf(log.itemLinks, item.id) : null;

    const swap = await this.inTransaction(async (db) => {
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
      // O item gravado vem do vínculo do "comi isso", nunca de nome e gramas:
      // a pessoa pode ter corrigido o item no diário.
      const targetId = linkedMealItemId ?? previous?.mealItemId ?? null;
      if (targetId) {
        const changed = await db.mealItem.updateMany({
          where: { id: targetId, meal: { userId } },
          data: mealItemData(equivalent),
        });
        if (changed.count === 1) mealItemId = targetId;
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
      ...viewer,
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
        // Opção vazia é a refeição "sem sugestão" do editor (#407, Pn-24b).
        if (option.items.length > MAX_TEMPLATE_ITEMS) {
          throw new BadRequestException(`Cada opção tem até ${MAX_TEMPLATE_ITEMS} alimentos.`);
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
   * Quem vê o diário: qualquer pessoa da equipe com Alimentação liberada,
   * ativa na comunidade (a mesma regra da porta única, que é o que a
   * `teamView` usa). Nomeia o autor do plano quando é ele; senão a tela diz
   * "sua equipe". Só quando ninguém vê o aviso diz "fica só no seu diário".
   */
  private async viewerOf(
    userId: string,
    plan: { authorId: string | null; author: { name: string } | null },
  ): Promise<{ teamSees: boolean; viewerName: string | null }> {
    const viewers = await this.sharedWith.viewersOf(userId, ShareScope.NUTRITION);
    const authorSees = plan.authorId !== null && plan.author && viewers.includes(plan.authorId);
    return {
      teamSees: viewers.length > 0,
      viewerName: authorSees ? firstName(plan.author!.name) : null,
    };
  }

  /**
   * Transação em que os índices únicos parciais (um plano aceito por pessoa,
   * uma troca ativa por item e dia) são a última palavra: corrida perdida vira
   * 409, nunca 500.
   */
  private async inTransaction<T>(fn: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(CONCURRENT_CHANGE);
      throw error;
    }
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
      changeNote: plan.changeNote,
      meals: plan.meals.map((meal) => ({
        id: meal.id,
        mealType: meal.mealType,
        name: meal.name,
        position: meal.position,
        time: meal.time,
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
