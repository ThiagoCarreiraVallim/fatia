import { Injectable, NotImplementedException } from '@nestjs/common';
import type { NutritionPlanStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { NutritionPlanService } from '../nutrition/nutrition-plan.service';
import type { NutritionDocumentView } from './nutrition-document';
import { ProfessionalAccessService } from './professional-access.service';

/** Ações da trilha (`ProfessionalAccessLog.action`) da cópia do plano alimentar. */
export const NUTRITION_COPY_READ_ACTION = 'open_nutrition_copy';
export const NUTRITION_COPY_EDIT_ACTION = 'edit_nutrition_copy';

export interface NutritionCopyView {
  planId: string;
  membershipId: string;
  studentName: string;
  /** O título do modelo de onde a cópia saiu, ou "Plano alimentar". */
  title: string;
  /** Quem mandou o plano; nulo se apagou a conta. */
  authorName: string | null;
  /** "Ver original": o modelo da biblioteca. */
  template: { id: string; title: string } | null;
  /** A versão que o editor abre: a última da linhagem. */
  version: { id: string; version: number; status: NutritionPlanStatus };
  /** Há uma versão nova esperando o aceite da pessoa. */
  pendingUpdate: boolean;
  document: NutritionDocumentView;
  /** Trocas de hoje em diante que a pessoa já fez e que seguem na versão nova. */
  swapsKept: number;
}

export interface SaveNutritionCopyInput {
  document: unknown;
  changeNote?: string | null;
  /** "Avisar a Ana no app". Padrão: avisa. */
  notify?: boolean;
  /** A versão que o editor abriu: outra salva depois dela dá 409. */
  baseVersionId?: string;
}

/**
 * Editar a cópia do plano alimentar de um aluno (#407, Pn-24c).
 */
@Injectable()
export class NutritionCopyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: NutritionPlanService,
    private readonly access: ProfessionalAccessService,
    private readonly notifications: NotificationService,
  ) {}

  get(
    viewerId: string,
    groupId: string,
    membershipId: string,
    planId: string,
  ): Promise<NutritionCopyView> {
    void [viewerId, groupId, membershipId, planId, this.prisma, this.plans, this.access];
    throw new NotImplementedException();
  }

  save(
    viewerId: string,
    groupId: string,
    membershipId: string,
    planId: string,
    input: SaveNutritionCopyInput,
  ): Promise<{ planId: string; version: number }> {
    void [viewerId, groupId, membershipId, planId, input, this.notifications];
    throw new NotImplementedException();
  }
}
