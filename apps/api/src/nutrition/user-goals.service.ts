import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { UpsertGoalsDto } from './dto/goals.dto';

@Injectable()
export class UserGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    return this.prisma.userGoals.findUnique({ where: { userId } });
  }

  async upsert(userId: string, dto: UpsertGoalsDto) {
    return this.prisma.userGoals.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }
}
