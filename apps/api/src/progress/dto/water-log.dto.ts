import { IsInt, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export class CreateWaterLogDto {
  @IsOptional()
  @IsString()
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
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListWaterLogsDto {
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
  @Min(1)
  limit?: number;
}
