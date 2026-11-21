import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CUSTOM_EQUIPMENT_MAX_LENGTH,
  GYM_EQUIPMENT,
  MAX_CUSTOM_EQUIPMENT,
} from '../../workout/helpers/equipment';
import {
  ANATOMICAL_MUSCLES,
  MUSCLE_GROUP_MAX_LENGTH,
  MUSCLE_GROUP_PATTERN,
} from '../../workout/helpers/muscle-group';
import {
  MAX_GUIDE_LINE,
  MAX_GUIDE_MISTAKES,
  MAX_GUIDE_PHOTOS,
  MAX_GUIDE_STEPS,
  MAX_GUIDE_TIPS,
} from '../group-exercise.service';
import { PlanLoadMode } from '@fatia/db';
import { PLAN_LEVELS } from '../content.service';

const normalizeMuscleGroup = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const MUSCLES = ANATOMICAL_MUSCLES as unknown as string[];
/** Query string: "true"/"1" é verdadeiro; o resto, falso. */
const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value === 'true' || value === '1' : value;

/** Rota de um exercício da comunidade: o id é amarrado ao `groupId` no service. */
export class GroupExerciseParamDto {
  @IsUUID()
  groupId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  exerciseId!: number;
}

export class GuideDto {
  @IsOptional() @IsUUID() videoFileId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GUIDE_PHOTOS)
  @IsUUID('all', { each: true })
  photoFileIds?: string[];

  @IsOptional() @IsString() @MaxLength(MAX_GUIDE_TIPS) tips?: string | null;

  /** "Como fazer" da casa (#408): um passo por item. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GUIDE_STEPS)
  @IsString({ each: true })
  @MaxLength(MAX_GUIDE_LINE, { each: true })
  steps?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GUIDE_MISTAKES)
  @IsString({ each: true })
  @MaxLength(MAX_GUIDE_LINE, { each: true })
  commonMistakes?: string[];

  @IsOptional() @IsBoolean() homeFriendly?: boolean;

  /** O padrão ao entrar num plano. `null` limpa. */
  @IsOptional() @IsInt() @Min(1) @Max(20) defaultSets?: number | null;
  @IsOptional() @IsString() @MaxLength(20) defaultReps?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(900) defaultRestSeconds?: number | null;
  @IsOptional() @IsIn([...Object.values(PlanLoadMode), null]) defaultLoadMode?: PlanLoadMode | null;
}

export class UpdateGroupExerciseDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;

  @IsOptional()
  @Transform(normalizeMuscleGroup)
  @IsString()
  @MinLength(1)
  @MaxLength(MUSCLE_GROUP_MAX_LENGTH)
  @Matches(MUSCLE_GROUP_PATTERN)
  muscleGroup?: string;

  /**
   * Da lista, peso corporal, outro ou um equipamento próprio da academia. Quem
   * confere é o service, contra a academia da URL: a lista própria é de cada uma.
   */
  @IsOptional()
  @IsString()
  @MaxLength(CUSTOM_EQUIPMENT_MAX_LENGTH)
  equipment?: string | null;

  @IsOptional() @IsIn([...PLAN_LEVELS, null]) level?: string | null;
  @IsOptional() @IsIn(['compound', 'isolation', null]) mechanic?: string | null;

  @IsOptional() @IsArray() @IsIn(MUSCLES, { each: true }) primaryMuscles?: string[];
  @IsOptional() @IsArray() @IsIn(MUSCLES, { each: true }) secondaryMuscles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  instructions?: string[];
}

export class CreateGroupExerciseDto extends UpdateGroupExerciseDto {
  @IsString() @MinLength(1) @MaxLength(200) declare name: string;

  @Transform(normalizeMuscleGroup)
  @IsString()
  @MinLength(1)
  @MaxLength(MUSCLE_GROUP_MAX_LENGTH)
  @Matches(MUSCLE_GROUP_PATTERN)
  declare muscleGroup: string;

  @IsOptional() @IsUUID() videoFileId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GUIDE_PHOTOS)
  @IsUUID('all', { each: true })
  photoFileIds?: string[];

  @IsOptional() @IsString() @MaxLength(MAX_GUIDE_TIPS) tips?: string | null;

  /** "Como fazer" da casa (#408): um passo por item. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GUIDE_STEPS)
  @IsString({ each: true })
  @MaxLength(MAX_GUIDE_LINE, { each: true })
  steps?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GUIDE_MISTAKES)
  @IsString({ each: true })
  @MaxLength(MAX_GUIDE_LINE, { each: true })
  commonMistakes?: string[];

  @IsOptional() @IsBoolean() homeFriendly?: boolean;

  /** O padrão ao entrar num plano. `null` limpa. */
  @IsOptional() @IsInt() @Min(1) @Max(20) defaultSets?: number | null;
  @IsOptional() @IsString() @MaxLength(20) defaultReps?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(900) defaultRestSeconds?: number | null;
  @IsOptional() @IsIn([...Object.values(PlanLoadMode), null]) defaultLoadMode?: PlanLoadMode | null;
}

/** Filtros do catálogo da equipe (#408, Pn-11). */
export class CatalogQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;

  @IsOptional()
  @Transform(normalizeMuscleGroup)
  @IsString()
  @MaxLength(MUSCLE_GROUP_MAX_LENGTH)
  muscle?: string;

  @IsOptional() @IsString() @MaxLength(CUSTOM_EQUIPMENT_MAX_LENGTH) equipment?: string;

  @IsOptional() @Transform(toBool) @IsBoolean() house?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() favorite?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class FavoriteDto {
  @IsBoolean() favorite!: boolean;
}

export class EquipmentDto {
  @IsArray()
  @ArrayMaxSize(GYM_EQUIPMENT.length)
  @IsIn(GYM_EQUIPMENT as string[], { each: true })
  equipment!: string[];

  /**
   * Os equipamentos que a academia nomeia por conta própria. Ausente = mantém os
   * que já estão (o cliente antigo só manda `equipment`); `[]` apaga todos.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CUSTOM_EQUIPMENT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(CUSTOM_EQUIPMENT_MAX_LENGTH, { each: true })
  customEquipment?: string[];
}
