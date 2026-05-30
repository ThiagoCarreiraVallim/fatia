import { IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertNutrientTargetDto {
  @IsString()
  @MaxLength(40)
  nutrientKey!: string; // "sodium_mg", "sugar_g", ...

  @IsString()
  @MaxLength(40)
  label!: string; // "Sódio"

  @IsString()
  @MaxLength(12)
  unit!: string; // "mg", "g"

  @IsOptional()
  @IsNumber()
  @Min(0)
  min?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max?: number;

  @IsOptional()
  @IsIn(['daily'])
  period?: 'daily';
}

export class NutrientSummaryQueryDto {
  @IsString()
  date!: string; // YYYY-MM-DD

  // Placeholder para validação consistente quando vier objeto solto.
  @IsOptional()
  @IsObject()
  _?: Record<string, unknown>;
}
