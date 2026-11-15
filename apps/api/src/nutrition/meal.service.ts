import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { MediaStatus, Prisma, type MealItemSource } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { MEAL_PHOTO_PURPOSE, MediaService, type MediaView } from '../storage/media.service';
import { presentMeal } from './meal-presenter';
import { addDaysIso, dayBoundsInTz, todayInTz } from '../progress/helpers/date-tz';
import type { CreateMealDto, ListMealsDto, MealItemInputDto, UpdateMealDto } from './dto/meal.dto';
import { calcMacrosFromFood, calcNutrientsFromFood, type ItemMacros } from './helpers/calc-macros';
import { gramsFromPortion, visiblePortions } from './helpers/portion';
import { ITENS_EM_ORDEM } from './itens-em-ordem';
import { assertDay, parseInstant } from '../common/dates';

/** Item pronto para gravar: macros já calculados (ou copiados de um registro anterior). */
export interface ResolvedItem extends ItemMacros {
  foodId: number | null;
  foodName: string;
  groupId: number | null;
  grams: number;
  portionLabel?: string;
  portionQuantity?: number;
  nutrients?: Prisma.InputJsonValue;
  source?: MealItemSource;
}

/** Mantém só pares chave→número finito (ignora lixo) ou undefined se vazio. */
function sanitizeNutrients(
  raw: Record<string, number> | undefined,
): Prisma.InputJsonValue | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/**
 * Assinatura estável do conjunto de itens: identifica cada item por alimento e
 * gramas, independente da ordem em que vieram. Macros ficam fora porque são
 * derivados do alimento — dois envios iguais produzem os mesmos macros.
 */
function fingerprintItems(
  items: Array<{ foodId: number | null; foodName: string; grams: number }>,
) {
  return items
    .map((item) => `${item.foodId ?? item.foodName.trim().toLowerCase()}:${item.grams}`)
    .sort()
    .join('|');
}

@Injectable()
export class MealService {
  constructor(
    private readonly prisma: PrismaService,
    /** Apaga o arquivo da foto junto (ADR 038). Opcional só para os testes de cálculo. */
    @Optional() private readonly media?: MediaService,
  ) {}

  async create(userId: string, dto: CreateMealDto) {
    // Aqui, e não só no DTO: a tool MCP chega com `z.string()`.
    const eatenAt = parseInstant(dto.eatenAt, 'eatenAt');
    const items = await this.resolveItems(userId, dto.items);
    const photoFileId = dto.photoFileId
      ? await this.findUnlinkedPhoto(userId, dto.photoFileId)
      : undefined;
    const meal = { mealType: dto.mealType, eatenAt, notes: dto.notes };
    try {
      return await this.createResolved(userId, { ...meal, photoFileId }, items);
    } catch (error) {
      // Dois salvamentos ao mesmo tempo com a mesma foto: o segundo perde só a
      // foto (uma por refeição), não a refeição.
      if (!photoFileId || !isPhotoTaken(error)) throw error;
      return this.createResolved(userId, meal, items);
    }
  }

  /**
   * A foto que vai virar desta refeição: guardada pelo reconhecimento para esta
   * pessoa e ainda sem refeição. A de outra pessoa, a já usada e a que a limpeza
   * já levou dão no mesmo: a refeição é gravada sem foto, sem dizer qual foi o
   * caso (#92). Um id do corpo nunca liga o arquivo de outro, e perder a foto
   * não pode custar a refeição que a pessoa revisou.
   */
  private async findUnlinkedPhoto(userId: string, fileId: string): Promise<string | undefined> {
    const file = await this.prisma.mediaFile.findFirst({
      where: {
        id: fileId,
        uploaderId: userId,
        groupId: null,
        purpose: MEAL_PHOTO_PURPOSE,
        status: MediaStatus.READY,
        mealPhotoOf: { is: null },
      },
      select: { id: true },
    });
    return file?.id;
  }

  /**
   * Grava uma refeição com itens já resolvidos. É por aqui que copiar refeição e
   * registrar refeição salva passam: o retrato dos itens vai como está, e a mesma
   * guarda de duplicata vale (tocar duas vezes não grava duas vezes).
   */
  async createResolved(
    userId: string,
    meal: {
      mealType: CreateMealDto['mealType'];
      eatenAt: Date;
      notes?: string;
      photoFileId?: string;
    },
    items: ResolvedItem[],
  ) {
    const { mealType, eatenAt, notes, photoFileId } = meal;
    const duplicate = await this.findDuplicate(userId, eatenAt, mealType, items);
    if (duplicate) {
      throw new ConflictException(
        `Refeição idêntica já registrada (id ${duplicate.id}): mesmo tipo, mesmo horário e mesmos itens. ` +
          'Se foi uma repetição não intencional, nada a fazer. Se o usuário realmente comeu isso duas vezes, ' +
          'ajuste eatenAt para o horário correto da segunda refeição.',
      );
    }

    return presentMeal(
      await this.prisma.meal.create({
        data: {
          userId,
          mealType,
          eatenAt,
          notes,
          photoFileId,
          items: { create: items },
        },
        include: ITENS_EM_ORDEM,
      }),
    );
  }

  /**
   * Detecta reenvio da mesma refeição (issue #94).
   *
   * Chave natural: `userId + eatenAt + mealType + itens`. Um cliente MCP que dá
   * timeout e repete a chamada manda payload idêntico — inclusive o `eatenAt` —,
   * então igualdade exata de timestamp isola justamente o caso de retry sem
   * bloquear quem de fato comeu a mesma coisa em outro horário.
   *
   * `notes` fica fora da chave de propósito: mudar só a observação não faz da
   * refeição outra refeição.
   */
  private async findDuplicate(
    userId: string,
    eatenAt: Date,
    mealType: CreateMealDto['mealType'],
    items: ResolvedItem[],
  ) {
    const candidates = await this.prisma.meal.findMany({
      where: { userId, eatenAt, mealType },
      include: ITENS_EM_ORDEM,
    });
    if (candidates.length === 0) return null;

    const target = fingerprintItems(items);
    return candidates.find((meal) => fingerprintItems(meal.items) === target) ?? null;
  }

  async findById(userId: string, id: string) {
    const meal = await this.prisma.meal.findFirst({
      where: { id, userId },
      include: ITENS_EM_ORDEM,
    });
    if (!meal) throw new NotFoundException('Meal not found');
    return presentMeal(meal);
  }

  /**
   * A refeição com a foto, para a tela da refeição: URL assinada de curta
   * duração (ADR 028), emitida só para a dona.
   */
  async findWithPhoto(userId: string, id: string) {
    const meal = await this.prisma.meal.findFirst({
      where: { id, userId },
      include: { ...ITENS_EM_ORDEM, photoFile: true },
    });
    if (!meal) throw new NotFoundException('Meal not found');
    const { photoFile, ...rest } = meal;
    const photo: MediaView | null =
      photoFile && this.media ? await this.media.view(photoFile) : null;
    return { ...presentMeal(rest), photo };
  }

  /**
   * Lista refeições do usuário. Cursor pagination: cursor é o id da última.
   * Se `date` for fornecido, filtra ao dia no fuso do usuário (baseado em eatenAt).
   */
  async list(userId: string, params: ListMealsDto, timezone: string) {
    const limit = Math.min(params.limit ?? 20, 50);
    const where: Prisma.MealWhereInput = { userId };
    if (params.date) {
      const { start, end } = dayBoundsInTz(assertDay(params.date, 'date'), timezone);
      where.eatenAt = { gte: start, lt: end };
    }
    const meals = await this.prisma.meal.findMany({
      where,
      include: ITENS_EM_ORDEM,
      orderBy: [{ eatenAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    return meals.map(presentMeal);
  }

  async update(userId: string, id: string, dto: UpdateMealDto) {
    const eatenAt = dto.eatenAt ? parseInstant(dto.eatenAt, 'eatenAt') : undefined;
    await this.assertOwner(userId, id);
    return presentMeal(
      await this.prisma.meal.update({
        where: { id },
        data: {
          mealType: dto.mealType,
          eatenAt,
          notes: dto.notes,
        },
        include: ITENS_EM_ORDEM,
      }),
    );
  }

  /**
   * As fotos das refeições dos últimos `days` dias, para quem a pessoa liberou
   * "Fotos das refeições" (ADR 038, item 3). Só a foto e o contexto mínimo da
   * refeição; os números são da categoria Alimentação.
   */
  async listPhotos(userId: string, days: number, timezone: string) {
    const today = todayInTz(timezone);
    const { start } = dayBoundsInTz(addDaysIso(today, -(days - 1)), timezone);
    const { end } = dayBoundsInTz(today, timezone);
    const meals = await this.prisma.meal.findMany({
      where: { userId, eatenAt: { gte: start, lt: end }, photoFileId: { not: null } },
      select: { id: true, mealType: true, eatenAt: true, photoFile: true },
      orderBy: { eatenAt: 'desc' },
      take: 60,
    });
    const out: Array<{
      mealId: string;
      mealType: (typeof meals)[number]['mealType'];
      eatenAt: Date;
      photo: MediaView;
    }> = [];
    for (const meal of meals) {
      if (!meal.photoFile || !this.media) continue;
      out.push({
        mealId: meal.id,
        mealType: meal.mealType,
        eatenAt: meal.eatenAt,
        photo: await this.media.view(meal.photoFile),
      });
    }
    return out;
  }

  /** Apagar a refeição apaga o arquivo da foto (ADR 038, item 5). */
  async delete(userId: string, id: string): Promise<void> {
    const meal = await this.assertOwner(userId, id);
    await this.prisma.meal.delete({ where: { id } });
    await this.discardPhoto(meal.photoFileId);
  }

  /**
   * "Apagar só a foto" (#374): o arquivo some do bucket e a refeição fica com
   * os números. Sem foto, 404: não há o que apagar, e repetir não finge sucesso.
   */
  async deletePhoto(userId: string, id: string) {
    const meal = await this.assertOwner(userId, id);
    if (!meal.photoFileId) throw new NotFoundException('Photo not found');
    const updated = await this.prisma.meal.update({
      where: { id },
      data: { photoFileId: null },
      include: ITENS_EM_ORDEM,
    });
    await this.discardPhoto(meal.photoFileId);
    return presentMeal(updated);
  }

  private async discardPhoto(fileId: string | null): Promise<void> {
    if (!fileId) return;
    if (this.media) {
      await this.media.discardById(fileId);
    } else {
      await this.prisma.mediaFile.deleteMany({ where: { id: fileId } });
    }
  }

  /** Medida visível do alimento, ou 404 — alheia e inexistente respondem igual. */
  async resolvePortion(
    userId: string,
    foodId: number,
    portionId: string,
  ): Promise<{ id: string; label: string; grams: number }> {
    const portion = await this.prisma.foodPortion.findFirst({
      where: { id: portionId, foodId, ...visiblePortions(userId) },
      select: { id: true, label: true, grams: true },
    });
    if (!portion) throw new NotFoundException(`Portion ${portionId} not found`);
    return portion;
  }

  private async assertOwner(userId: string, id: string) {
    const meal = await this.prisma.meal.findUnique({
      where: { id },
      select: { userId: true, photoFileId: true },
    });
    // Mesma resposta para "não existe" e "não é sua" (§IDs de docs/MCP.md).
    if (!meal || meal.userId !== userId) throw new NotFoundException('Meal not found');
    return meal;
  }

  /**
   * Resolve cada item: se tiver foodId, busca Food (validando ownership) e calcula
   * macros via regra de 3. Se for item livre (sem foodId), exige foodName + macros explícitos.
   */
  async resolveItems(userId: string, items: MealItemInputDto[]): Promise<ResolvedItem[]> {
    const result: ResolvedItem[] = [];
    for (const item of items) {
      if (item.foodId !== undefined) {
        const food = await this.prisma.food.findFirst({
          where: {
            id: item.foodId,
            OR: [{ createdByUserId: null }, { createdByUserId: userId }],
          },
        });
        if (!food) throw new NotFoundException(`Food ${item.foodId} not found`);
        const amount = await this.resolveAmount(userId, food.id, item);
        const macros = calcMacrosFromFood(food, amount.grams);
        // Micros explícitos (estimativa do Claude/correção) vencem; senão deriva do
        // catálogo por regra de 3 — assim logar um alimento da TACO já preenche sódio
        // & cia. sem digitação (ADR 009).
        const nutrients =
          sanitizeNutrients(item.nutrients) ?? calcNutrientsFromFood(food.nutrients, amount.grams);
        result.push({
          foodId: food.id,
          foodName: item.foodName ?? food.name,
          groupId: item.groupId ?? food.groupId,
          ...amount,
          ...macros,
          nutrients,
          ...(item.source ? { source: item.source } : {}),
        });
      } else {
        if (!item.foodName) {
          // Validação de input, não de autorização — mapeia para INVALID_INPUT.
          throw new BadRequestException('Item livre requer foodName');
        }
        if (item.portionId !== undefined) {
          throw new BadRequestException('Medida caseira só vale para item com foodId');
        }
        if (item.grams === undefined) {
          throw new BadRequestException('Item livre requer grams');
        }
        result.push({
          foodId: null,
          foodName: item.foodName,
          groupId: item.groupId ?? null,
          grams: item.grams,
          kcal: item.kcal ?? 0,
          proteinG: item.proteinG ?? 0,
          carbsG: item.carbsG ?? 0,
          fatG: item.fatG ?? 0,
          nutrients: sanitizeNutrients(item.nutrients),
          ...(item.source ? { source: item.source } : {}),
        });
      }
    }
    return result;
  }

  /**
   * Quantidade do item: gramas, ou medida caseira × quantidade. As duas juntas
   * é ambíguo (qual vale?) e nenhuma é falta de dado — 400 nos dois casos.
   * Com medida, devolve também o retrato de como foi digitado.
   */
  async resolveAmount(
    userId: string,
    foodId: number,
    item: Pick<MealItemInputDto, 'grams' | 'portionId' | 'quantity'>,
  ): Promise<{ grams: number; portionLabel?: string; portionQuantity?: number }> {
    if (item.portionId === undefined) {
      if (item.grams === undefined) {
        throw new BadRequestException('Informe grams ou portionId + quantity');
      }
      return { grams: item.grams };
    }
    if (item.grams !== undefined) {
      throw new BadRequestException('Use grams ou portionId + quantity, não os dois');
    }
    if (item.quantity === undefined) {
      throw new BadRequestException('portionId requer quantity');
    }
    const portion = await this.resolvePortion(userId, foodId, item.portionId);
    return {
      grams: gramsFromPortion(portion.grams, item.quantity),
      portionLabel: portion.label,
      portionQuantity: item.quantity,
    };
  }
}

/** A violação de unicidade de `Meal.photoFileId`: outra refeição levou a foto antes. */
function isPhotoTaken(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  return JSON.stringify(error.meta ?? {}).includes('photoFileId');
}
