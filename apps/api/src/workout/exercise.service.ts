import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type {
  CreateCustomExerciseDto,
  SearchExercisesDto,
  UpdateCustomExerciseDto,
} from './dto/exercise.dto';

@Injectable()
export class ExerciseService {
  constructor(private readonly prisma: PrismaService) {}

  private accessFilter(userId: string) {
    return { OR: [{ createdByUserId: null }, { createdByUserId: userId }] };
  }

  async search(userId: string, params: SearchExercisesDto) {
    const limit = Math.min(params.limit ?? 20, 50);
    return this.prisma.exercise.findMany({
      where: {
        ...this.accessFilter(userId),
        ...(params.q ? { name: { contains: params.q, mode: 'insensitive' as const } } : {}),
        ...(params.muscleGroup ? { muscleGroup: params.muscleGroup } : {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }

  async listByMuscle(userId: string, muscleGroup: string) {
    return this.prisma.exercise.findMany({
      where: { ...this.accessFilter(userId), muscleGroup },
      orderBy: { name: 'asc' },
    });
  }

  async get(userId: string, id: number) {
    const ex = await this.prisma.exercise.findFirst({
      where: { id, ...this.accessFilter(userId) },
    });
    if (!ex) throw new NotFoundException('Exercise not found');
    return ex;
  }

  async findByName(userId: string, name: string) {
    const results = await this.prisma.exercise.findMany({
      where: {
        ...this.accessFilter(userId),
        name: { contains: name, mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
      take: 5,
    });
    if (results.length === 0) throw new NotFoundException(`Exercise not found: ${name}`);
    return results;
  }

  async createCustom(userId: string, dto: CreateCustomExerciseDto) {
    try {
      return await this.prisma.exercise.create({
        data: { ...dto, createdByUserId: userId },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Exercise name already in use');
      }
      throw err;
    }
  }

  async updateCustom(userId: string, id: number, dto: UpdateCustomExerciseDto) {
    const ex = await this.prisma.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Exercise not found');
    // Permite enriquecer/editar: exercício custom do próprio usuário OU exercício
    // do catálogo (createdByUserId === null). Bloqueia só o custom de OUTRO usuário.
    if (ex.createdByUserId !== null && ex.createdByUserId !== userId) {
      throw new ForbiddenException();
    }
    try {
      return await this.prisma.exercise.update({ where: { id }, data: dto });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Exercise name already in use');
      }
      throw err;
    }
  }

  async deleteCustom(userId: string, id: number): Promise<void> {
    const ex = await this.prisma.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Exercise not found');
    if (ex.createdByUserId !== userId) throw new ForbiddenException();
    const uses = await this.prisma.sessionSet.count({ where: { exerciseId: id } });
    if (uses > 0) throw new ConflictException('Exercise is in use by existing session sets');
    await this.prisma.exercise.delete({ where: { id } });
  }
}
