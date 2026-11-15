import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ActivityLevel,
  AvatarVisibility,
  BiologicalSex,
  BodyObjective,
  DistanceUnit,
  LoadUnit,
} from '@prisma/client';
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

  // Você (#387). Vazio apaga apelido, bio e WhatsApp; o tamanho e o formato
  // finais são conferidos em `profileUpdateData`, que o `update_me` também usa.
  @IsOptional() @IsString() @MaxLength(60) nickname?: string | null;
  @IsOptional() @IsString() @MaxLength(400) bio?: string | null;
  @IsOptional() @IsEnum(AvatarVisibility) avatarVisibility?: AvatarVisibility;
  @IsOptional() @IsBoolean() keepMealPhotos?: boolean;
  @IsOptional() @IsString() @MaxLength(30) whatsapp?: string | null;
  @IsOptional() @IsBoolean() whatsappOptIn?: boolean;
  @IsOptional() @IsEnum(LoadUnit) loadUnit?: LoadUnit;
  @IsOptional() @IsEnum(DistanceUnit) distanceUnit?: DistanceUnit;
}
