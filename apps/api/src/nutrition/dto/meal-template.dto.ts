import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MealType } from '@prisma/client';
import { MealItemInputDto } from './meal.dto';

/** Dia no calendário da pessoa, sem hora: `2026-10-14`. */
export const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YMD_MESSAGE = 'use o formato AAAA-MM-DD';

export const MAX_TEMPLATE_ITEMS = 30;
export const MAX_TEMPLATES_PER_USER = 50;
export const MAX_TEMPLATE_NAME = 60;

export class CopyMealDto {
  @Matches(YMD, { message: YMD_MESSAGE })
  toDate!: string;

  /** Muda o tipo na cópia (o lanche de ontem vira o café de hoje). */
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;
}

export class CopyDayDto {
  @Matches(YMD, { message: YMD_MESSAGE })
  fromDate!: string;

  @Matches(YMD, { message: YMD_MESSAGE })
  toDate!: string;
}

/** De uma refeição registrada (`mealId`) ou de itens soltos (`items`) — uma das duas. */
export class CreateMealTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TEMPLATE_NAME)
  name!: string;

  @IsOptional()
  @IsUUID()
  mealId?: string;

  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TEMPLATE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => MealItemInputDto)
  items?: MealItemInputDto[];
}

export class LogMealTemplateDto {
  @IsDateString()
  eatenAt!: string;

  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;
}
