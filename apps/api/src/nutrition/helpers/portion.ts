import type { Food, Prisma } from '@prisma/client';

/** Medida como sai da API: sem o id do dono, só se é da própria pessoa. */
export interface FoodPortionView {
  id: string;
  label: string;
  grams: number;
  mine: boolean;
}

/** Catálogo (sem dono) mais as da própria pessoa — o mesmo corte da busca de alimento. */
export function visiblePortions(userId: string) {
  return { OR: [{ createdByUserId: null }, { createdByUserId: userId }] };
}

export const PORTION_SELECT = {
  id: true,
  label: true,
  grams: true,
  createdByUserId: true,
} satisfies Prisma.FoodPortionSelect;

/** Catálogo primeiro, na ordem do JSON (ordem de criação); as da pessoa depois. */
export const PORTION_ORDER: Prisma.FoodPortionOrderByWithRelationInput[] = [{ createdAt: 'asc' }];

export function toPortionView(
  row: { id: string; label: string; grams: number; createdByUserId: string | null },
  userId: string,
): FoodPortionView {
  return { id: row.id, label: row.label, grams: row.grams, mine: row.createdByUserId === userId };
}

/** "2 × colher de sopa (25 g)" vira 50 g. Uma casa decimal: ½ de 15 g é 7,5 g. */
export function gramsFromPortion(portionGrams: number, quantity: number): number {
  return Math.round(portionGrams * quantity * 10) / 10;
}

/** Alimento com as medidas caseiras que a pessoa enxerga (catálogo + as dela). */
export type FoodWithPortions = Food & { portions: FoodPortionView[] };

type PortionRow = { id: string; label: string; grams: number; createdByUserId: string | null };

/** `include` do Prisma que traz junto as medidas visíveis do alimento. */
export function includePortions(userId: string) {
  return {
    portions: { where: visiblePortions(userId), select: PORTION_SELECT, orderBy: PORTION_ORDER },
  };
}

export function withPortionViews(
  food: Food & { portions?: PortionRow[] },
  userId: string,
): FoodWithPortions {
  return { ...food, portions: (food.portions ?? []).map((p) => toPortionView(p, userId)) };
}
