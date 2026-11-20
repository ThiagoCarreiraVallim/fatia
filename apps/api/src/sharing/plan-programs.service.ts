import { Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ProfessionalAccessService } from './professional-access.service';

export interface PlanProgramItem {
  offerId: string;
  membershipId: string;
  name: string;
  title: string;
  authorName: string | null;
  schedule: 'CALENDAR' | 'FLEXIBLE';
  startDate: string | null;
  endDate: string | null;
  status: 'SENT' | 'SCHEDULED' | 'ACTIVE' | 'ENDING' | 'ENDED';
  startsInDays: number | null;
  sharesWorkout: boolean;
  progress: {
    done: number;
    planned: number | null;
    percent: number | null;
    weekNumber: number | null;
    weeks: number | null;
  } | null;
  phases: { week: number; focus: string; startDate: string; endDate: string; current: boolean }[];
  tags: string[];
}

export interface PlanProgramsView {
  counts: { all: number; active: number; ending: number; scheduled: number; ended: number };
  items: PlanProgramItem[];
}

@Injectable()
export class PlanProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProfessionalAccessService,
  ) {}

  list(_viewerId: string, _groupId: string): Promise<PlanProgramsView> {
    throw new NotImplementedException();
  }
}
