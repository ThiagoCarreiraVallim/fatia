import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { StepSource } from '@prisma/client';

export class CreateStepLogDto {
  @IsOptional()
  @IsString()
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
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListStepLogsDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  limit?: number;
}
