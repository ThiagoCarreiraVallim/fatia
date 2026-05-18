import { IsInt, IsOptional, IsString, Matches, MaxLength, MinLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MUSCLE_GROUP_MAX_LENGTH, MUSCLE_GROUP_PATTERN } from '../helpers/muscle-group';

const normalizeMuscleGroup = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const muscleGroupCharsetMessage = 'muscleGroup must contain only letters, spaces, and hyphens';

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
