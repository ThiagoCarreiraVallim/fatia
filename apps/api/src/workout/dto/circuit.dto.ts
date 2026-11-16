import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CIRCUIT_EVENT_TYPES,
  CIRCUIT_FORMATS,
  MAX_CIRCUIT_EVENTS,
  MAX_CIRCUIT_EXERCISES,
  MAX_CIRCUIT_TARGET,
  type CircuitFormatValue,
} from '../helpers/circuit';

/** Teto genérico de contagem (rounds, intervalos): o formato confere o seu. */
const MAX_COUNT = 10_000;
/** Seis horas: nenhum circuito real passa disso. */
const MAX_SECONDS = 6 * 3600;

export class CircuitItemDto {
  @IsInt() @Min(1) exerciseId!: number;
  @IsIn(['REPS', 'SECONDS']) unit!: 'REPS' | 'SECONDS';
  /** Reps ou segundos por round. */
  @IsInt() @Min(1) @Max(MAX_CIRCUIT_TARGET) target!: number;
}

/** Os campos do formato; os de outro formato são ignorados. */
export class CircuitConfigDto {
  @IsIn(CIRCUIT_FORMATS) format!: CircuitFormatValue;
  @IsOptional() @IsInt() durationSeconds?: number | null;
  @IsOptional() @IsInt() workSeconds?: number | null;
  @IsOptional() @IsInt() restSeconds?: number | null;
  @IsOptional() @IsInt() intervals?: number | null;
  @IsOptional() @IsInt() rounds?: number | null;
  @IsOptional() @IsInt() restBetweenRoundsSeconds?: number | null;
}

/** "Novo circuito" (Al-T22): nome, formato e exercícios de uma vez. Também a edição (PUT). */
export class SaveCircuitDto extends CircuitConfigDto {
  @IsString() @MaxLength(100) name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CIRCUIT_EXERCISES)
  @ValidateNested({ each: true })
  @Type(() => CircuitItemDto)
  exercises!: CircuitItemDto[];
}

export class CircuitEventDto {
  @IsIn(CIRCUIT_EVENT_TYPES) type!: (typeof CIRCUIT_EVENT_TYPES)[number];
  /** Horário do toque, em ms desde a época. */
  @IsInt() @Min(0) at!: number;
}

/** O progresso do circuito: a lista inteira de toques, substituída a cada envio. */
export class CircuitProgressDto {
  @IsArray()
  @ArrayMaxSize(MAX_CIRCUIT_EVENTS)
  @ValidateNested({ each: true })
  @Type(() => CircuitEventDto)
  events!: CircuitEventDto[];
}

export class CircuitResultDto {
  @IsInt() @Min(0) @Max(MAX_COUNT) roundsCompleted!: number;
  @IsInt() @Min(0) @Max(MAX_CIRCUIT_EXERCISES) partialExercises!: number;

  @IsArray()
  @ArrayMaxSize(MAX_COUNT)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_SECONDS, { each: true })
  roundSeconds!: number[];

  @IsOptional() @IsInt() @Min(0) @Max(MAX_SECONDS) partialRoundSeconds?: number | null;
  @IsInt() @Min(0) @Max(MAX_SECONDS) elapsedSeconds!: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_SECONDS) finalTimeSeconds?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) intervalsCompleted?: number | null;
  @IsBoolean() completed!: boolean;
}

/** "Encerrar circuito": os toques, o resultado contado pelo relógio e a sensação. */
export class FinishCircuitDto extends CircuitProgressDto {
  @ValidateNested() @Type(() => CircuitResultDto) result!: CircuitResultDto;
  @IsOptional() @IsInt() @Min(1) @Max(5) feeling?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

/**
 * Registrar um circuito já feito, sem o relógio (MCP: "fiz o AMRAP 12, 5
 * rounds e 2"). Com `sessionId`, encerra a sessão de circuito aberta.
 */
export class LogCircuitDto {
  @IsUUID() planId!: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) roundsCompleted?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CIRCUIT_EXERCISES) partialExercises?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_SECONDS) finalTimeSeconds?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) intervalsCompleted?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) roundSeconds?: number[];
  @IsOptional() @IsInt() @Min(0) @Max(MAX_SECONDS) elapsedSeconds?: number;
  @IsOptional() @IsISO8601() completedAt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) feeling?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
