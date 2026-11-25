import { Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { DemoSessionService } from '../auth/demo-session.service';

export interface DemoSummary {
  groupId: string;
  name: string;
  brandColor: string;
  createdAt: Date;
  student: { userId: string; membershipId: string; name: string; joinedAt: Date | null };
  plan: {
    title: string;
    weekNumber: number;
    weeks: number;
    sessionsDone: number;
    sessionsPlanned: number;
  } | null;
  weight: { kg: number; loggedAt: Date; deltaKg: number | null } | null;
  today: { kcal: number; kcalGoal: number | null; waterMl: number; waterGoalMl: number };
  challenge: { id: string; title: string } | null;
}

export interface DemoState {
  demo: DemoSummary | null;
  /** Quem é dona de uma comunidade de verdade cria a demo. */
  canCreate: boolean;
  /** A comunidade de verdade para onde "Sair da demo" volta. */
  homeGroupId: string | null;
}

export interface FirstSteps {
  active: boolean;
  activeMembers: number;
  threshold: number;
}

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: DemoSessionService,
  ) {}

  async get(_ownerId: string): Promise<DemoState> {
    throw new NotImplementedException();
  }

  async create(_ownerId: string): Promise<DemoState> {
    throw new NotImplementedException();
  }

  async remove(_ownerId: string): Promise<{ removed: boolean }> {
    throw new NotImplementedException();
  }

  async openSession(_ownerId: string): Promise<{ token: string; expiresAt: Date }> {
    throw new NotImplementedException();
  }

  async firstSteps(_ownerId: string, _groupId: string): Promise<FirstSteps> {
    throw new NotImplementedException();
  }
}
