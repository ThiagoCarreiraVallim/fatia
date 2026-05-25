import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GoalKind, GoalStatus } from '@prisma/client';

export class CreateGoalDto {
  @IsEnum(GoalKind)
  kind!: GoalKind;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // Se ausente, é derivado pelo service a partir de `kind`.
  @IsOptional()
  @IsNumber()
  startValue?: number;

  @IsNumber()
  targetValue!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit!: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsNumber()
  lastReportedValue?: number;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsNumber()
  lastReportedValue?: number;

  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;
}

export class ListGoalsDto {
  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;

  @IsOptional()
  @IsEnum(GoalKind)
  kind?: GoalKind;
}
