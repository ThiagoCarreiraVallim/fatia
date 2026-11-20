import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';
import { ORIGINS_DAYS, WEEKLY_GOAL_MAX } from '../report.service';
import type { OriginsDays } from '../report.types';

export class ReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'O mês vem como AAAA-MM.' })
  month?: string;
}

export class OriginsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(ORIGINS_DAYS)
  days?: OriginsDays;
}

export class ReportSettingsDto {
  /** `null` tira a meta. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Transform(({ value }) => (typeof value === 'string' && value !== '' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(WEEKLY_GOAL_MAX)
  weeklySessionsGoal?: number | null;

  @IsOptional()
  @IsBoolean()
  reportEmailEnabled?: boolean;
}

export class ReportRecipientDto {
  @IsBoolean()
  enabled!: boolean;
}
