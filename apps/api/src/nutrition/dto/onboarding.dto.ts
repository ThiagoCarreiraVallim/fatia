import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Matches, ValidateNested } from 'class-validator';
import { ActivityLevel, BiologicalSex, BodyObjective } from '@prisma/client';
import { ISO_DAY, ISO_DAY_MESSAGE } from '../../progress/helpers/log-day';
import { UpsertGoalsDto } from './goals.dto';

/** Tudo opcional: o que faltar vem do perfil salvo e da última pesagem. */
export class SuggestGoalsDto {
  @IsOptional() @IsEnum(BiologicalSex) sex?: BiologicalSex;
  @IsOptional() @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE }) birthDate?: string;
  @IsOptional() @IsNumber() heightCm?: number;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsEnum(ActivityLevel) activityLevel?: ActivityLevel;
  @IsOptional() @IsEnum(BodyObjective) objective?: BodyObjective;
}

export class CompleteOnboardingDto {
  @IsEnum(BiologicalSex) sex!: BiologicalSex;
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE }) birthDate!: string;
  @IsNumber() heightCm!: number;
  @IsNumber() weightKg!: number;
  @IsEnum(ActivityLevel) activityLevel!: ActivityLevel;
  @IsEnum(BodyObjective) objective!: BodyObjective;

  /** As metas que a pessoa aceitou — as sugeridas ou as que ela editou. */
  @ValidateNested()
  @Type(() => UpsertGoalsDto)
  goals!: UpsertGoalsDto;
}
