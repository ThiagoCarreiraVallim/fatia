import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MealType } from '@prisma/client';

/** Um quarto de colher até vinte unidades: fora disso é engano de digitação. */
export const MIN_PORTION_QUANTITY = 0.25;
export const MAX_PORTION_QUANTITY = 20;

export class MealItemInputDto {
  @IsOptional()
  @IsInt()
  foodId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  foodName?: string;

  /** Ou gramas, ou medida caseira (`portionId` + `quantity`) — nunca as duas. */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  grams?: number;

  @IsOptional()
  @IsUUID()
  portionId?: string;

  @IsOptional()
  @IsNumber()
  @Min(MIN_PORTION_QUANTITY)
  @Max(MAX_PORTION_QUANTITY)
  quantity?: number;

  // Para items livres (sem foodId), Claude pode estimar macros diretamente.
  @IsOptional() @IsNumber() @Min(0) kcal?: number;
  @IsOptional() @IsNumber() @Min(0) proteinG?: number;
  @IsOptional() @IsNumber() @Min(0) carbsG?: number;
  @IsOptional() @IsNumber() @Min(0) fatG?: number;

  // Micronutrientes opcionais (ADR 009): { "sodium_mg": 412, "sugar_g": 9 }.
  @IsOptional() @IsObject() nutrients?: Record<string, number>;

  @IsOptional()
  @IsInt()
  groupId?: number;
}

export class CreateMealDto {
  @IsEnum(MealType)
  mealType!: MealType;

  @IsDateString()
  eatenAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MealItemInputDto)
  items!: MealItemInputDto[];
}

export class UpdateMealDto {
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @IsOptional()
  @IsDateString()
  eatenAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListMealsDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class UpdateMealItemDto {
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  grams?: number;

  /** Troca a quantidade por medida caseira; ver `MealItemInputDto.portionId`. */
  @IsOptional()
  @IsUUID()
  portionId?: string;

  @IsOptional()
  @IsNumber()
  @Min(MIN_PORTION_QUANTITY)
  @Max(MAX_PORTION_QUANTITY)
  quantity?: number;

  @IsOptional() @IsNumber() @Min(0) kcal?: number;
  @IsOptional() @IsNumber() @Min(0) proteinG?: number;
  @IsOptional() @IsNumber() @Min(0) carbsG?: number;
  @IsOptional() @IsNumber() @Min(0) fatG?: number;
  @IsOptional() @IsObject() nutrients?: Record<string, number>;
}
