import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FoodSource, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { CreateCustomFoodDto, SearchFoodDto, UpdateCustomFoodDto } from './dto/food.dto';
import { MatchRank, matchRank, normalizeSearchText } from '../common/search-text';
import { includePortions, withPortionViews, type FoodWithPortions } from './helpers/portion';

export type { FoodWithPortions } from './helpers/portion';

/** Teto físico por 100 g: gordura pura dá 900 kcal, e os macros não pesam mais que o alimento. */
export const MAX_KCAL_PER_100G = 900;
export const MAX_MACROS_PER_100G = 100;

interface Per100g {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

const MACROS = [
  ['proteinPer100g', 'Proteína'],
  ['carbsPer100g', 'Carboidrato'],
  ['fatPer100g', 'Gordura'],
] as const;

/**
 * Recusa o que não cabe em 100 g. Sem isso, um "1000" digitado no lugar de "100"
 * vira um alimento que estraga o total de toda refeição em que entrar.
 */
function assertPlausible(values: Per100g): void {
  if (values.kcalPer100g > MAX_KCAL_PER_100G) {
    throw new BadRequestException(`Calorias passam de ${MAX_KCAL_PER_100G} kcal em 100 g.`);
  }
  for (const [key, label] of MACROS) {
    if (values[key] > MAX_MACROS_PER_100G) {
      throw new BadRequestException(`${label} passa de ${MAX_MACROS_PER_100G} g em 100 g.`);
    }
  }
  const total = values.proteinPer100g + values.carbsPer100g + values.fatPer100g;
  if (total > MAX_MACROS_PER_100G) {
    throw new BadRequestException(
      `Proteína, carboidrato e gordura somam mais de ${MAX_MACROS_PER_100G} g em 100 g.`,
    );
  }
}

/** Chave de `Food.nutrients`: a mesma forma de `NutrientTarget.nutrientKey` ("sodium_mg"). */
const NUTRIENT_KEY = /^[a-z0-9_]{1,40}$/;
const MAX_NUTRIENTS = 40;
/** Teto de quem não é em gramas (mg, mcg…): 100 g de sal têm 39 300 mg de sódio. */
const MAX_NUTRIENT_OTHER = 1_000_000;
/** Mesma regra de `isValidBarcode` (api-client) e do Open Food Facts. */
const BARCODE = /^\d{8,14}$/;

/**
 * Micronutrientes por 100 g (#375), validados aqui e não só no DTO: a tool MCP
 * grava pelo mesmo método. Nutriente em gramas não pesa mais que o alimento.
 */
function validNutrients(nutrients: Record<string, unknown>): Record<string, number> {
  const entries = Object.entries(nutrients);
  if (entries.length > MAX_NUTRIENTS) {
    throw new BadRequestException(`No máximo ${MAX_NUTRIENTS} micronutrientes por alimento.`);
  }
  const out: Record<string, number> = {};
  for (const [key, value] of entries) {
    if (!NUTRIENT_KEY.test(key)) {
      throw new BadRequestException(`Micronutriente "${key}" fora do formato (ex.: fiber_g).`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`Valor inválido para ${key}.`);
    }
    const max = key.endsWith('_g') ? MAX_MACROS_PER_100G : MAX_NUTRIENT_OTHER;
    if (value > max) throw new BadRequestException(`${key} passa do possível em 100 g.`);
    out[key] = value;
  }
  return out;
}

function assertBarcode(code: string): void {
  if (!BARCODE.test(code)) throw new BadRequestException('Código de barras: de 8 a 14 dígitos.');
}

/**
 * O código na forma em que é guardado e procurado: o UPC-A de 12 dígitos e o
 * GTIN-14 que começa com zero são o mesmo produto do EAN-13, e a câmera lê um ou
 * outro conforme o leitor. Tudo de 12 a 14 dígitos vira GTIN-13 quando cabe; o
 * EAN-8 fica como está.
 */
export function canonicalBarcode(code: string): string {
  if (code.length < 12) return code;
  const gtin14 = code.padStart(14, '0');
  return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
}

function trimmedName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new BadRequestException('Dê um nome ao alimento.');
  return trimmed;
}

/**
 * As uniques de `Food` que a pessoa alcança: `[name, source, createdByUserId]` e
 * `[createdByUserId, barcode]`. A corrida de dois toques em "Salvar" cai aqui
 * também, e vira 409, não 500.
 */
function uniqueViolation(err: unknown): 'barcode' | 'name' | 'unknown' | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  if (fields.some((field) => field.includes('barcode'))) return 'barcode';
  if (fields.some((field) => field.includes('name'))) return 'name';
  // Alguns drivers não dizem o índice: quem decide é a consulta em `duplicateOr`.
  return 'unknown';
}

@Injectable()
export class FoodService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca alimentos no catálogo público (TACO/USDA) + customs do usuário.
   *
   * O filtro roda sobre `searchName` (sem acento, sem pontuação) para que
   * "feijao" ache "Feijão" — no teclado do celular ninguém acentua — e palavra por
   * palavra: "ovo cozido" acha "Ovo, de galinha, inteiro, cozido/10minutos", que não
   * contém o termo inteiro. A ordem está em `rankFoods`.
   *
   * Quando há termo, o `take` do banco é omitido de propósito e o corte acontece
   * depois do ranqueamento: limitar antes traria os 20 primeiros **em ordem
   * alfabética** e o melhor resultado poderia ficar de fora. O conjunto filtrado
   * de um termo real é pequeno, e o catálogo inteiro tem centenas de linhas, não
   * milhões.
   */
  async search(userId: string, params: SearchFoodDto): Promise<FoodWithPortions[]> {
    const limit = Math.min(params.limit ?? 20, 50);
    const term = params.q ? normalizeSearchText(params.q) : '';
    const words = term ? term.split(' ') : [];

    const matches = await this.prisma.food.findMany({
      where: {
        AND: [
          { OR: [{ createdByUserId: null }, { createdByUserId: userId }] },
          { AND: words.map((word) => ({ searchName: { contains: word } })) },
          params.groupId ? { groupId: params.groupId } : {},
        ],
      },
      orderBy: [{ name: 'asc' }],
      include: includePortions(userId),
      ...(term ? {} : { take: limit }),
    });

    const ranked = term ? rankFoods(matches, term, limit) : matches;
    return ranked.map((food) => withPortionViews(food, userId));
  }

  async get(userId: string, id: number): Promise<FoodWithPortions> {
    const food = await this.prisma.food.findFirst({
      where: {
        id,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
      include: includePortions(userId),
    });
    if (!food) throw new NotFoundException('Food not found');
    return withPortionViews(food, userId);
  }

  async createCustom(userId: string, dto: CreateCustomFoodDto): Promise<FoodWithPortions> {
    const name = trimmedName(dto.name);
    assertPlausible(dto);
    const nutrients = dto.nutrients ? validNutrients(dto.nutrients) : undefined;
    if (dto.barcode) assertBarcode(dto.barcode);
    const barcode = dto.barcode ? canonicalBarcode(dto.barcode) : undefined;
    await this.assertGroupExists(dto.groupId);

    const food = await this.prisma.food
      .create({
        data: {
          name,
          searchName: normalizeSearchText(name),
          source: FoodSource.CUSTOM,
          createdByUserId: userId,
          groupId: dto.groupId,
          kcalPer100g: dto.kcalPer100g,
          proteinPer100g: dto.proteinPer100g,
          carbsPer100g: dto.carbsPer100g,
          fatPer100g: dto.fatPer100g,
          ...(nutrients && Object.keys(nutrients).length ? { nutrients } : {}),
          ...(barcode ? { barcode } : {}),
          ...(dto.portions?.length
            ? {
                portions: {
                  create: dto.portions.map((p) => ({
                    label: p.label.trim(),
                    grams: p.grams,
                    createdByUserId: userId,
                  })),
                },
              }
            : {}),
        },
        include: includePortions(userId),
      })
      .catch(async (err: unknown) => {
        throw await this.duplicateOr(err, userId, name, barcode);
      });
    return withPortionViews(food, userId);
  }

  async updateCustom(
    userId: string,
    id: number,
    dto: UpdateCustomFoodDto,
  ): Promise<FoodWithPortions> {
    const food = await this.prisma.food.findUnique({ where: { id } });
    // Alimento de outro usuário responde igual a inexistente. Os IDs de Food são
    // inteiros sequenciais, então distinguir "existe mas não é seu" de "não
    // existe" permitiria enumerar o catálogo privado alheio (#92).
    if (!food || food.source !== FoodSource.CUSTOM || food.createdByUserId !== userId) {
      throw new NotFoundException('Food not found');
    }
    const name = dto.name === undefined ? undefined : trimmedName(dto.name);
    // A soma dos macros vale para o alimento inteiro: o que não veio fica como está.
    assertPlausible({
      kcalPer100g: dto.kcalPer100g ?? food.kcalPer100g,
      proteinPer100g: dto.proteinPer100g ?? food.proteinPer100g,
      carbsPer100g: dto.carbsPer100g ?? food.carbsPer100g,
      fatPer100g: dto.fatPer100g ?? food.fatPer100g,
    });
    if (dto.barcode) assertBarcode(dto.barcode);
    await this.assertGroupExists(dto.groupId);

    const { nutrients, barcode: rawBarcode, ...rest } = dto;
    const barcode =
      rawBarcode === undefined || rawBarcode === null ? rawBarcode : canonicalBarcode(rawBarcode);
    const data: Prisma.FoodUncheckedUpdateInput = {
      ...rest,
      ...(barcode !== undefined ? { barcode } : {}),
      // `searchName` acompanha o nome — se ficar para trás, a busca continua
      // achando o alimento pelo nome antigo e não pelo novo.
      ...(name ? { name, searchName: normalizeSearchText(name) } : {}),
    };
    if (nutrients === null) data.nutrients = Prisma.DbNull;
    else if (nutrients !== undefined) {
      const valid = validNutrients(nutrients);
      data.nutrients = Object.keys(valid).length ? valid : Prisma.DbNull;
    }

    const updated = await this.prisma.food
      .update({
        where: { id },
        data,
        include: includePortions(userId),
      })
      .catch(async (err: unknown) => {
        throw await this.duplicateOr(err, userId, name ?? food.name, barcode ?? undefined, id);
      });
    return withPortionViews(updated, userId);
  }

  async deleteCustom(userId: string, id: number): Promise<void> {
    const food = await this.prisma.food.findUnique({ where: { id } });
    // Ver updateCustom: resposta indistinguível para não permitir enumeração.
    if (!food || food.source !== FoodSource.CUSTOM || food.createdByUserId !== userId) {
      throw new NotFoundException('Food not found');
    }
    await this.prisma.food.delete({ where: { id } });
  }

  /** Os alimentos que a pessoa cadastrou, para a tela "Meus alimentos". */
  async listCustom(userId: string): Promise<FoodWithPortions[]> {
    const foods = await this.prisma.food.findMany({
      where: { source: FoodSource.CUSTOM, createdByUserId: userId },
      orderBy: { name: 'asc' },
      include: includePortions(userId),
    });
    return foods.map((food) => withPortionViews(food, userId));
  }

  /** Grupo inexistente estouraria a chave estrangeira como 500. */
  private async assertGroupExists(groupId: number | undefined): Promise<void> {
    if (groupId === undefined) return;
    const group = await this.prisma.foodGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new BadRequestException('Grupo de alimento inexistente.');
  }

  private async duplicateOr(
    err: unknown,
    userId: string,
    name: string,
    barcode?: string,
    exceptId?: number,
  ): Promise<unknown> {
    let kind = uniqueViolation(err);
    if (kind === 'unknown') {
      // O meta não disse qual índice: o código só conflita se outro alimento da
      // pessoa já o tem. Senão, a única outra unique alcançável é o nome.
      const holder = barcode
        ? await this.prisma.food.findFirst({
            where: {
              createdByUserId: userId,
              barcode,
              ...(exceptId !== undefined ? { NOT: { id: exceptId } } : {}),
            },
            select: { id: true },
          })
        : null;
      kind = holder ? 'barcode' : 'name';
    }
    switch (kind) {
      case 'barcode':
        return new ConflictException('Esse código de barras já está em outro alimento seu.');
      case 'name':
        return new ConflictException(`Você já tem um alimento chamado "${name}".`);
      default:
        return err;
    }
  }

  /**
   * O alimento próprio que a pessoa ligou a este código, ou `null` (#375). Só os
   * dela: o código de outra conta não é achado nem confirmado.
   */
  async findByBarcode(userId: string, code: string): Promise<FoodWithPortions | null> {
    if (!BARCODE.test(code)) return null;
    const food = await this.prisma.food.findFirst({
      where: {
        source: FoodSource.CUSTOM,
        createdByUserId: userId,
        barcode: canonicalBarcode(code),
      },
      include: includePortions(userId),
    });
    return food ? withPortionViews(food, userId) : null;
  }

  async listGroups() {
    return this.prisma.foodGroup.findMany({ orderBy: { name: 'asc' } });
  }
}

/**
 * A relevância de `rankByRelevance` — exato, começa com, palavra que começa com, contém —, mais
 * duas coisas que só o catálogo de alimentos pede.
 *
 * O termo com palavras fora de ordem ("ovo cozido") entra depois de tudo que contém o termo
 * inteiro, com cada palavra começando uma palavra do nome.
 *
 * O empate não vai direto para o nome mais curto. Os nomes da TACO são segmentados por vírgula
 * do geral para o particular, e quem busca só o geral ("ovo", "leite") quer a variante comum,
 * que é a que o catálogo detalha mais: há cinco "Ovo, de galinha" e um "Ovo, de codorna", e o
 * mais curto — com a ordem alfabética no desempate — era o de codorna. Por isso o empate vai
 * primeiro para a família (os dois primeiros segmentos) com mais entradas no resultado.
 */
function rankFoods<T extends { name: string }>(foods: T[], term: string, limit: number): T[] {
  const words = term.split(' ');
  const scored = foods
    .map((food) => {
      const normalized = normalizeSearchText(food.name);
      let rank = matchRank(normalized, term);
      if (rank === MatchRank.None && words.every((w) => ` ${normalized}`.includes(` ${w}`))) {
        rank = MatchRank.AllWords;
      }
      const family = normalizeSearchText(food.name.split(',').slice(0, 2).join(' '));
      return { food, rank, family, length: normalized.length };
    })
    .filter((entry) => entry.rank !== MatchRank.None);

  const familySize = new Map<string, number>();
  for (const { family } of scored) familySize.set(family, (familySize.get(family) ?? 0) + 1);

  return scored
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (familySize.get(b.family) ?? 0) - (familySize.get(a.family) ?? 0) ||
        a.length - b.length ||
        a.food.name.localeCompare(b.food.name, 'pt-BR'),
    )
    .slice(0, limit)
    .map((entry) => entry.food);
}
