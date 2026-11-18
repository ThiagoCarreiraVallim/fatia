import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { StepSource, type ChallengeMetric } from '@fatia/db';
import { CHALLENGE_METRICS } from '../../social/challenge-metric';
import {
  CHALLENGE_KINDS,
  POINT_VALUE_MAX,
  type ChallengeKindName,
} from '../../social/challenge-days';
import {
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_TITLE_MAX,
  CHALLENGE_TITLE_MIN,
} from '../challenge.service';
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, DISPLAY_NAME_PATTERN } from '../display-name';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export class ChallengeParamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  id!: string;
}

/** Um desafio como a equipe marca: as datas são dias no fuso da comunidade. */
/** Antes do `ChallengeDto`: o metadado do tipo é lido na hora em que a classe nasce. */
export class PointsTableDto {
  @IsOptional() @IsInt() @Min(0) @Max(POINT_VALUE_MAX) workout?: number;
  @IsOptional() @IsInt() @Min(0) @Max(POINT_VALUE_MAX) water?: number;
  @IsOptional() @IsInt() @Min(0) @Max(POINT_VALUE_MAX) steps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(POINT_VALUE_MAX) protein?: number;
  @IsOptional() @IsInt() @Min(0) @Max(POINT_VALUE_MAX) kcal?: number;
}

export class ChallengeDto {
  @Transform(trim)
  @IsString()
  @MinLength(CHALLENGE_TITLE_MIN)
  @MaxLength(CHALLENGE_TITLE_MAX)
  title!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(CHALLENGE_DESCRIPTION_MAX)
  description?: string | null;

  /** Tipo do redesign (#395). Ausente = `METRIC`. */
  @IsOptional()
  @IsIn([...CHALLENGE_KINDS])
  kind?: ChallengeKindName;

  /** Obrigatória em `METRIC`; em `NUTRITION`, proteína ou faixa de kcal. */
  @IsOptional()
  @IsIn([...CHALLENGE_METRICS])
  metric?: ChallengeMetric;

  @Matches(DIA, { message: 'startDate deve ser YYYY-MM-DD' })
  startDate!: string;

  @Matches(DIA, { message: 'endDate deve ser YYYY-MM-DD' })
  endDate!: string;

  /** Tipo pontos: quanto vale cada item (0 a 5). */
  @IsOptional()
  @ValidateNested()
  @Type(() => PointsTableDto)
  @IsObject()
  pointsTable?: PointsTableDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  maxPointsPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(6000)
  waterGoalMl?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(50_000)
  stepsGoal?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(8000)
  dailyCap?: number;

  /** Vazio = todas as fontes automáticas. `MANUAL` é recusado no service. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsIn(Object.values(StepSource), { each: true })
  allowedStepSources?: StepSource[];
}

export class JoinChallengeDto {
  /** Ausente: o apelido que a pessoa já usa na comunidade, ou o primeiro nome. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(DISPLAY_NAME_MIN)
  @MaxLength(DISPLAY_NAME_MAX)
  @Matches(DISPLAY_NAME_PATTERN, { message: 'O apelido não pode ter quebra de linha nem < ou >.' })
  displayName?: string;

  /** Aceite da foto de check-in (ADR 047), exigido em desafio com foto. */
  @IsOptional()
  @IsBoolean()
  acceptPhotoTerms?: boolean;
}

export class WatchChallengeDto {
  @IsBoolean()
  on!: boolean;
}

export class CheckinParamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  id!: string;

  @IsUUID()
  checkinId!: string;
}

export const CHECKIN_CAPTION_MAX = 140;
export const REVIEW_REASON_MIN = 3;
export const REVIEW_REASON_MAX = 280;

/** O check-in com foto (Cm-18). O treino é o mais recente que libera, se não vier. */
export class CreateCheckinDto {
  @IsUUID()
  photoFileId!: string;

  @IsOptional()
  @IsUUID()
  workoutSessionId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CHECKIN_CAPTION_MAX)
  @Matches(DISPLAY_NAME_PATTERN, { message: 'A legenda não pode ter quebra de linha nem < ou >.' })
  caption?: string;
}

/** "Vale" ou "Anular" (Pn-13). Anular exige o motivo, que vai para a pessoa. */
export class ResolveCheckinDto {
  @IsIn(['valid', 'void'])
  decision!: 'valid' | 'void';

  @ValidateIf((o: ResolveCheckinDto) => o.decision === 'void' || o.reason !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(REVIEW_REASON_MIN)
  @MaxLength(REVIEW_REASON_MAX)
  reason?: string;
}

export class ReviewQueryDto {
  @IsOptional()
  @IsUUID()
  challengeId?: string;
}
