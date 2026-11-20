import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import type { SeatProvider } from './billing-provider.port';
import { SEAT_PROVIDER } from './seat-pool.service';

export interface CreateProgramInput {
  name: string;
  note?: string | null;
  kind: 'CLASS' | 'CHALLENGE';
  seats: number;
  startDate: string;
  endDate: string;
  membershipIds?: string[];
  challengeId?: string;
}

export interface ProgramView {
  id: string;
  name: string;
  note: string | null;
  kind: 'CLASS' | 'CHALLENGE';
  challengeId: string | null;
  challengeTitle: string | null;
  seats: number;
  assigned: number;
  startDate: string;
  endDate: string;
  amountCents: number;
  chargeStatus: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
}

@Injectable()
export class ProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SEAT_PROVIDER) private readonly provedor: SeatProvider | null,
  ) {}

  list(_groupId: string): Promise<ProgramView[]> {
    throw new NotImplementedException();
  }

  create(_actorId: string, _groupId: string, _input: CreateProgramInput): Promise<ProgramView> {
    throw new NotImplementedException();
  }

  syncChallenge(_challengeId: string): Promise<number> {
    throw new NotImplementedException();
  }
}
