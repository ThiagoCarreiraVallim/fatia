import { Injectable } from '@nestjs/common';
import type { GroupRole, InviteOrigin, JoinVia } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import type { InviteKind, InviteStatus } from '../sharing/invite-state';
import type { ApiKeyContext } from './api-key.service';

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

@Injectable()
export class IntegrationReadService {
  constructor(private readonly prisma: PrismaService) {}

  async members(ctx: ApiKeyContext, q: PageQuery): Promise<{ items: ApiMember[] }> {
    void ctx;
    void q;
    void this.prisma;
    throw new Error('a fazer');
  }

  async invites(
    ctx: ApiKeyContext,
    q: PageQuery & { pending?: boolean },
  ): Promise<{ items: ApiInvite[] }> {
    void ctx;
    void q;
    throw new Error('a fazer');
  }

  async sends(
    ctx: ApiKeyContext,
    q: PageQuery & { kind?: ApiSendKind },
  ): Promise<{ items: ApiSend[] }> {
    void ctx;
    void q;
    throw new Error('a fazer');
  }
}
