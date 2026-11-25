import { Injectable } from '@nestjs/common';
import {
  GroupRole,
  MembershipStatus,
  NutritionPlanStatus,
  OfferPurchaseStatus,
  type InviteOrigin,
  type JoinVia,
  type PlanOfferStatus,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import {
  activationPendingWhere,
  inviteKind,
  inviteStatus,
  type InviteKind,
  type InviteStatus,
} from '../sharing/invite-state';
import type { ApiKeyContext } from './api-key.service';

export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 100;

export interface PageQuery {
  /** Só o que aconteceu depois disto (ISO 8601). */
  since?: Date;
  /** Até 100; padrão 50. */
  limit?: number;
}

export interface ApiMember {
  /** Id da associação: estável, serve para o Zapier não repetir a linha. */
  id: string;
  name: string;
  role: GroupRole;
  joinedAt: Date | null;
  /** Por onde entrou: convite, código ou página. */
  via: JoinVia | null;
  /** A origem do convite (QR, Instagram…), quando entrou por um. */
  origin: InviteOrigin | null;
  /** O nome do link que a equipe deu ("Recepção"). */
  label: string | null;
}

export interface ApiInvite {
  id: string;
  kind: InviteKind;
  email: string | null;
  role: GroupRole;
  label: string | null;
  origin: InviteOrigin | null;
  status: InviteStatus;
  /** Convite por e-mail sem aceite há 2 dias ou mais (Ativação pendente). */
  pending: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  lastSentAt: Date | null;
  acceptedAt: Date | null;
}

export type ApiSendKind = 'WORKOUT_PLAN' | 'NUTRITION_PLAN' | 'PROGRAM_SALE';

export interface ApiSend {
  id: string;
  kind: ApiSendKind;
  title: string;
  /** Quem recebeu (ou comprou). */
  name: string;
  /** Só na venda: o e-mail que a pessoa deu ao comprar. */
  email: string | null;
  status: string;
  at: Date;
}

const SEND_STATUS: Record<PlanOfferStatus, string> = {
  PENDING: 'SENT',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  SUPERSEDED: 'SUPERSEDED',
};

/**
 * O que uma chave de API lê (#413): convites, membros (nome, papel, origem e
 * data) e envios, sempre da comunidade da chave e nunca dado de saúde — nem
 * com consentimento: a chave é da comunidade, não de alguém da equipe com
 * vínculo, e o que sai daqui vai para fora do Fatia. O escopo e a cota já
 * foram cobrados (`ApiKeyService.consume`).
 */
@Injectable()
export class IntegrationReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Membros ativos, quem entrou por último primeiro (o gatilho "novo membro"). */
  async members(ctx: ApiKeyContext, q: PageQuery): Promise<{ items: ApiMember[] }> {
    const rows = await this.prisma.groupMembership.findMany({
      where: {
        groupId: ctx.groupId,
        status: MembershipStatus.ACTIVE,
        ...(q.since ? { joinedAt: { gt: q.since } } : {}),
      },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        createdAt: true,
        joinVia: true,
        user: { select: { name: true } },
        joinedViaInvite: { select: { origin: true, label: true } },
      },
      orderBy: [{ joinedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: pageSize(q.limit),
    });
    return {
      items: rows.map((m) => ({
        id: m.id,
        name: m.user.name,
        role: m.role,
        joinedAt: m.joinedAt,
        via: m.joinVia,
        origin: m.joinedViaInvite?.origin ?? null,
        label: m.joinedViaInvite?.label ?? null,
      })),
    };
  }

  /**
   * Convites, o mais novo primeiro. `pending` é a Ativação pendente (#401):
   * por e-mail, sem aceite há 2 dias ou mais (a receita do WhatsApp).
   */
  async invites(
    ctx: ApiKeyContext,
    q: PageQuery & { pending?: boolean },
  ): Promise<{ items: ApiInvite[] }> {
    const now = new Date();
    const pendente = activationPendingWhere(ctx.groupId, GroupRole.OWNER, now);
    const rows = await this.prisma.groupInvite.findMany({
      where: {
        ...(q.pending ? { ...pendente, declinedAt: null } : { groupId: ctx.groupId }),
        ...(q.since ? { createdAt: { gt: q.since } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: pageSize(q.limit),
    });
    const limiar = pendente.createdAt.lte.getTime();
    return {
      items: rows.map((i) => {
        const status = inviteStatus(i, now);
        return {
          id: i.id,
          kind: inviteKind(i),
          email: i.email,
          role: i.role,
          label: i.label,
          origin: i.origin,
          status,
          pending:
            i.email !== null &&
            i.code === null &&
            i.uses === 0 &&
            i.acceptedAt === null &&
            i.revokedAt === null &&
            i.declinedAt === null &&
            i.createdAt.getTime() <= limiar,
          createdAt: i.createdAt,
          expiresAt: i.expiresAt,
          lastSentAt: i.lastSentAt,
          acceptedAt: i.acceptedAt,
        };
      }),
    };
  }

  /**
   * Envios: os planos de treino e alimentares que a equipe mandou e os
   * programas vendidos e pagos. Do plano sai só o nome do modelo, nunca as
   * faixas de calorias e macros (são prescrição da pessoa).
   */
  async sends(
    ctx: ApiKeyContext,
    q: PageQuery & { kind?: ApiSendKind },
  ): Promise<{ items: ApiSend[] }> {
    const take = pageSize(q.limit);
    const wants = (k: ApiSendKind) => !q.kind || q.kind === k;
    const [treinos, alimentares, vendas] = await Promise.all([
      wants('WORKOUT_PLAN')
        ? this.prisma.planOfferVersion.findMany({
            where: {
              offer: { groupId: ctx.groupId, removedAt: null },
              ...(q.since ? { sentAt: { gt: q.since } } : {}),
            },
            select: {
              id: true,
              title: true,
              status: true,
              sentAt: true,
              offer: { select: { user: { select: { name: true } } } },
            },
            orderBy: { sentAt: 'desc' },
            take,
          })
        : [],
      wants('NUTRITION_PLAN')
        ? this.prisma.nutritionPlan.findMany({
            where: {
              groupId: ctx.groupId,
              ...(q.since ? { sentAt: { gt: q.since } } : {}),
            },
            select: {
              id: true,
              status: true,
              sentAt: true,
              user: { select: { name: true } },
              sourceTemplate: { select: { title: true } },
            },
            orderBy: { sentAt: 'desc' },
            take,
          })
        : [],
      wants('PROGRAM_SALE')
        ? this.prisma.groupOfferPurchase.findMany({
            where: {
              offer: { groupId: ctx.groupId },
              status: OfferPurchaseStatus.PAID,
              paidAt: q.since ? { gt: q.since } : { not: null },
            },
            select: {
              id: true,
              buyerName: true,
              buyerEmail: true,
              paidAt: true,
              offer: { select: { title: true } },
            },
            orderBy: { paidAt: 'desc' },
            take,
          })
        : [],
    ]);
    const items: ApiSend[] = [
      ...treinos.map((v) => ({
        id: v.id,
        kind: 'WORKOUT_PLAN' as const,
        title: v.title,
        name: v.offer.user.name,
        email: null,
        status: SEND_STATUS[v.status],
        at: v.sentAt,
      })),
      ...alimentares.map((p) => ({
        id: p.id,
        kind: 'NUTRITION_PLAN' as const,
        title: p.sourceTemplate?.title ?? 'Plano alimentar',
        name: p.user.name,
        email: null,
        status:
          p.status === NutritionPlanStatus.SENT
            ? 'SENT'
            : p.status === NutritionPlanStatus.ACCEPTED
              ? 'ACCEPTED'
              : 'SUPERSEDED',
        at: p.sentAt,
      })),
      ...vendas.map((c) => ({
        id: c.id,
        kind: 'PROGRAM_SALE' as const,
        title: c.offer.title,
        name: c.buyerName,
        email: c.buyerEmail,
        status: 'PAID',
        at: c.paidAt!,
      })),
    ];
    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return { items: items.slice(0, take) };
  }
}

function pageSize(limit: number | undefined): number {
  if (!limit || !Number.isInteger(limit) || limit < 1) return PAGE_DEFAULT;
  return Math.min(limit, PAGE_MAX);
}
