import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { StepSource } from '@prisma/client';

export class CreateStepLogDto {
  @IsString()
  date!: string; // YYYY-MM-DD no fuso do usuário

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
  @MaxLength(500)
  notes?: string;
}

export class ListStepLogsDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;
}
