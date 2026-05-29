import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchFoodDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  groupId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class CreateCustomFoodDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsInt()
  groupId?: number;

  @IsNumber()
  @Min(0)
  kcalPer100g!: number;

  @IsNumber()
  @Min(0)
  proteinPer100g!: number;

  @IsNumber()
  @Min(0)
  carbsPer100g!: number;

  @IsNumber()
  @Min(0)
  fatPer100g!: number;
}

export class UpdateCustomFoodDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsInt()
  groupId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  kcalPer100g?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  proteinPer100g?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  carbsPer100g?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fatPer100g?: number;
}
