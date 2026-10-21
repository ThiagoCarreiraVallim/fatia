import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartSessionDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsISO8601() startedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class FinishSessionDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  /**
   * Quando o treino de fato terminou. Sem isto o fim era sempre "agora", e um
   * treino de ontem relatado hoje ficava com duração de um dia.
   */
  @IsOptional() @IsISO8601() completedAt?: string;
}

export class UpdateSessionDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;

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
}
