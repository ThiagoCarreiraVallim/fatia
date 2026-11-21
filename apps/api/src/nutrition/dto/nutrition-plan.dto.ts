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
 * A entrada de `NutritionPlanService`: o envio pela biblioteca (#405), a cópia
 * do aluno (#407) e o seed. Não é rota: o editor manda o documento.
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
  /** Chave estável do item no editor (#407): casa o item entre versões. */
  key?: string;
  /** Chave do grupo de equivalentes do editor (#407). */
  groupKey?: string;
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
  /** Os grupos de equivalentes como o editor os montou (#407): referência da cópia. */
  equivalenceGroups?: unknown;
  meals: Array<{
    mealType: MealType;
    name: string;
    /** "07:00" (#407). */
    time?: string | null;
    /** Chave estável da refeição no editor (#407). */
    key?: string;
    /** Opção sem itens é refeição "sem sugestão" (#407, Pn-24b). */
    options: Array<{ items: SendPlanItem[] }>;
  }>;
}
