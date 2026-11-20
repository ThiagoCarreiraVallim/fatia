import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
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
import { MAX_PLAN_TAGS, MAX_TAG_LENGTH } from '../plan-snapshot-v2';

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
  /** Rascunho (#405): não vai para a comunidade nem é enviado. */
  @IsOptional() @IsBoolean() draft?: boolean;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsIn([...PLAN_LEVELS, null]) level?: string | null;
  @IsOptional() @IsUUID() coverFileId?: string | null;
}

/**
 * O editor de treino (#406): o plano inteiro (`document`, conferido pelo
 * schema do editor no service), etiquetas, agenda e período.
 */
class WorkoutFieldsDto extends TemplateMetaDto {
  @IsOptional() @IsObject() document?: Record<string, unknown>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PLAN_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  tags?: string[];
  @IsOptional() @IsIn(['CALENDAR', 'FLEXIBLE', null]) schedule?: 'CALENDAR' | 'FLEXIBLE' | null;
  @IsOptional() @IsString() @MaxLength(10) startDate?: string | null;
  @IsOptional() @IsString() @MaxLength(10) endDate?: string | null;
}

export class CreateWorkoutTemplateDto extends WorkoutFieldsDto {
  /** "A partir do seu plano". Sem ele, o plano vem do editor (`document`). */
  @IsOptional()
  @IsUUID()
  planId?: string;
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

export class UpdateTemplateDto extends WorkoutFieldsDto {
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
  /** "Anunciar no mural" (#405): sem ele, vale a configuração da comunidade. */
  @IsOptional() @IsBoolean() announce?: boolean;
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
