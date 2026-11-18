import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { UpsertGoalsDto } from './dto/goals.dto';

/**
 * Tetos das metas. Altos o bastante para nenhum atleta real, baixos o bastante
 * para recusar o erro de digitação (um zero a mais) antes de ele virar a régua
 * do dashboard. Moram no service para o REST e o MCP recusarem igual.
 */
export const GOAL_LIMITS = {
  kcal: 10_000,
  macroG: 1_000,
  waterMl: 10_000,
  steps: 100_000,
  weeklyWorkouts: 14,
} as const;

const FAIXAS = [
  ['kcalMin', 'kcalMax', 'calorias', GOAL_LIMITS.kcal],
  ['proteinMinG', 'proteinMaxG', 'proteína', GOAL_LIMITS.macroG],
  ['carbsMinG', 'carbsMaxG', 'carboidrato', GOAL_LIMITS.macroG],
  ['fatMinG', 'fatMaxG', 'gordura', GOAL_LIMITS.macroG],
] as const;

const OPCIONAIS = [
  ['dailyWaterTargetMl', 'A meta de água', GOAL_LIMITS.waterMl],
  ['dailyStepsTarget', 'A meta de passos', GOAL_LIMITS.steps],
  ['weeklyWorkouts', 'A meta de treinos por semana', GOAL_LIMITS.weeklyWorkouts],
] as const;

export function assertGoalsValid(dto: UpsertGoalsDto): void {
  for (const [min, max, nome, teto] of FAIXAS) {
    if (dto[min] > dto[max]) {
      throw new BadRequestException(`O piso de ${nome} não pode passar do teto.`);
    }
    if (dto[max] > teto) {
      throw new BadRequestException(`O teto de ${nome} vai até ${teto.toLocaleString('pt-BR')}.`);
    }
  }
  for (const [campo, nome, teto] of OPCIONAIS) {
    const valor = dto[campo];
    if (valor !== undefined && valor > teto) {
      throw new BadRequestException(`${nome} vai até ${teto.toLocaleString('pt-BR')}.`);
    }
  }
}

/** De onde veio a troca das metas, para o histórico (#396). */
export interface GoalsChangeOrigin {
  source: 'manual' | 'group_plan';
  templateId?: string | null;
  templateTitle?: string | null;
}

const CAMPOS_DAS_METAS = [
  'kcalMin',
  'kcalMax',
  'proteinMinG',
  'proteinMaxG',
  'carbsMinG',
  'carbsMaxG',
  'fatMinG',
  'fatMaxG',
  'weeklyWorkouts',
  'dailyStepsTarget',
  'dailyWaterTargetMl',
] as const;

type GoalsRow = Record<(typeof CAMPOS_DAS_METAS)[number], number>;

@Injectable()
export class UserGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    return this.prisma.userGoals.findUnique({ where: { userId } });
  }

  /**
   * Grava as metas. Se já havia metas e alguma muda, o "antes" vai para
   * `UserGoalsHistory` (#396): trocar pelas de um plano da comunidade
   * sobrescreve as pessoais, e a pessoa não perde de onde partiu.
   */
  async upsert(
    userId: string,
    dto: UpsertGoalsDto,
    origin: GoalsChangeOrigin = { source: 'manual' },
  ) {
    assertGoalsValid(dto);
    const antes = await this.prisma.userGoals.findUnique({ where: { userId } });
    const goals = await this.prisma.userGoals.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    if (antes && mudou(antes, goals)) {
      await this.prisma.userGoalsHistory.create({
        data: {
          userId,
          kcalMin: antes.kcalMin,
          kcalMax: antes.kcalMax,
          proteinMinG: antes.proteinMinG,
          proteinMaxG: antes.proteinMaxG,
          carbsMinG: antes.carbsMinG,
          carbsMaxG: antes.carbsMaxG,
          fatMinG: antes.fatMinG,
          fatMaxG: antes.fatMaxG,
          weeklyWorkouts: antes.weeklyWorkouts,
          dailyStepsTarget: antes.dailyStepsTarget,
          dailyWaterTargetMl: antes.dailyWaterTargetMl,
          source: origin.source,
          templateId: origin.templateId ?? null,
          templateTitle: origin.templateTitle ?? null,
        },
      });
    }
    // Quem definiu metas por outro caminho (MCP, tela de metas) já passou da
    // primeira vez: o app não deve mandá-lo ao assistente.
    await this.prisma.user.updateMany({
      where: { id: userId, onboardedAt: null },
      data: { onboardedAt: new Date() },
    });
    return goals;
  }
}

function mudou(antes: GoalsRow, depois: GoalsRow | null | undefined): boolean {
  // O upsert mockado nos testes pode não devolver a linha: sem ela, conta como mudança.
  if (!depois) return true;
  return CAMPOS_DAS_METAS.some((c) => antes[c] !== depois[c]);
}
