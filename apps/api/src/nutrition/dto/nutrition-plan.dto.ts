import { MealType } from '@prisma/client';
import { IsDateString, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export class NutritionPlanQueryDto {
  /** Dia de que se quer o "feito" e as trocas (YYYY-MM-DD). Padrão: hoje da pessoa. */
  @IsOptional() @IsString() @Matches(DIA, { message: 'date deve ser YYYY-MM-DD' }) date?: string;
}

export class AcceptNutritionPlanDto {
  @IsUUID() planId!: string;
}

export class LogPlanMealDto {
  /** Obrigatória quando a refeição do plano tem mais de uma opção. */
  @IsOptional() @IsUUID() optionId?: string;
  /** Padrão: agora. */
  @IsOptional() @IsDateString() eatenAt?: string;
}

export class SwapPlanItemDto {
  @IsUUID() itemId!: string;
  @IsUUID() equivalentId!: string;
  /** Dia da troca (YYYY-MM-DD). Padrão: hoje da pessoa. */
  @IsOptional() @IsString() @Matches(DIA, { message: 'date deve ser YYYY-MM-DD' }) date?: string;
}

/**
 * O que o editor da equipe (#407) manda. Não é rota nesta issue: é a entrada de
 * `NutritionPlanService.send`, que o editor e o seed chamam.
 */
export interface SendPlanFood {
  /** Alimento da base (sem dono). Personalizado de outra conta não entra (ADR 045). */
  foodId: number;
  grams: number;
  portionLabel?: string;
  portionQuantity?: number;
}

export interface SendPlanItem extends SendPlanFood {
  equivalenceGroup?: string;
  equivalents?: SendPlanFood[];
}

export interface SendNutritionPlanInput {
  goals: {
    kcalMin: number;
    kcalMax: number;
    proteinMinG: number;
    proteinMaxG: number;
    carbsMinG: number;
    carbsMaxG: number;
    fatMinG: number;
    fatMaxG: number;
  };
  applyGoals?: boolean;
  note?: string;
  meals: Array<{
    mealType: MealType;
    name: string;
    options: Array<{ items: SendPlanItem[] }>;
  }>;
}
