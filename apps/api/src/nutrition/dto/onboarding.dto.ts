import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
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

/**
 * As etapas do onboarding que a API guarda para a retomada (#371), na ordem das
 * pranchas. A conta (etapa 1) não entra: sem conta não há onde salvar. Quais
 * aparecem para cada pessoa (convite, compra na loja, saúde do celular) é
 * decisão do cliente (`onboardingFlow`, no api-client).
 */
export const ONBOARDING_STEPS = [
  'welcome',
  'share',
  'objective',
  'body',
  'activity',
  'goals',
  'reminders',
  'notifications',
  'health',
  'code',
  'ai',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const GOAL_SOURCES = ['app', 'team'] as const;
export type GoalSource = (typeof GOAL_SOURCES)[number];

/**
 * Um passo salvo: a etapa em que a pessoa está e o que ela já respondeu. O que
 * tem coluna no perfil vai para o perfil; peso e metas ficam no rascunho até a
 * conclusão (o peso só vira pesagem ao concluir, as metas só valem ao concluir).
 */
export class SaveOnboardingDto {
  @IsIn(ONBOARDING_STEPS) step!: OnboardingStep;

  @IsOptional() @IsEnum(BodyObjective) objective?: BodyObjective;
  @IsOptional() @IsEnum(BiologicalSex) sex?: BiologicalSex;
  @IsOptional() @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE }) birthDate?: string;
  @IsOptional() @IsNumber() @Min(50) @Max(260) heightCm?: number;
  @IsOptional() @IsNumber() @Min(20) @Max(400) weightKg?: number;
  @IsOptional() @IsEnum(ActivityLevel) activityLevel?: ActivityLevel;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertGoalsDto)
  goals?: UpsertGoalsDto;

  /** "Calculado pelo app" ou "Sugerido pela equipe" (prancha Onb-07b). */
  @IsOptional() @IsIn(GOAL_SOURCES) goalSource?: GoalSource;
}
