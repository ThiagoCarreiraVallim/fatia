import { MealType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchFoodDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  groupId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ListFoodShortcutsDto {
  /** Refeição sendo registrada: o que costuma ir nela sobe na lista. */
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}

/** Medida caseira: "colher de sopa" = 25 g. */
export class CreateFoodPortionDto {
  @IsString()
  @MaxLength(40)
  label!: string;

  @IsNumber()
  @Min(0.1)
  @Max(2000)
  grams!: number;
}

export class CreateCustomFoodDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsInt()
  groupId?: number;

  @IsNumber()
  @Min(0)
  kcalPer100g!: number;

  @IsNumber()
  @Min(0)
  proteinPer100g!: number;

  @IsNumber()
  @Min(0)
  carbsPer100g!: number;

  @IsNumber()
  @Min(0)
  fatPer100g!: number;

  /** Medidas que já nascem com o alimento — a porção do rótulo, no scanner. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CreateFoodPortionDto)
  portions?: CreateFoodPortionDto[];

  /**
   * Micronutrientes por 100 g, na mesma base dos macros (#375):
   * `{ "fiber_g": 9, "sodium_mg": 112 }`. Chave e valor conferidos no service,
   * que a tool MCP também usa.
   */
  @IsOptional()
  @IsObject()
  nutrients?: Record<string, number>;

  /** Código de barras ligado pela pessoa (EAN/UPC, só dígitos). Único entre os alimentos dela. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{8,14}$/, { message: 'Código de barras: de 8 a 14 dígitos.' })
  barcode?: string;
}

export class UpdateCustomFoodDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsInt()
  groupId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  kcalPer100g?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  proteinPer100g?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  carbsPer100g?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fatPer100g?: number;

  /** `null` apaga todos os micronutrientes; um objeto troca o mapa inteiro. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsObject()
  nutrients?: Record<string, number> | null;

  /** `null` desliga o código do alimento. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @Matches(/^\d{8,14}$/, { message: 'Código de barras: de 8 a 14 dígitos.' })
  barcode?: string | null;
}
