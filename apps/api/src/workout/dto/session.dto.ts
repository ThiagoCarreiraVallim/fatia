import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SESSION_KINDS, type SessionKind } from '../helpers/session-kind';

/**
 * As perguntas rápidas do fim do treino (#377, parte da #304). Todas
 * opcionais; escalas de 1 a 5. `skipped` grava o "Pular" e descarta o resto.
 */
export class WorkoutCheckinDto {
  @IsOptional() @IsBoolean() skipped?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) fatigue?: number;
  @IsOptional() @IsBoolean() pain?: boolean;
  /** Onde doeu. Só vale com `pain: true`. */
  @IsOptional() @IsString() @MaxLength(120) painLocation?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) motivation?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class StartSessionDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsISO8601() startedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;

  /**
   * A ordem dos exercícios escolhidos antes de começar (Treino livre, #381),
   * por id. Gravada como a `exerciseOrder` da sessão: o detalhe e o "Salvar
   * como plano" saem na ordem em que a pessoa escolheu.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  exerciseOrder?: number[];
}

export class FinishSessionDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  /**
   * Quando o treino de fato terminou. Sem isto o fim era sempre "agora", e um
   * treino de ontem relatado hoje ficava com duração de um dia.
   */
  @IsOptional() @IsISO8601() completedAt?: string;

  /** "Como foi o treino?" na escala de 5 do canvas (#377). */
  @IsOptional() @IsInt() @Min(1) @Max(5) feeling?: number;

  /** As perguntas da equipe, quando respondidas junto com o fim. */
  @IsOptional() @ValidateNested() @Type(() => WorkoutCheckinDto) checkin?: WorkoutCheckinDto;
}

export class UpdateSessionDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;

  /** "Como foi o treino?" (#377), mudado depois do fim; `null` apaga. */
  @IsOptional() @IsInt() @Min(1) @Max(5) feeling?: number | null;

  /**
   * Ordem dos exercícios nesta sessão, por id. Substitui a anterior inteira.
   * Ids que não estão na sessão são inofensivos: só servem para ordenar.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  exerciseOrder?: number[];

  /** Exercícios do plano tirados desta sessão. Substitui a lista anterior. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  removedExerciseIds?: number[];
}

export class ListSessionsDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  /** Plano, circuito ou livre (#381). Sem filtro, todas. */
  @IsOptional() @IsIn(SESSION_KINDS) kind?: SessionKind;
}

/** O histórico (#381, Al-T10): só sessões concluídas, com totais do mesmo filtro. */
export class HistoryQueryDto {
  @IsOptional() @IsIn(SESSION_KINDS) kind?: SessionKind;
  /** O `nextCursor` da página anterior: opaco (`helpers/session-cursor.ts`). */
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

/** "Salvar como plano" (#381). Sem nome, o plano sai com o da sessão. */
export class SaveSessionAsPlanDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}
