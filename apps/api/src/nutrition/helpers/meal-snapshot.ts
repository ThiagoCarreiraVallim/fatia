import type { MealItemSource, Prisma } from '@prisma/client';
import type { ResolvedItem } from '../meal.service';

/** Campos de item que copiar refeição e refeição salva carregam adiante. */
export interface ItemSnapshotSource {
  foodId: number | null;
  groupId: number | null;
  foodName: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutrients: Prisma.JsonValue | null;
  portionLabel: string | null;
  portionQuantity: number | null;
  /** A cópia de refeição leva a origem; a refeição salva não tem. */
  source?: MealItemSource;
}

/**
 * O item como foi registrado, pronto para gravar de novo. Não recalcula: o que
 * a pessoa confirmou da primeira vez é o que vale, mesmo que o alimento tenha
 * mudado ou sumido depois.
 */
export function snapshotOf(item: ItemSnapshotSource): ResolvedItem {
  return {
    foodId: item.foodId,
    groupId: item.groupId,
    foodName: item.foodName,
    grams: item.grams,
    kcal: item.kcal,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
    ...(item.nutrients !== null ? { nutrients: item.nutrients as Prisma.InputJsonValue } : {}),
    ...(item.portionLabel !== null && item.portionQuantity !== null
      ? { portionLabel: item.portionLabel, portionQuantity: item.portionQuantity }
      : {}),
    ...(item.source ? { source: item.source } : {}),
  };
}
