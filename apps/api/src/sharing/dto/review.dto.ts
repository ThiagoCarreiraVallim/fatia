import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { SessionReaction } from '@fatia/db';
import { FEEDBACK_BODY_MAX, RISK_DAYS_MAX, RISK_DAYS_MIN } from '../review.service';

export const REVIEW_KIND_PARAMS = ['workout', 'goal', 'plan'] as const;
export type ReviewKindParam = (typeof REVIEW_KIND_PARAMS)[number];

/** Reação e comentário na sessão feita (#399). `null` tira; ausente mantém. */
export class SessionFeedbackDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(Object.values(SessionReaction))
  reaction?: SessionReaction | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(FEEDBACK_BODY_MAX)
  body?: string | null;
}

export class RiskDaysDto {
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(RISK_DAYS_MIN)
  @Max(RISK_DAYS_MAX)
  riskDays!: number;
}

export class RiskDigestDto {
  @IsBoolean()
  enabled!: boolean;
}
