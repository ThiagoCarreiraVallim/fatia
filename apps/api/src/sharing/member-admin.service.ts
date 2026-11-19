import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupRole, MembershipStatus } from '@fatia/db';
import { SeatPoolService } from '../billing/seat-pool.service';
import { PrismaService } from '../common/prisma.service';
import { can, type GroupAction } from './permissions';

const NOT_FOUND = 'Group not found';
const MEMBER_NOT_FOUND = 'Membro não encontrado nesta comunidade';
const ACCOMPANIER_NOT_FOUND = 'Profissional não encontrado nesta comunidade';

/** Teto de um lote de ações em massa (Pn-04d). */
export const MEMBER_BULK_MAX = 100;

export type MemberBulkAction = 'accompany' | 'seat' | 'unseat';

export interface MemberBulkInput {
  action: MemberBulkAction;
  membershipIds: string[];
  /** Para `accompany`: o profissional (membership id), ou `null` para "Ninguém". */
  accompaniedByMembershipId?: string | null;
}

const ACAO_DO_LOTE: Record<MemberBulkAction, GroupAction> = {
  accompany: 'member.assign',
  seat: 'billing.manage',
  unseat: 'billing.manage',
};

/**
 * Administração de membros do painel (#401): quem acompanha cada pessoa e as
 * ações em massa (trocar responsável, dar e tirar assento). Todo id vem do
 * corpo e fica amarrado à comunidade da URL; o lote é tudo ou nada, e cada lote
 * deixa uma linha em `GroupAuditLog` (só ids e contagem).
 */
@Injectable()
export class MemberAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatPoolService,
  ) {}

  async setAccompaniedBy(
    actorId: string,
    groupId: string,
    membershipId: string,
    accompaniedByMembershipId: string | null,
  ): Promise<{ membershipId: string; accompaniedById: string | null }> {
    await this.assertCan(actorId, groupId, 'member.assign');
    const [alvo] = await this.members(groupId, [membershipId]);
    const acompanhante = await this.accompanier(groupId, accompaniedByMembershipId);
    if (acompanhante === alvo!.id) throw new BadRequestException('Ninguém acompanha a si mesmo');
    await this.prisma.groupMembership.update({
      where: { id: alvo!.id },
      data: { accompaniedById: acompanhante },
    });
    return { membershipId: alvo!.id, accompaniedById: acompanhante };
  }

  async bulk(
    actorId: string,
    groupId: string,
    input: MemberBulkInput,
  ): Promise<{ updated: number }> {
    const ids = [...new Set(input.membershipIds)];
    if (ids.length === 0 || ids.length > MEMBER_BULK_MAX) {
      throw new BadRequestException(`Escolha de 1 a ${MEMBER_BULK_MAX} pessoas`);
    }
    await this.assertCan(actorId, groupId, ACAO_DO_LOTE[input.action]);
    const alvos = await this.members(groupId, ids);

    let updated: number;
    let acompanhante: string | null = null;
    if (input.action === 'accompany') {
      acompanhante = await this.accompanier(groupId, input.accompaniedByMembershipId ?? null);
      const r = await this.prisma.groupMembership.updateMany({
        where: {
          id: { in: alvos.map((a) => a.id).filter((id) => id !== acompanhante) },
          groupId,
        },
        data: { accompaniedById: acompanhante },
      });
      updated = r.count;
    } else if (input.action === 'seat') {
      updated = await this.seats.assignMany(actorId, groupId, ids);
    } else {
      const r = await this.prisma.groupSeatAssignment.updateMany({
        where: { membershipId: { in: ids }, revokedAt: null, pool: { groupId } },
        data: { revokedAt: new Date() },
      });
      updated = r.count;
    }

    await this.prisma.groupAuditLog.create({
      data: {
        groupId,
        actorId,
        action: `members.${input.action}`,
        targetCount: ids.length,
        payload: {
          membershipIds: ids,
          ...(input.action === 'accompany' ? { accompaniedById: acompanhante } : {}),
        },
      },
    });
    return { updated };
  }

  /** Membros ativos desta comunidade, todos; um de fora derruba o lote inteiro (404). */
  private async members(groupId: string, ids: string[]) {
    const achados = await this.prisma.groupMembership.findMany({
      where: {
        id: { in: ids },
        groupId,
        status: MembershipStatus.ACTIVE,
        role: { not: GroupRole.OWNER },
      },
      select: { id: true },
    });
    if (achados.length !== ids.length) throw new NotFoundException(MEMBER_NOT_FOUND);
    return achados;
  }

  /** Profissional (ou o dono) ativo **desta** comunidade; `null` = ninguém. */
  private async accompanier(groupId: string, id: string | null): Promise<string | null> {
    if (!id) return null;
    const m = await this.prisma.groupMembership.findFirst({
      where: {
        id,
        groupId,
        status: MembershipStatus.ACTIVE,
        role: { in: [GroupRole.PROFESSIONAL, GroupRole.OWNER] },
      },
      select: { id: true },
    });
    if (!m) throw new NotFoundException(ACCOMPANIER_NOT_FOUND);
    return m.id;
  }

  private async assertCan(userId: string, groupId: string, action: GroupAction) {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true, status: true },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);
    if (!can(eu.role, action)) {
      throw new ForbiddenException('Seu papel nesta comunidade não permite esta ação');
    }
  }
}
