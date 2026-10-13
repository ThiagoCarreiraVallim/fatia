import { Injectable } from '@nestjs/common';
import type { MealType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { FoodService } from './food.service';
import { includePortions, withPortionViews, type FoodWithPortions } from './helpers/portion';

/** Alimento da busca com o que a pessoa já fez com ele: o atalho que poupa digitar. */
export type FoodShortcut = FoodWithPortions & {
  /** Gramagem da última vez — o valor que o drawer já sugere preenchido. */
  lastGrams: number | null;
  /** Como foi digitado da última vez ("2 × colher de sopa"); nulos quando foi em gramas. */
  lastPortionLabel: string | null;
  lastPortionQuantity: number | null;
  timesEaten: number;
  favorite: boolean;
};

export interface FoodShortcuts {
  favorites: FoodShortcut[];
  recent: FoodShortcut[];
}

/** Janela do histórico: o que se come hoje, não o que se comeu no ano passado. */
const HISTORY_DAYS = 60;
/** Teto de itens lidos: o bastante para 60 dias de quem registra tudo. */
const HISTORY_ITEMS = 600;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

interface Usage {
  foodId: number;
  lastGrams: number;
  lastPortionLabel: string | null;
  lastPortionQuantity: number | null;
  lastEatenAt: Date;
  timesEaten: number;
  timesAtMeal: number;
}

/**
 * Recentes e favoritos da busca de alimento — o coração do registro sem IA.
 *
 * Os recentes não têm tabela: saem do próprio histórico de `MealItem`, então
 * apagar uma refeição apaga junto o rastro dela. Só itens com `foodId` entram;
 * item livre (estimado, sem alimento do catálogo) não tem para onde apontar.
 */
@Injectable()
export class FoodShortcutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foods: FoodService,
  ) {}

  async list(
    userId: string,
    params: { mealType?: MealType; limit?: number },
  ): Promise<FoodShortcuts> {
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);

    const [items, favoriteRows] = await Promise.all([
      this.prisma.mealItem.findMany({
        where: { foodId: { not: null }, meal: { userId, eatenAt: { gte: since } } },
        select: {
          foodId: true,
          grams: true,
          portionLabel: true,
          portionQuantity: true,
          meal: { select: { mealType: true, eatenAt: true } },
        },
        orderBy: { meal: { eatenAt: 'desc' } },
        take: HISTORY_ITEMS,
      }),
      this.prisma.favoriteFood.findMany({
        where: { userId },
        include: { food: { include: includePortions(userId) } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const usage = new Map<number, Usage>();
    for (const item of items) {
      if (item.foodId === null) continue;
      const atMeal = params.mealType !== undefined && item.meal.mealType === params.mealType;
      const seen = usage.get(item.foodId);
      if (seen) {
        seen.timesEaten++;
        if (atMeal) seen.timesAtMeal++;
        continue;
      }
      // A primeira ocorrência é a mais recente: a lista vem do banco em ordem decrescente.
      usage.set(item.foodId, {
        foodId: item.foodId,
        lastGrams: item.grams,
        lastPortionLabel: item.portionLabel,
        lastPortionQuantity: item.portionQuantity,
        lastEatenAt: item.meal.eatenAt,
        timesEaten: 1,
        timesAtMeal: atMeal ? 1 : 0,
      });
    }

    const favoriteIds = new Set(favoriteRows.map((row) => row.food.id));
    const favorites = favoriteRows.map((row) =>
      withUsage(withPortionViews(row.food, userId), usage.get(row.food.id), true),
    );

    // Pedindo para o café da manhã, o pão de sempre vem antes do jantar de ontem;
    // dentro do mesmo grupo, o mais recente primeiro.
    const ranked = [...usage.values()]
      .filter((u) => !favoriteIds.has(u.foodId))
      .sort(
        (a, b) =>
          Number(b.timesAtMeal > 0) - Number(a.timesAtMeal > 0) ||
          b.timesAtMeal - a.timesAtMeal ||
          b.lastEatenAt.getTime() - a.lastEatenAt.getTime(),
      );

    if (ranked.length === 0) return { favorites, recent: [] };

    // O histórico guarda o id, não a visibilidade: um custom pode ter sido
    // apagado desde então. O filtro de dono é o mesmo da busca.
    const visible = await this.prisma.food.findMany({
      where: {
        id: { in: ranked.map((u) => u.foodId) },
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
      include: includePortions(userId),
    });
    const byId = new Map(visible.map((f) => [f.id, withPortionViews(f, userId)]));

    const recent: FoodShortcut[] = [];
    for (const u of ranked) {
      const food = byId.get(u.foodId);
      if (food) recent.push(withUsage(food, u, false));
      if (recent.length === limit) break;
    }
    return { favorites, recent };
  }

  /** Idempotente nos dois sentidos: marcar duas vezes ou desmarcar o que não existe não erra. */
  async setFavorite(userId: string, foodId: number, favorite: boolean): Promise<void> {
    if (!favorite) {
      await this.prisma.favoriteFood.deleteMany({ where: { userId, foodId } });
      return;
    }
    // Só se favorita o que se enxerga; custom alheio responde 404 como na busca.
    await this.foods.get(userId, foodId);
    await this.prisma.favoriteFood.upsert({
      where: { userId_foodId: { userId, foodId } },
      create: { userId, foodId },
      update: {},
    });
  }
}

function withUsage(
  food: FoodWithPortions,
  usage: Usage | undefined,
  favorite: boolean,
): FoodShortcut {
  return {
    ...food,
    lastGrams: usage?.lastGrams ?? null,
    lastPortionLabel: usage?.lastPortionLabel ?? null,
    lastPortionQuantity: usage?.lastPortionQuantity ?? null,
    timesEaten: usage?.timesEaten ?? 0,
    favorite,
  };
}
