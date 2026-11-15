import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_BLOCK_WEEKS, MIN_BLOCK_WEEKS, type BlockKind } from '../helpers/block-template';

export class CreateTrainingBlockDto {
  /** Plano que o bloco periodiza. Ausente = periodiza o treino livre. */
  @IsOptional() @IsUUID() planId?: string;

  @IsOptional() @IsIn(['strength', 'hypertrophy']) kind?: BlockKind;

  /**
   * Meta de sessões por semana. Ausente = `UserGoals.weeklyWorkouts`.
   *
   * Teto de 7 porque a semana tem 7 dias: uma meta de 10 nunca seria cumprida e o
   * bloco marcaria toda semana como parcial para sempre.
   */
  @IsOptional() @IsInt() @Min(1) @Max(7) sessionsPerWeek?: number;

  /** Quantas semanas, de 3 a 6 (a última é deload). Ausente = 4 (#379). */
  @IsOptional() @IsInt() @Min(MIN_BLOCK_WEEKS) @Max(MAX_BLOCK_WEEKS) weeks?: number;
}

/** A prévia do Al-T12: o mesmo que o criar recebe, sem o plano. */
export class TrainingBlockPreviewDto {
  @IsOptional() @IsIn(['strength', 'hypertrophy']) kind?: BlockKind;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(7) sessionsPerWeek?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_BLOCK_WEEKS)
  @Max(MAX_BLOCK_WEEKS)
  weeks?: number;
}
