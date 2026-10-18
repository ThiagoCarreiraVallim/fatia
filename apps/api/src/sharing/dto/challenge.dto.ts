import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { ChallengeMetric } from '@fatia/db';
import { CHALLENGE_METRICS } from '../../social/challenge-metric';
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

  @IsIn([...CHALLENGE_METRICS])
  metric!: ChallengeMetric;

  @Matches(DIA, { message: 'startDate deve ser YYYY-MM-DD' })
  startDate!: string;

  @Matches(DIA, { message: 'endDate deve ser YYYY-MM-DD' })
  endDate!: string;
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
}
