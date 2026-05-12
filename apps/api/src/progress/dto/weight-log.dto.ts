import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWeightLogDto {
  @IsNumber()
  @Min(1)
  weightKg!: number;

  @IsDateString()
  loggedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateWeightLogDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  weightKg?: number;

  @IsOptional()
  @IsDateString()
  loggedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListWeightLogsDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;
}
