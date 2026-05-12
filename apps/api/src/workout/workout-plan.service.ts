import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type {
  AddPlanExerciseDto,
  CreatePlanDto,
  ReorderExercisesDto,
  UpdatePlanDto,
  UpdatePlanExerciseDto,
} from './dto/plan.dto';

const PLAN_INCLUDE = {
  exercises: {
    include: { exercise: true },
    orderBy: { order: 'asc' as const },
  },
} as const;

@Injectable()
export class WorkoutPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreatePlanDto) {
    return this.prisma.workoutPlan.create({
      data: { userId, name: dto.name },
      include: PLAN_INCLUDE,
    });
  }

  async findById(userId: string, id: string) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { id, userId },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async list(userId: string) {
    return this.prisma.workoutPlan.findMany({
      where: { userId },
      include: PLAN_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(userId: string, id: string, dto: UpdatePlanDto) {
    await this.assertOwner(userId, id);
    return this.prisma.workoutPlan.update({
      where: { id },
      data: dto,
      include: PLAN_INCLUDE,
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.assertOwner(userId, id);
    await this.prisma.workoutPlan.delete({ where: { id } });
  }

  async addExercise(userId: string, planId: string, dto: AddPlanExerciseDto) {
    await this.assertOwner(userId, planId);
    try {
      return await this.prisma.workoutPlanExercise.create({
        data: { planId, ...dto },
        include: { exercise: true },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Exercise already in plan');
      }
      throw err;
    }
  }

  async updatePlanExercise(
    userId: string,
    planId: string,
    planExerciseId: string,
    dto: UpdatePlanExerciseDto,
  ) {
    await this.assertOwner(userId, planId);
    const pe = await this.prisma.workoutPlanExercise.findFirst({
      where: { id: planExerciseId, planId },
    });
    if (!pe) throw new NotFoundException('Plan exercise not found');
    return this.prisma.workoutPlanExercise.update({
      where: { id: planExerciseId },
      data: dto,
      include: { exercise: true },
    });
  }

  async removeExercise(userId: string, planId: string, planExerciseId: string): Promise<void> {
    await this.assertOwner(userId, planId);
    const pe = await this.prisma.workoutPlanExercise.findFirst({
      where: { id: planExerciseId, planId },
    });
    if (!pe) throw new NotFoundException('Plan exercise not found');
    await this.prisma.workoutPlanExercise.delete({ where: { id: planExerciseId } });
  }

  async reorderExercises(userId: string, planId: string, dto: ReorderExercisesDto) {
    await this.assertOwner(userId, planId);
    await this.prisma.$transaction(
      dto.exercises.map(({ id, order }) =>
        this.prisma.workoutPlanExercise.update({
          where: { id },
          data: { order },
        }),
      ),
    );
    return this.findById(userId, planId);
  }

  private async assertOwner(userId: string, planId: string) {
    const plan = await this.prisma.workoutPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.userId !== userId) throw new ForbiddenException();
    return plan;
  }
}
