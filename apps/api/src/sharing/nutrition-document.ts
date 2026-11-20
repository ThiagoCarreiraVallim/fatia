import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaService } from '../common/prisma.service';
import type { SendNutritionPlanInput, SendPlanItem } from '../nutrition/dto/nutrition-plan.dto';
import { MAX_TEMPLATE_ITEMS } from '../nutrition/dto/meal-template.dto';
import { calcMacrosFromFood, calcNutrientsFromFood } from '../nutrition/helpers/calc-macros';
import {
  equivalentAmount,
  KEY_MACROS,
  keyAmount,
  keyPer100,
  rangesToTargets,
  scaleAmount,
  targetsToRanges,
  type Amount,
  type GoalRanges,
  type KeyMacro,
  type Per100,
  type PortionRef,
  type Targets,
} from '../nutrition/helpers/equivalents';
import {
  NUTRITION_SNAPSHOT_VERSION,
  nutritionGoalsSchema,
  nutritionSnapshotSchema,
  type NutritionGoals,
  type SuggestedMealItem,
} from './nutrition-snapshot';
import { describeIssues } from './plan-snapshot';

/**
 * O plano alimentar do editor da equipe (#407, Pn-24): metas do dia em número,
 * refeições com horário e opções, e grupos de equivalentes compartilhados entre
 * as refeições. É o retrato v2 do `GroupPlanTemplate` de nutrição; o v1 (metas
 * em faixa e refeições salvas, Fase 7) continua lido e sobe para v2 na leitura.
 *
 * Os alimentos são só os da base (ADR 045): o editor manda `foodId` e a
 * quantidade, e o servidor resolve nome e macros. Nada aqui é gerado pela IA.
 */

export const NUTRITION_SNAPSHOT_V2 = 2;
export const MAX_PLAN_MEALS = 8;
export const MAX_MEAL_OPTIONS = 4;
export const MAX_EQUIVALENCE_GROUPS = 20;
/** Um grupo com mais que isto vira lista de compras, não troca. */
export const MAX_GROUP_FOODS = 8;
export const MAX_MEAL_NAME = 40;
export const MAX_GROUP_NAME = 40;
const MAX_GRAMS = 5000;
const TETO_KCAL = 20_000;
const TETO_G = 2_000;

const chave = z.string().min(1).max(40);
const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'horário no formato HH:MM');
const mealType = z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']);

export const targetsSchema = z.object({
  kcal: z.number().int().min(0).max(TETO_KCAL),
  proteinG: z.number().int().min(0).max(TETO_G),
  carbsG: z.number().int().min(0).max(TETO_G),
  fatG: z.number().int().min(0).max(TETO_G),
});

const numero = z.number().min(0).max(100_000);
const foodSnapSchema = z.object({
  foodId: z.number().int().positive().nullable(),
  groupId: z.number().int().positive().nullable(),
  foodName: z.string().min(1).max(200),
  grams: z.number().positive().max(MAX_GRAMS),
  kcal: numero,
  proteinG: numero,
  carbsG: numero,
  fatG: numero,
  nutrients: z.record(z.string().max(40), z.number().min(0).max(100_000)).nullable(),
  portionLabel: z.string().max(80).nullable(),
  portionQuantity: z.number().positive().max(100_000).nullable(),
});
export type NutritionFoodSnap = z.infer<typeof foodSnapSchema>;

const itemSnapSchema = foodSnapSchema.extend({ key: chave, groupKey: chave.nullable() });
export type NutritionItemSnap = z.infer<typeof itemSnapSchema>;

const mealSnapSchema = z.object({
  key: chave,
  name: z.string().min(1).max(MAX_MEAL_NAME),
  time: horario.nullable(),
  mealType: mealType.nullable(),
  options: z
    .array(z.object({ items: z.array(itemSnapSchema).max(MAX_TEMPLATE_ITEMS) }))
    .min(1)
    .max(MAX_MEAL_OPTIONS),
});
export type NutritionMealSnap = z.infer<typeof mealSnapSchema>;

export const groupSnapSchema = z.object({
  key: chave,
  name: z.string().min(1).max(MAX_GROUP_NAME),
  keyMacro: z.enum(KEY_MACROS),
  foods: z.array(foodSnapSchema).max(MAX_GROUP_FOODS),
});
export type EquivalenceGroupSnap = z.infer<typeof groupSnapSchema>;

/** Chaves únicas e todo `groupKey` apontando para um grupo do plano. */
function checkRefs(
  s: {
    meals: Array<{ key?: string; options: Array<{ items: Array<{ groupKey?: string | null }> }> }>;
    groups: Array<{ key: string }>;
  },
  ctx: z.RefinementCtx,
) {
  const grupos = new Set<string>();
  s.groups.forEach((g, i) => {
    if (grupos.has(g.key)) {
      ctx.addIssue({ code: 'custom', path: ['groups', i, 'key'], message: 'chave repetida' });
    }
    grupos.add(g.key);
  });
  const refeicoes = new Set<string>();
  s.meals.forEach((m, i) => {
    if (m.key) {
      if (refeicoes.has(m.key)) {
        ctx.addIssue({ code: 'custom', path: ['meals', i, 'key'], message: 'chave repetida' });
      }
      refeicoes.add(m.key);
    }
    m.options.forEach((o, j) =>
      o.items.forEach((it, k) => {
        if (it.groupKey && !grupos.has(it.groupKey)) {
          ctx.addIssue({
            code: 'custom',
            path: ['meals', i, 'options', j, 'items', k, 'groupKey'],
            message: 'grupo de equivalentes que não existe no plano',
          });
        }
      }),
    );
  });
}

export const nutritionSnapshotV2Schema = z
  .object({
    version: z.literal(NUTRITION_SNAPSHOT_V2),
    targets: targetsSchema.nullable(),
    adjustToStudent: z.boolean(),
    meals: z.array(mealSnapSchema).max(MAX_PLAN_MEALS),
    groups: z.array(groupSnapSchema).max(MAX_EQUIVALENCE_GROUPS),
    /**
     * As faixas exatas do retrato v1, só na leitura: o modelo antigo é enviado
     * com as faixas que o autor escreveu, não com as refeitas das metas.
     */
    ranges: nutritionGoalsSchema.optional(),
  })
  .superRefine(checkRefs);
export type NutritionSnapshotV2 = z.infer<typeof nutritionSnapshotV2Schema>;

// ---------------------------------------------------------------- documento

const docFoodSchema = z.object({
  foodId: z.number().int().positive(),
  grams: z.number().positive().max(MAX_GRAMS),
  portionLabel: z.string().min(1).max(80).nullable().optional(),
  portionQuantity: z.number().positive().max(100).nullable().optional(),
});
export type NutritionDocFood = z.infer<typeof docFoodSchema>;

export const nutritionDocumentSchema = z
  .object({
    targets: targetsSchema.nullable(),
    adjustToStudent: z.boolean().optional(),
    meals: z
      .array(
        z.object({
          key: chave.optional(),
          name: z.string().trim().min(1).max(MAX_MEAL_NAME),
          time: horario.nullable().optional(),
          mealType: mealType.nullable().optional(),
          options: z
            .array(
              z.object({
                items: z
                  .array(
                    docFoodSchema.extend({
                      key: chave.optional(),
                      groupKey: chave.nullable().optional(),
                    }),
                  )
                  .max(MAX_TEMPLATE_ITEMS),
              }),
            )
            .min(1)
            .max(MAX_MEAL_OPTIONS),
        }),
      )
      .max(MAX_PLAN_MEALS),
    groups: z
      .array(
        z.object({
          key: chave,
          name: z.string().trim().min(1).max(MAX_GROUP_NAME),
          keyMacro: z.enum(KEY_MACROS),
          foods: z.array(docFoodSchema).max(MAX_GROUP_FOODS),
        }),
      )
      .max(MAX_EQUIVALENCE_GROUPS)
      .default([]),
  })
  .superRefine(checkRefs);
export type NutritionDocument = z.infer<typeof nutritionDocumentSchema>;

/** O que a equipe lê no editor: o retrato com nomes e macros, sem a versão. */
export type NutritionDocumentView = Omit<NutritionSnapshotV2, 'version' | 'ranges'>;

export function parseNutritionDocument(raw: unknown): NutritionDocument {
  const parsed = nutritionDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException(`Plano alimentar inválido (${describeIssues(parsed.error)}).`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------- leitura

/** v1 (Fase 7) sobe para v2: metas no meio da faixa, uma opção por refeição, sem grupos. */
export function upgradeNutritionV1(
  snap: z.infer<typeof nutritionSnapshotSchema>,
): NutritionSnapshotV2 {
  return {
    version: NUTRITION_SNAPSHOT_V2,
    targets: snap.goals ? rangesToTargets(snap.goals) : null,
    adjustToStudent: false,
    meals: snap.meals.map((m, i) => ({
      key: `v1-${i}`,
      name: m.name.slice(0, MAX_MEAL_NAME),
      time: null,
      mealType: m.mealType,
      options: [
        { items: m.items.map((it, j) => ({ ...it, key: `v1-${i}-${j}`, groupKey: null })) },
      ],
    })),
    groups: [],
    ...(snap.goals ? { ranges: snap.goals } : {}),
  };
}

/**
 * O retrato de nutrição em v2, venha v1 ou v2. Retrato inválido é 400: veio de
 * uma coluna `Json`, e nada se cria a partir dele.
 */
export function readNutritionSnapshot(raw: unknown): NutritionSnapshotV2 {
  const version = (raw as { version?: unknown } | null)?.version;
  if (version === NUTRITION_SNAPSHOT_VERSION) {
    const v1 = nutritionSnapshotSchema.safeParse(raw);
    if (v1.success) return upgradeNutritionV1(v1.data);
    throw new BadRequestException(
      `Plano de nutrição inválido (${describeIssues(v1.error)}). Nada foi criado.`,
    );
  }
  const v2 = nutritionSnapshotV2Schema.safeParse(raw);
  if (!v2.success) {
    throw new BadRequestException(
      `Plano de nutrição inválido (${describeIssues(v2.error)}). Nada foi criado.`,
    );
  }
  return v2.data;
}

export function nutritionDocumentView(snap: NutritionSnapshotV2): NutritionDocumentView {
  const { version, ranges, ...rest } = snap;
  void version;
  void ranges;
  return rest;
}

/**
 * O formato antigo da prévia e da adoção pela comunidade (Cm-14): metas em
 * faixa e uma refeição sugerida por refeição do plano (a primeira opção), sem
 * as refeições vazias. O v1 sai como foi gravado.
 */
export function legacyNutritionView(raw: unknown): {
  goals: NutritionGoals | null;
  meals: Array<{
    name: string;
    mealType: NutritionMealSnap['mealType'];
    items: SuggestedMealItem[];
  }>;
} {
  const version = (raw as { version?: unknown } | null)?.version;
  if (version === NUTRITION_SNAPSHOT_VERSION) {
    const v1 = nutritionSnapshotSchema.parse(raw);
    return { goals: v1.goals, meals: v1.meals };
  }
  const snap = readNutritionSnapshot(raw);
  return {
    goals: snap.targets ? targetsToRanges(snap.targets) : null,
    meals: snap.meals
      .filter((m) => (m.options[0]?.items.length ?? 0) > 0)
      .map((m) => ({
        name: m.name,
        mealType: m.mealType,
        items: m.options[0]!.items.map(({ key, groupKey, ...food }) => {
          void key;
          void groupKey;
          return food;
        }),
      })),
  };
}

// ---------------------------------------------------------------- gravar

/** Os alimentos citados, só da base, com as medidas caseiras do catálogo. */
export async function loadBaseFoods(
  prisma: PrismaService,
  ids: Iterable<number>,
): Promise<Map<number, FoodInfo>> {
  const lista = [...new Set(ids)];
  if (!lista.length) return new Map();
  const foods = await prisma.food.findMany({
    where: { id: { in: lista }, createdByUserId: null },
    include: { portions: { where: { createdByUserId: null }, orderBy: { grams: 'asc' } } },
  });
  return new Map(
    foods.map((f) => [
      f.id,
      {
        id: f.id,
        name: f.name,
        groupId: f.groupId,
        kcalPer100g: f.kcalPer100g,
        proteinPer100g: f.proteinPer100g,
        carbsPer100g: f.carbsPer100g,
        fatPer100g: f.fatPer100g,
        nutrients: f.nutrients,
        portions: f.portions.map((p) => ({ label: p.label, grams: p.grams })),
      },
    ]),
  );
}

export interface FoodInfo extends Per100 {
  id: number;
  name: string;
  groupId: number | null;
  nutrients: unknown;
  portions: PortionRef[];
}

const KEY_LABEL: Record<KeyMacro, string> = {
  carbs: 'carboidrato',
  protein: 'proteína',
  fat: 'gordura',
  kcal: 'calorias',
};

function foodSnap(food: FoodInfo, amount: Amount): NutritionFoodSnap {
  return {
    foodId: food.id,
    groupId: food.groupId,
    foodName: food.name,
    grams: amount.grams,
    ...calcMacrosFromFood(food, amount.grams),
    nutrients: calcNutrientsFromFood(food.nutrients, amount.grams) ?? null,
    portionLabel: amount.portionLabel,
    portionQuantity: amount.portionLabel ? amount.portionQuantity : null,
  };
}

const amountOf = (f: NutritionDocFood): Amount => ({
  grams: f.grams,
  portionLabel: f.portionLabel ?? null,
  portionQuantity: f.portionLabel ? (f.portionQuantity ?? null) : null,
});

/**
 * O documento do editor vira o retrato v2: cada alimento resolvido na base
 * (alimento pessoal, de quem for, é 404), macros calculados aqui, e chave
 * nova para refeição e item que ainda não têm.
 */
export async function documentToNutritionSnapshot(
  prisma: PrismaService,
  doc: NutritionDocument,
): Promise<NutritionSnapshotV2> {
  const ids = [
    ...doc.meals.flatMap((m) => m.options.flatMap((o) => o.items.map((i) => i.foodId))),
    ...doc.groups.flatMap((g) => g.foods.map((f) => f.foodId)),
  ];
  const foods = await loadBaseFoods(prisma, ids);
  const food = (id: number) => {
    const f = foods.get(id);
    if (!f) throw new NotFoundException(`Food ${id} not found`);
    return f;
  };

  const groups = doc.groups.map((g) => {
    const vistos = new Set<number>();
    return {
      key: g.key,
      name: g.name,
      keyMacro: g.keyMacro,
      foods: g.foods.map((gf) => {
        const f = food(gf.foodId);
        if (vistos.has(f.id)) {
          throw new BadRequestException(`${f.name} aparece duas vezes no grupo ${g.name}.`);
        }
        vistos.add(f.id);
        if (keyPer100(f, g.keyMacro) <= 0) {
          throw new BadRequestException(
            `${f.name} não tem ${KEY_LABEL[g.keyMacro]}: não serve de equivalente no grupo ${g.name}.`,
          );
        }
        return foodSnap(f, amountOf(gf));
      }),
    };
  });

  const usadas = new Set<string>();
  const novaChave = (k: string | undefined) => {
    const key = k && !usadas.has(k) ? k : randomUUID();
    usadas.add(key);
    return key;
  };
  const meals = doc.meals.map((m) => ({
    key: novaChave(m.key),
    name: m.name,
    time: m.time ?? null,
    mealType: m.mealType ?? null,
    options: m.options.map((o) => ({
      items: o.items.map((it) => ({
        ...foodSnap(food(it.foodId), amountOf(it)),
        key: novaChave(it.key),
        groupKey: it.groupKey ?? null,
      })),
    })),
  }));

  return nutritionSnapshotV2Schema.parse({
    version: NUTRITION_SNAPSHOT_V2,
    targets: doc.targets,
    adjustToStudent: doc.adjustToStudent ?? false,
    meals,
    groups,
  });
}

// ---------------------------------------------------------------- enviar

/** Metas vezes o fator das calorias de quem recebe. */
export function scaleTargets(t: Targets, factor: number): Targets {
  return {
    kcal: Math.round(t.kcal * factor),
    proteinG: Math.round(t.proteinG * factor),
    carbsG: Math.round(t.carbsG * factor),
    fatG: Math.round(t.fatG * factor),
  };
}

/** Fator do "Ajustar às metas de cada aluno": as kcal da pessoa sobre as do plano. */
export function studentFactor(
  snap: Pick<NutritionSnapshotV2, 'targets' | 'adjustToStudent'>,
  studentGoals: Pick<GoalRanges, 'kcalMin' | 'kcalMax'> | null,
): number {
  if (!snap.adjustToStudent || !snap.targets || !studentGoals || snap.targets.kcal <= 0) return 1;
  const kcal = (studentGoals.kcalMin + studentGoals.kcalMax) / 2;
  if (!(kcal > 0)) return 1;
  // Um plano de 2.000 kcal não vira 600 nem 5.000: fora disto é outro plano.
  return Math.min(2, Math.max(0.5, kcal / snap.targets.kcal));
}

/**
 * O retrato v2 como plano alimentar de uma pessoa (`NutritionPlanService`):
 * metas em faixa, quantidades ajustadas pelo fator e, para cada item de um
 * grupo com 2 ou mais alimentos, os outros alimentos do grupo na quantidade que
 * dá o mesmo macro-chave do item. Grupo com 1 alimento só não dá troca.
 */
export function buildNutritionSendInput(
  snap: NutritionSnapshotV2,
  foods: Map<number, FoodInfo>,
  opts: { factor?: number; note?: string | null },
): SendNutritionPlanInput {
  if (!snap.targets) {
    throw new BadRequestException(
      'Este plano alimentar não tem metas de calorias e macros: adicione as metas antes de enviar.',
    );
  }
  if (snap.meals.length === 0) {
    throw new BadRequestException('Este plano alimentar não tem refeições para enviar.');
  }
  const factor = opts.factor ?? 1;
  const groups = new Map(snap.groups.map((g) => [g.key, g]));
  const info = (foodId: number | null, foodName: string) => {
    const f = foodId === null ? undefined : foods.get(foodId);
    if (!f) {
      throw new BadRequestException(
        `"${foodName}" não é um alimento da base: troque por um da TACO antes de enviar.`,
      );
    }
    return f;
  };
  const payload = (a: Amount) => ({
    grams: a.grams,
    ...(a.portionLabel
      ? { portionLabel: a.portionLabel, portionQuantity: a.portionQuantity ?? undefined }
      : {}),
  });

  return {
    goals:
      snap.ranges && factor === 1
        ? snap.ranges
        : targetsToRanges(scaleTargets(snap.targets, factor)),
    applyGoals: true,
    note: opts.note?.trim() || undefined,
    equivalenceGroups: snap.groups,
    meals: snap.meals.map((m) => ({
      mealType: m.mealType ?? 'SNACK',
      name: m.name,
      time: m.time,
      key: m.key,
      options: m.options.map((o) => ({
        items: o.items.map((it): SendPlanItem => {
          const f = info(it.foodId, it.foodName);
          const amount =
            factor === 1
              ? {
                  grams: it.grams,
                  portionLabel: it.portionLabel,
                  portionQuantity: it.portionQuantity,
                }
              : scaleAmount(f, it, factor, f.portions);
          const group = it.groupKey ? groups.get(it.groupKey) : undefined;
          const equivalents: SendPlanItem['equivalents'] = [];
          if (group && group.foods.length >= 2) {
            const target = keyAmount(f, amount.grams, group.keyMacro);
            for (const gf of group.foods) {
              if (gf.foodId === null || gf.foodId === f.id) continue;
              const other = foods.get(gf.foodId);
              if (!other) continue;
              const a = equivalentAmount(other, target, other.portions, group.keyMacro);
              if (a) equivalents.push({ foodId: other.id, ...payload(a) });
            }
          }
          return {
            foodId: f.id,
            ...payload(amount),
            key: it.key,
            ...(group ? { equivalenceGroup: group.name, groupKey: group.key } : {}),
            ...(equivalents.length ? { equivalents } : {}),
          };
        }),
      })),
    })),
  };
}

/** Os `foodId` que o envio precisa (itens e grupos). */
export function snapshotFoodIds(snap: NutritionSnapshotV2): number[] {
  return [
    ...snap.meals.flatMap((m) =>
      m.options.flatMap((o) => o.items.flatMap((i) => (i.foodId ? [i.foodId] : []))),
    ),
    ...snap.groups.flatMap((g) => g.foods.flatMap((f) => (f.foodId ? [f.foodId] : []))),
  ];
}
