import { Injectable, NotFoundException } from '@nestjs/common';
import { Goal, GoalKind, GoalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { WeightLogService } from '../progress/weight-log.service';
import { StepLogService } from '../progress/step-log.service';
import type { CreateGoalDto, ListGoalsDto, UpdateGoalDto } from './dto/goal.dto';

export interface GoalWithProgress extends Goal {
  currentValue: number | null;
  progressPercent: number | null;
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weights: WeightLogService,
    private readonly steps: StepLogService,
  ) {}

  async create(dto: CreateGoalDto, userId: string, timezone: string) {
    const startValue =
      dto.startValue ?? (await this.deriveCurrentValue(dto.kind, null, userId, timezone)) ?? 0;
    const goal = await this.prisma.goal.create({
      data: {
        userId,
        kind: dto.kind,
        title: dto.title,
        description: dto.description ?? null,
        startValue,
        targetValue: dto.targetValue,
        unit: dto.unit,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        lastReportedValue: dto.lastReportedValue ?? null,
      },
    });
    return this.withProgress(goal, userId, timezone);
  }

  async findById(id: string, userId: string, timezone: string): Promise<GoalWithProgress> {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal || goal.userId !== userId) throw new NotFoundException('Goal not found');
    return this.withProgress(goal, userId, timezone);
  }

  async list(filter: ListGoalsDto, userId: string, timezone: string): Promise<GoalWithProgress[]> {
    const where: Prisma.GoalWhereInput = { userId };
    if (filter.kind) where.kind = filter.kind;
    // O status filtra em memória, depois de aplicado o prazo: "vencida" é derivada, e um filtro no
    // banco por `active` traria a meta cujo prazo já passou para a aba errada.
    const goals = await this.prisma.goal.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const now = new Date();
    const visible = goals
      .map((g) => ({ ...g, status: effectiveStatus(g, now) }))
      .filter((g) => !filter.status || g.status === filter.status);
    return Promise.all(visible.map((g) => this.withProgress(g, userId, timezone)));
  }

  async update(id: string, dto: UpdateGoalDto, userId: string, timezone: string) {
    const current = await this.assertOwned(id, userId);
    const data: Prisma.GoalUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.targetValue !== undefined) data.targetValue = dto.targetValue;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.deadline !== undefined) data.deadline = dto.deadline ? new Date(dto.deadline) : null;
    if (dto.lastReportedValue !== undefined) data.lastReportedValue = dto.lastReportedValue;
    // "Novo prazo" (Al-G9): um prazo no futuro numa meta vencida a traz de volta às ativas. A
    // vencida pode estar gravada (`expired`, pelo MCP) ou só lida assim (ativa com prazo passado).
    const now = new Date();
    const newDeadline = dto.deadline ? new Date(dto.deadline) : null;
    if (
      dto.status === undefined &&
      newDeadline &&
      newDeadline > now &&
      effectiveStatus(current, now) === GoalStatus.expired
    ) {
      data.status = GoalStatus.active;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === GoalStatus.completed) data.completedAt = new Date();
      // Reabrir uma concluída tira a data de conclusão: a meta não está mais concluída.
      if (dto.status === GoalStatus.active) data.completedAt = null;
    }
    const goal = await this.prisma.goal.update({ where: { id }, data });
    return this.withProgress(goal, userId, timezone);
  }

  async complete(id: string, userId: string, timezone: string) {
    await this.assertOwned(id, userId);
    const goal = await this.prisma.goal.update({
      where: { id },
      data: { status: GoalStatus.completed, completedAt: new Date() },
    });
    return this.withProgress(goal, userId, timezone);
  }

  async delete(id: string, userId: string) {
    await this.assertOwned(id, userId);
    await this.prisma.goal.delete({ where: { id } });
    return { deleted: true as const };
  }

  private async assertOwned(id: string, userId: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    // Mesma resposta para "não existe" e "não é sua" (§IDs de docs/MCP.md).
    if (!goal || goal.userId !== userId) throw new NotFoundException('Goal not found');
    return goal;
  }

  private async withProgress(
    goal: Goal,
    userId: string,
    timezone: string,
  ): Promise<GoalWithProgress> {
    const currentValue = await this.deriveCurrentValue(
      goal.kind,
      goal.lastReportedValue,
      userId,
      timezone,
    );
    const progressPercent = computeProgress(goal.startValue, goal.targetValue, currentValue);
    return { ...goal, status: effectiveStatus(goal, new Date()), currentValue, progressPercent };
  }

  private async deriveCurrentValue(
    kind: GoalKind,
    lastReportedValue: number | null,
    userId: string,
    timezone: string,
  ): Promise<number | null> {
    switch (kind) {
      case GoalKind.weight: {
        const log = await this.weights.getLatest(userId);
        return log?.weightKg ?? null;
      }
      case GoalKind.workout_frequency: {
        // Sessões finalizadas nos últimos 7 dias.
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const count = await this.prisma.workoutSession.count({
          where: { userId, completedAt: { not: null, gte: since } },
        });
        return count;
      }
      case GoalKind.step_count: {
        const history = await this.steps.getHistory(7, userId, timezone);
        if (history.length === 0) return null;
        const total = history.reduce((acc, h) => acc + h.steps, 0);
        return Math.round(total / history.length);
      }
      // % de gordura ainda vem do que a pessoa (ou o Claude) reporta: a fonte automática é a
      // avaliação física, que chega com a #383 — o ponto de extensão é este `case`.
      case GoalKind.body_fat:
      case GoalKind.custom:
        return lastReportedValue;
    }
  }
}

/**
 * A situação lida da meta: ativa com o prazo já passado é vencida (#382). Derivada na leitura —
 * nenhum job nem GET grava a troca, e um novo prazo a desfaz sozinho. Concluída e arquivada não
 * vencem.
 */
export function effectiveStatus(goal: Pick<Goal, 'status' | 'deadline'>, now: Date): GoalStatus {
  if (goal.status === GoalStatus.active && goal.deadline && goal.deadline < now) {
    return GoalStatus.expired;
  }
  return goal.status;
}

/**
 * Progresso normalizado [0, 100]. Lida com metas crescentes ou decrescentes
 * inferindo a direção a partir do sinal de (target - start).
 */
export function computeProgress(
  startValue: number,
  targetValue: number,
  currentValue: number | null,
): number | null {
  if (currentValue === null) return null;
  const range = targetValue - startValue;
  if (range === 0) return currentValue === targetValue ? 100 : 0;
  const pct = ((currentValue - startValue) / range) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
