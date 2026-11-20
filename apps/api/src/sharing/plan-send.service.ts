import { Injectable } from '@nestjs/common';
import type { PlanSchedule } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { NutritionPlanService } from '../nutrition/nutrition-plan.service';
import { NotificationService } from '../notifications/notification.service';
import type { SendPlansDto } from './dto/plan-send.dto';
import { PlanOfferService } from './plan-offer.service';
import { ProfessionalAccessService } from './professional-access.service';

export interface SendRecipient {
  membershipId: string;
  name: string;
  /** "Acompanhados por mim" (#404). */
  accompaniedByMe: boolean;
  /** Tem plano desta comunidade esperando resposta ou em andamento. */
  hasPlan: boolean;
  /** Já tem uma cópia (ou a oferta) do modelo pedido: o envio vira versão nova. */
  alreadyHas: boolean;
}

export interface SendRecipientsView {
  recipients: SendRecipient[];
}

export interface SendResultItem {
  membershipId: string;
  /** Id da oferta de treino ou do plano alimentar. */
  id: string;
  version: number;
  /** `update`: versão nova de uma oferta que a pessoa já tinha. */
  kind: 'new' | 'update';
}

export interface SendResult {
  results: SendResultItem[];
}

export type SentStatus = 'SENT' | 'ACCEPTED' | 'DECLINED' | 'SUPERSEDED' | 'REVOKED' | 'ENDED';

export interface SentItem {
  id: string;
  kind: 'WORKOUT' | 'NUTRITION';
  title: string;
  version: number;
  changeNote: string | null;
  name: string;
  membershipId: string | null;
  sentAt: Date;
  status: SentStatus;
  schedule: PlanSchedule | null;
  startDate: string | null;
  endDate: string | null;
  /** Treinos feitos do plano, só com Treino liberado para quem olha. */
  progress: { done: number; planned: number | null; percent: number | null } | null;
  /** Aceito, mas sem Treino liberado: "sem progresso" (só o estado, nunca o motivo). */
  noProgress: boolean;
  /** Ainda sem resposta: dá para cancelar o envio. */
  canRevoke: boolean;
}

export interface SentList {
  items: SentItem[];
}

/**
 * Enviar para alunos (#405, Pn-18 e Pn-08b). Esqueleto: a implementação vem
 * depois dos testes.
 */
@Injectable()
export class PlanSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: PlanOfferService,
    private readonly nutritionPlans: NutritionPlanService,
    private readonly notifications: NotificationService,
    private readonly access: ProfessionalAccessService,
  ) {}

  recipients(
    _viewerId: string,
    _groupId: string,
    _templateId?: string,
  ): Promise<SendRecipientsView> {
    throw new Error('não implementado');
  }

  send(_viewerId: string, _groupId: string, _input: SendPlansDto): Promise<SendResult> {
    throw new Error('não implementado');
  }

  list(_viewerId: string, _groupId: string): Promise<SentList> {
    throw new Error('não implementado');
  }

  revoke(
    _viewerId: string,
    _groupId: string,
    _id: string,
  ): Promise<{ id: string; status: 'REVOKED' }> {
    throw new Error('não implementado');
  }
}
