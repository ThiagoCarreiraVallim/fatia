import { Matches, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ISO_DAY, ISO_DAY_MESSAGE } from '../helpers/log-day';
import { StepSource } from '@prisma/client';

export class CreateStepLogDto {
  @IsOptional()
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE })
  date?: string;

  @IsInt()
  @Min(0)
  steps!: number;

  @IsOptional()
  @IsEnum(StepSource)
  source?: StepSource;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateStepLogDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  steps?: number;

  @IsOptional()
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListStepLogsDto {
  @IsOptional()
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE })
  to?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  limit?: number;
}
