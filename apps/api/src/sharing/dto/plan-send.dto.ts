import {
  ArrayMaxSize,
  ArrayMinSize,
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
import {
  MAX_OFFER_NOTE,
  MAX_OFFER_WEEKS,
  PLAN_SCHEDULES,
  type PlanScheduleInput,
} from './plan-offer.dto';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Quantas pessoas cabem num envio só (Pn-18, "Todos que eu acompanho"). */
export const MAX_SEND_RECIPIENTS = 200;
export const MAX_CHANGE_NOTE = 500;

/** "Hoje", "Depois do plano atual" ou "Escolher data" (Pn-08b). */
export const SEND_STARTS = ['TODAY', 'AFTER_CURRENT', 'DATE'] as const;
export type SendStart = (typeof SEND_STARTS)[number];

/**
 * Um modelo da biblioteca para uma ou várias pessoas (#405, Pn-18 e Pn-08b).
 * Cada pessoa recebe a própria oferta e aceita no app; quem já tem uma oferta
 * deste modelo, mandada por quem envia, recebe uma versão nova ("o que mudou").
 */
export class SendPlansDto {
  @IsUUID() templateId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SEND_RECIPIENTS)
  @IsUUID('all', { each: true })
  membershipIds!: string[];

  /** Treino: como segue. O plano alimentar ignora. */
  @IsOptional() @IsIn(PLAN_SCHEDULES) schedule?: PlanScheduleInput;
  /** Treino de calendário: quando começa. */
  @IsOptional() @IsIn(SEND_STARTS) start?: SendStart;
  /** Com `start = DATE`: o primeiro dia (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @Matches(DIA, { message: 'startDate deve ser YYYY-MM-DD' })
  startDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_OFFER_WEEKS) weeks?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];
  /** Treino flexível: último dia. Sem ele, "sem fim". */
  @IsOptional()
  @IsString()
  @Matches(DIA, { message: 'endDate deve ser YYYY-MM-DD' })
  endDate?: string;
  @IsOptional() @IsString() @MaxLength(MAX_OFFER_NOTE) note?: string;
  /** "O que mudou": vai para quem já tem o plano (versão nova). */
  @IsOptional() @IsString() @MaxLength(MAX_CHANGE_NOTE) changeNote?: string;
}

export class SendRecipientsQueryDto {
  @IsOptional() @IsUUID() templateId?: string;
}

export class SendParamDto {
  @IsUUID() groupId!: string;
  @IsUUID() id!: string;
}
