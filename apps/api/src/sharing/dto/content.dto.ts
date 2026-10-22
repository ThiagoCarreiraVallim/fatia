import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_TIP_BODY, PLAN_LEVELS, TIP_CATEGORIES, type TipCategory } from '../content.service';
import { MAX_SUGGESTED_MEALS } from '../nutrition-snapshot';

/** Rota de um item de conteúdo: o id é amarrado ao `groupId` no service. */
export class ContentParamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  id!: string;
}

const TETO = 100_000;

export class NutritionGoalsDto {
  @IsInt() @Min(0) @Max(TETO) kcalMin!: number;
  @IsInt() @Min(0) @Max(TETO) kcalMax!: number;
  @IsInt() @Min(0) @Max(TETO) proteinMinG!: number;
  @IsInt() @Min(0) @Max(TETO) proteinMaxG!: number;
  @IsInt() @Min(0) @Max(TETO) carbsMinG!: number;
  @IsInt() @Min(0) @Max(TETO) carbsMaxG!: number;
  @IsInt() @Min(0) @Max(TETO) fatMinG!: number;
  @IsInt() @Min(0) @Max(TETO) fatMaxG!: number;
}

class TemplateMetaDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsIn([...PLAN_LEVELS, null]) level?: string | null;
  @IsOptional() @IsUUID() coverFileId?: string | null;
}

export class CreateWorkoutTemplateDto extends TemplateMetaDto {
  @IsUUID()
  planId!: string;
}

export class CreateNutritionTemplateDto extends TemplateMetaDto {
  @IsString()
  @MaxLength(100)
  declare title: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NutritionGoalsDto)
  goals?: NutritionGoalsDto | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SUGGESTED_MEALS)
  @IsUUID('all', { each: true })
  mealTemplateIds?: string[];
}

export class UpdateTemplateDto extends TemplateMetaDto {
  @IsOptional() @IsUUID() planId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NutritionGoalsDto)
  goals?: NutritionGoalsDto | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SUGGESTED_MEALS)
  @IsUUID('all', { each: true })
  mealTemplateIds?: string[];
}

export class PublishDto {
  @IsBoolean()
  published!: boolean;
}

export class CreateTipDto {
  @IsString() @MaxLength(100) title!: string;
  @IsString() @MaxLength(MAX_TIP_BODY) body!: string;
  @IsIn(TIP_CATEGORIES) category!: TipCategory;
  @IsOptional() @IsUUID() imageFileId?: string | null;
}

export class UpdateTipDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(MAX_TIP_BODY) body?: string;
  @IsOptional() @IsIn(TIP_CATEGORIES) category?: TipCategory;
  @IsOptional() @IsUUID() imageFileId?: string | null;
}

export class TipStateDto {
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() pinned?: boolean;
}

export class AdoptDto {
  @IsOptional() @IsBoolean() applyGoals?: boolean;
  @IsOptional() @IsBoolean() saveMeals?: boolean;
}
