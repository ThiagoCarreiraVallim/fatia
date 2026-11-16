import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const PLAN_SCHEDULES = ['CALENDAR', 'FLEXIBLE'] as const;
export type PlanScheduleInput = (typeof PLAN_SCHEDULES)[number];

/** Quantas semanas um plano de calendário dura, no máximo. */
export const MAX_OFFER_WEEKS = 16;
export const MAX_OFFER_NOTE = 1000;

/**
 * O que a equipe manda (#379): um plano da conta de quem envia, o tipo de
 * agenda e o recado. É a porta mínima; o editor da equipe é a #406.
 */
export class SendPlanOfferDto {
  /** Plano da conta de quem envia. Plano de outra pessoa responde 404. */
  @IsUUID() planId!: string;
  @IsIn(PLAN_SCHEDULES) schedule!: PlanScheduleInput;
  /** Só no CALENDAR: o primeiro dia (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @Matches(DIA, { message: 'startDate deve ser YYYY-MM-DD' })
  startDate?: string;
  /** Só no CALENDAR: quantas semanas. */
  @IsOptional() @IsInt() @Min(1) @Max(MAX_OFFER_WEEKS) weeks?: number;
  /** Só no CALENDAR: dias da semana ISO (1 = segunda … 7 = domingo). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];
  @IsOptional() @IsString() @MaxLength(MAX_OFFER_NOTE) note?: string;
}

/** Aceitar, recusar e desfazer apontam a versão que a pessoa viu na tela. */
export class RespondPlanOfferDto {
  @IsUUID() versionId!: string;
}
