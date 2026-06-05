import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ANATOMICAL_MUSCLES,
  MUSCLE_GROUP_MAX_LENGTH,
  MUSCLE_GROUP_PATTERN,
} from '../helpers/muscle-group';

const normalizeMuscleGroup = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const muscleGroupCharsetMessage = 'muscleGroup must contain only letters, spaces, and hyphens';

// primaryMuscles/secondaryMuscles devem usar as 17 chaves em inglês do diagrama.
const MUSCLES = ANATOMICAL_MUSCLES as unknown as string[];
const musclesMessage = `each muscle must be one of: ${ANATOMICAL_MUSCLES.join(', ')}`;
const normalizeMuscles = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
    : value;

export class CreateCustomExerciseDto {
  @IsString() @MaxLength(200) name!: string;

  @Transform(normalizeMuscleGroup)
  @IsString()
  @MinLength(1)
  @MaxLength(MUSCLE_GROUP_MAX_LENGTH)
  @Matches(MUSCLE_GROUP_PATTERN, { message: muscleGroupCharsetMessage })
  muscleGroup!: string;
}

export class UpdateCustomExerciseDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;

  @IsOptional()
  @Transform(normalizeMuscleGroup)
  @IsString()
  @MinLength(1)
  @MaxLength(MUSCLE_GROUP_MAX_LENGTH)
  @Matches(MUSCLE_GROUP_PATTERN, { message: muscleGroupCharsetMessage })
  muscleGroup?: string;

  // --- Campos de enriquecimento (tradução/conteúdo) ---
  // Músculos: ficam em INGLÊS (chaves do diagrama p/ as cores).
  @IsOptional()
  @Transform(normalizeMuscles)
  @IsArray()
  @IsIn(MUSCLES, { each: true, message: musclesMessage })
  primaryMuscles?: string[];

  @IsOptional()
  @Transform(normalizeMuscles)
  @IsArray()
  @IsIn(MUSCLES, { each: true, message: musclesMessage })
  secondaryMuscles?: string[];

  // Texto livre — pode/deve vir em português.
  @IsOptional() @IsString() @MaxLength(100) equipment?: string;
  @IsOptional() @IsString() @MaxLength(50) level?: string;
  @IsOptional() @IsString() @MaxLength(50) mechanic?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  instructions?: string[];

  @IsOptional() @IsString() @MaxLength(40) youtubeVideoId?: string;
  @IsOptional() @IsString() @MaxLength(40) youtubeVideoIdPt?: string;
}

export class SearchExercisesDto {
  @IsOptional() @IsString() q?: string;

  @IsOptional()
  @Transform(normalizeMuscleGroup)
  @IsString()
  @MinLength(1)
  @MaxLength(MUSCLE_GROUP_MAX_LENGTH)
  @Matches(MUSCLE_GROUP_PATTERN, { message: muscleGroupCharsetMessage })
  muscleGroup?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
