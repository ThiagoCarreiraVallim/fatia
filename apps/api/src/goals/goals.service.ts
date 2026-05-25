import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    if (filter.status) where.status = filter.status;
    if (filter.kind) where.kind = filter.kind;
    const goals = await this.prisma.goal.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(goals.map((g) => this.withProgress(g, userId, timezone)));
  }

  async update(id: string, dto: UpdateGoalDto, userId: string, timezone: string) {
    await this.assertOwned(id, userId);
    const data: Prisma.GoalUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.targetValue !== undefined) data.targetValue = dto.targetValue;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.deadline !== undefined) data.deadline = dto.deadline ? new Date(dto.deadline) : null;
    if (dto.lastReportedValue !== undefined) data.lastReportedValue = dto.lastReportedValue;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === GoalStatus.completed) data.completedAt = new Date();
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
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.userId !== userId) throw new ForbiddenException();
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
    return { ...goal, currentValue, progressPercent };
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
      case GoalKind.body_fat:
      case GoalKind.custom:
        return lastReportedValue;
    }
  }
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
