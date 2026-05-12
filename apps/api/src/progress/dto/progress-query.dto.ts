import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CardioMetric, StrengthMetric } from '../progress.service';

export class ProgressQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number = 30;

  @IsOptional()
  @IsString()
  timezone?: string = 'UTC';
}

export class StrengthProgressQueryDto extends ProgressQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  exerciseId!: number;

  @IsOptional()
  @IsEnum(['1rm', 'volume', 'weight'])
  metric?: StrengthMetric = '1rm';
}

export class CardioProgressQueryDto extends ProgressQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  exerciseId!: number;

  @IsOptional()
  @IsEnum(['duration', 'distance', 'pace', 'kcal'])
  metric?: CardioMetric = 'duration';
}

export class VolumeProgressQueryDto extends ProgressQueryDto {
  @IsOptional()
  @IsString()
  muscleGroup?: string;
}
