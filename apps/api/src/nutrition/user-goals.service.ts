import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, UserGoals } from '@prisma/client';
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

/**
 * De onde veio a troca das metas, para o histórico (#396): `manual` (tela de
 * metas, onboarding, MCP), `group_plan` (plano da comunidade) ou
 * `nutrition_plan` (plano alimentar aceito).
 */
export interface GoalsChangeOrigin {
  source: 'manual' | 'group_plan' | 'nutrition_plan';
  templateId?: string | null;
  templateTitle?: string | null;
}

/** O que a troca fez: as metas gravadas, as de antes e se o "antes" foi para o histórico. */
export interface GoalsWriteResult {
  goals: UserGoals;
  previous: UserGoals | null;
  historyWritten: boolean;
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

/**
 * Grava as metas e, se já havia metas e alguma muda, o "antes" vai para
 * `UserGoalsHistory` (#396). Roda dentro de uma transação (`db` é o `tx`): a
 * linha das metas é travada com `FOR UPDATE` antes de ler o "antes", e duas
 * trocas ao mesmo tempo não gravam o mesmo "antes" duas vezes. Todo caminho
 * que troca metas passa por aqui (tela, MCP, onboarding, plano da comunidade,
 * plano alimentar aceito).
 */
export async function upsertWithHistory(
  db: Prisma.TransactionClient,
  userId: string,
  dto: UpsertGoalsDto,
  origin: GoalsChangeOrigin,
): Promise<GoalsWriteResult> {
  await db.$queryRaw`SELECT 1 FROM "UserGoals" WHERE "userId" = ${userId} FOR UPDATE`;
  const previous = (await db.userGoals.findUnique({ where: { userId } })) ?? null;
  const goals = await db.userGoals.upsert({
    where: { userId },
    create: { userId, ...dto },
    update: dto,
  });
  const historyWritten = previous !== null && changes(previous, dto);
  if (historyWritten) {
    await db.userGoalsHistory.create({
      data: {
        userId,
        kcalMin: previous.kcalMin,
        kcalMax: previous.kcalMax,
        proteinMinG: previous.proteinMinG,
        proteinMaxG: previous.proteinMaxG,
        carbsMinG: previous.carbsMinG,
        carbsMaxG: previous.carbsMaxG,
        fatMinG: previous.fatMinG,
        fatMaxG: previous.fatMaxG,
        weeklyWorkouts: previous.weeklyWorkouts,
        dailyStepsTarget: previous.dailyStepsTarget,
        dailyWaterTargetMl: previous.dailyWaterTargetMl,
        source: origin.source,
        templateId: origin.templateId ?? null,
        templateTitle: origin.templateTitle ?? null,
      },
    });
  }
  return { goals, previous, historyWritten };
}

/** Algum campo enviado difere do que estava? Campo ausente no envio fica como está. */
function changes(previous: UserGoals, dto: UpsertGoalsDto): boolean {
  return CAMPOS_DAS_METAS.some((c) => dto[c] !== undefined && dto[c] !== previous[c]);
}

@Injectable()
export class UserGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    return this.prisma.userGoals.findUnique({ where: { userId } });
  }

  /** Valida, grava com histórico (ver `upsertWithHistory`) e marca a primeira vez. */
  async upsert(
    userId: string,
    dto: UpsertGoalsDto,
    origin: GoalsChangeOrigin = { source: 'manual' },
  ): Promise<GoalsWriteResult> {
    assertGoalsValid(dto);
    const result = await this.prisma.$transaction((tx) =>
      upsertWithHistory(tx, userId, dto, origin),
    );
    // Quem definiu metas por outro caminho (MCP, tela de metas) já passou da
    // primeira vez: o app não deve mandá-lo ao assistente.
    await this.prisma.user.updateMany({
      where: { id: userId, onboardedAt: null },
      data: { onboardedAt: new Date() },
    });
    return result;
  }
}
