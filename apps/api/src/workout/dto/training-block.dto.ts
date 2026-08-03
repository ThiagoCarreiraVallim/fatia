import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { BlockKind } from '../helpers/block-template';

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
}
