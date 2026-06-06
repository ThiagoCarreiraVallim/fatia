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

  /**
   * Esconde da listagem os exercícios base que o usuário já clonou — a cópia
   * editável passa a aparecer no lugar da base.
   */
  private notClonedByUser(userId: string) {
    return { NOT: { clones: { some: { createdByUserId: userId } } } };
  }

  async search(userId: string, params: SearchExercisesDto) {
    const limit = Math.min(params.limit ?? 20, 50);
    return this.prisma.exercise.findMany({
      where: {
        ...this.accessFilter(userId),
        ...this.notClonedByUser(userId),
        ...(params.q ? { name: { contains: params.q, mode: 'insensitive' as const } } : {}),
        ...(params.muscleGroup ? { muscleGroup: params.muscleGroup } : {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }

  async listByMuscle(userId: string, muscleGroup: string) {
    return this.prisma.exercise.findMany({
      where: {
        ...this.accessFilter(userId),
        ...this.notClonedByUser(userId),
        muscleGroup,
      },
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
    // Exercícios base (createdByUserId === null) são SÓ-LEITURA: para editar um base,
    // o usuário deve cloná-lo (cloneForEdit) e editar a cópia. Aqui só edita o próprio custom.
    if (ex.createdByUserId !== userId) throw new ForbiddenException();
    try {
      return await this.prisma.exercise.update({ where: { id }, data: dto });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Exercise name already in use');
      }
      throw err;
    }
  }

  /**
   * Cria (ou reaproveita) uma cópia editável de um exercício base para o usuário.
   * A cópia herda todos os campos do base e fica com clonedFromId = base.id, o que faz
   * a base sumir das listagens do usuário (passa a aparecer a cópia). Aplica overrides
   * opcionais (ex.: já editar no mesmo passo).
   */
  async cloneForEdit(userId: string, baseId: number, overrides?: UpdateCustomExerciseDto) {
    const base = await this.prisma.exercise.findFirst({
      where: { id: baseId, ...this.accessFilter(userId) },
    });
    if (!base) throw new NotFoundException('Exercise not found');

    // Já existe cópia desse base para o usuário? edita/retorna ela (idempotente).
    const existing = await this.prisma.exercise.findFirst({
      where: { createdByUserId: userId, clonedFromId: baseId },
    });
    if (existing) {
      return overrides && Object.keys(overrides).length
        ? this.updateCustom(userId, existing.id, overrides)
        : existing;
    }

    // Copia os campos do base (menos identidade/auditoria) para a nova cópia custom.
    const {
      id: _id,
      createdAt: _createdAt,
      createdByUserId: _owner,
      clonedFromId: _cf,
      ...fields
    } = base;
    void _id;
    void _createdAt;
    void _owner;
    void _cf;
    try {
      return await this.prisma.exercise.create({
        data: { ...fields, ...overrides, createdByUserId: userId, clonedFromId: baseId },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Você já tem um exercício com esse nome');
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
