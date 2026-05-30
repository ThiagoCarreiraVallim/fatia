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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MealType } from '@prisma/client';

export class MealItemInputDto {
  @IsOptional()
  @IsInt()
  foodId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  foodName?: string;

  @IsNumber()
  @Min(0.1)
  grams!: number;

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

  @IsOptional() @IsNumber() @Min(0) kcal?: number;
  @IsOptional() @IsNumber() @Min(0) proteinG?: number;
  @IsOptional() @IsNumber() @Min(0) carbsG?: number;
  @IsOptional() @IsNumber() @Min(0) fatG?: number;
  @IsOptional() @IsObject() nutrients?: Record<string, number>;
}
