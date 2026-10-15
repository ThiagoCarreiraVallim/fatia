import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ActivityLevel, BiologicalSex, BodyObjective } from '@prisma/client';
import { ISO_DAY, ISO_DAY_MESSAGE } from '../../progress/helpers/log-day';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  heightCm?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  timezone?: string;

  @IsOptional() @IsEnum(BiologicalSex) sex?: BiologicalSex;
  @IsOptional() @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE }) birthDate?: string;
  @IsOptional() @IsEnum(ActivityLevel) activityLevel?: ActivityLevel;
  @IsOptional() @IsEnum(BodyObjective) objective?: BodyObjective;
}
