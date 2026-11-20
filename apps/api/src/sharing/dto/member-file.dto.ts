import { MAX_CHANGE_NOTE } from './plan-send.dto';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  MAX_OFFER_NOTE,
  MAX_OFFER_WEEKS,
  PLAN_SCHEDULES,
  type PlanScheduleInput,
} from './plan-offer.dto';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Anotação da equipe (#402): texto puro. */
export const MAX_MEMBER_NOTE = 2000;
/** Quantos planos se reordenam de uma vez. */
export const MAX_ORDERED_PLANS = 100;

/**
 * Plano para UMA pessoa, pela ficha (#402): um modelo da biblioteca desta
 * comunidade (`templateId`) ou um plano da conta de quem envia (`planId`).
 * Exatamente um dos dois; o service confere.
 */
export class SendMemberPlanDto {
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsUUID() planId?: string;
  @IsIn(PLAN_SCHEDULES) schedule!: PlanScheduleInput;
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
  @IsOptional() @IsString() @MaxLength(MAX_OFFER_NOTE) note?: string;
}

const asBool = ({ value }: { value: unknown }) => value === true || value === 'true';

/** "Apagar da Ana" (Pn-05s): avisar no app e terminar hoje em vez de apagar. */
export class RemoveMemberPlanQueryDto {
  @IsOptional() @Transform(asBool) @IsBoolean() notify?: boolean;
  @IsOptional() @Transform(asBool) @IsBoolean() endToday?: boolean;
}

export class ReorderMemberPlansDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDERED_PLANS)
  @IsUUID('all', { each: true })
  offerIds!: string[];
}

export class MemberNoteDto {
  @IsString() @MinLength(1) @MaxLength(MAX_MEMBER_NOTE) text!: string;
}

export class MemberAgendaQueryDto {
  @IsOptional() @Matches(DIA, { message: 'from deve ser YYYY-MM-DD' }) from?: string;
  @IsOptional() @Matches(DIA, { message: 'to deve ser YYYY-MM-DD' }) to?: string;
}

/** Salvar a cópia de um aluno (#406, Pn-09e): uma versão nova pelo fluxo de versão. */
export class SavePlanCopyDto {
  /** O documento do editor (sessões e blocos); validado no service. */
  @IsObject()
  document!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHANGE_NOTE)
  changeNote?: string;

  /** "Avisar a Ana no app". Padrão: avisa. */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;

  /**
   * A versão que o editor abriu. Se outra pessoa salvou depois, a cópia não é
   * sobrescrita: 409.
   */
  @IsOptional()
  @IsUUID()
  baseVersionId?: string;
}
