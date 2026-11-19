import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NutritionSummaryService } from '../nutrition/nutrition-summary.service';
import { ProgressService } from '../progress/progress.service';
import type { MemberAgenda, MemberFile } from './member-file.types';
import { MemberNoteService } from './member-note.service';
import { ProfessionalAccessService } from './professional-access.service';

@Injectable()
export class MemberFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProfessionalAccessService,
    private readonly nutrition: NutritionSummaryService,
    private readonly progress: ProgressService,
    private readonly notes: MemberNoteService,
  ) {}

  file(_viewerId: string, _groupId: string, _membershipId: string): Promise<MemberFile> {
    throw new Error('não implementado');
  }

  agenda(
    _viewerId: string,
    _groupId: string,
    _membershipId: string,
    _from?: string,
    _to?: string,
  ): Promise<MemberAgenda> {
    throw new Error('não implementado');
  }
}
