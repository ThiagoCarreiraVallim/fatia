import { Matches, IsInt, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';
import { ISO_DAY, ISO_DAY_MESSAGE } from '../helpers/log-day';

export class CreateWaterLogDto {
  @IsOptional()
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE })
  date?: string;

  @IsInt()
  @IsPositive()
  ml!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateWaterLogDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  ml?: number;

  @IsOptional()
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListWaterLogsDto {
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
  @Min(1)
  limit?: number;
}
