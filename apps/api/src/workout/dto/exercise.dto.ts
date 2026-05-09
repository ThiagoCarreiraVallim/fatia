import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const MUSCLE_GROUPS = [
  'peito',
  'costas',
  'pernas',
  'ombro',
  'braço',
  'core',
  'cardio',
] as const;

export class CreateCustomExerciseDto {
  @IsString() @MaxLength(200) name!: string;
  @IsIn(MUSCLE_GROUPS) muscleGroup!: string;
}

export class UpdateCustomExerciseDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsIn(MUSCLE_GROUPS) muscleGroup?: string;
}

export class SearchExercisesDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() muscleGroup?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
