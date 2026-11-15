import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ReminderKind, ReminderMode } from '@fatia/db';
import { REMINDER_KINDS, REMINDER_MODES } from './reminder.service';
import { TIMES_MAX } from './reminder-rules';

/**
 * Um lembrete (#389). O formato fino (hh:mm na grade de 5 minutos, de/até,
 * quantos horários) é conferido em `normalizeReminder`, que vale também para o
 * MCP; aqui só os tipos.
 */
export class UpdateReminderDto {
  @IsOptional()
  @IsIn(REMINDER_KINDS)
  kind?: ReminderKind;

  @IsOptional()
  @IsIn(REMINDER_MODES)
  mode?: ReminderMode;

  @IsOptional()
  @IsUUID()
  habitId?: string | null;

  @IsOptional()
  @IsInt()
  everyHours?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  from?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  to?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TIMES_MAX)
  @IsString({ each: true })
  @MaxLength(5, { each: true })
  times?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsInt()
  stepsBelow?: number | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** Na criação, tipo e modo são obrigatórios. */
export class CreateReminderDto {
  @IsIn(REMINDER_KINDS)
  kind!: ReminderKind;

  @IsIn(REMINDER_MODES)
  mode!: ReminderMode;

  @IsOptional()
  @IsUUID()
  habitId?: string | null;

  @IsOptional()
  @IsInt()
  everyHours?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  from?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  to?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TIMES_MAX)
  @IsString({ each: true })
  @MaxLength(5, { each: true })
  times?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsInt()
  stepsBelow?: number | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ReminderParamDto {
  @IsUUID()
  id!: string;
}

/** Silêncio noturno (prancha Al-V2): liga e desliga, e a janela em hh:mm. */
export class QuietHoursDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  to?: string;
}
