import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { SessionReaction } from '@fatia/db';
import { FEEDBACK_BODY_MAX, RISK_DAYS_MAX, RISK_DAYS_MIN, feedbackLength } from '../review.service';

export const REVIEW_KIND_PARAMS = ['workout', 'goal', 'plan', 'plan-ended'] as const;
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
  // Por code point, como o service e o `char_length` do banco (o `MaxLength`
  // do class-validator descontaria seletores de variação, e um "❤️" contaria 1).
  @ValidateBy({
    name: 'maxCodePoints',
    validator: {
      validate: (v: unknown) =>
        typeof v === 'string' && feedbackLength(v.trim()) <= FEEDBACK_BODY_MAX,
      defaultMessage: () => `O comentário tem até ${FEEDBACK_BODY_MAX} caracteres.`,
    },
  })
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
