import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupRole, MembershipStatus } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import {
  can,
  canManageMember,
  permissionTable,
  rolesGrantableBy,
  type GroupAction,
  type PermissionTable,
  type Specialty,
} from './permissions';
import { ProfessionalLinkService } from './professional-link.service';

const NOT_FOUND = 'Group not found';
const MEMBER_NOT_FOUND = 'Membership not found';

/** As linhas da trilha que a tela Equipe mostra ao dono. */
const HISTORY_ACTIONS = [
  'members.role',
  'members.specialty',
  'members.accompany',
  'members.approve',
  'group.pro_see_only_assigned',
];
const HISTORY_MAX = 30;

export interface StaffView {
  membershipId: string;
  name: string;
  role: GroupRole;
  specialty: Specialty | null;
  /** Quantos membros ativos ela acompanha; `null` para quem não acompanha ninguém por papel. */
  accompanies: number | null;
  /** Último acesso ao painel (carimbado pelos contadores do menu). */
  panelSeenAt: Date | null;
  isMe: boolean;
  /** Quem pergunta pode trocar o papel, a especialidade ou remover esta pessoa. */
  manageable: boolean;
}

export interface StaffChange {
  at: Date;
  action: string;
  actorName: string | null;
  /** A pessoa, quando a mudança é de uma só. */
  targetName: string | null;
  targetCount: number;
  from: string | null;
  to: string | null;
}

export interface StaffOverview {
  staff: StaffView[];
  /** Os papéis que quem pergunta pode dar. */
  grantableRoles: GroupRole[];
  proSeeOnlyAssigned: boolean;
  /** Quem mudou papel, especialidade e responsável. Só o dono vê (`null` para os outros). */
  history: StaffChange[] | null;
}

/**
 * A tela Equipe do painel (#404, Pn-19): a equipe por papel, a especialidade
 * do profissional e a tabela "O que cada papel pode fazer". Papel decide ação;
 * nada aqui lê dado de saúde de ninguém.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProfessionalLinkService,
  ) {}

  /** A tabela da Pn-19, da mesma matriz do guarda. */
  permissions(): PermissionTable {
    return permissionTable();
  }

  async staff(actorId: string, groupId: string): Promise<StaffOverview> {
    const eu = await this.assertAction(actorId, groupId, 'member.role');
    const [grupo, pessoas, acompanhados] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { proSeeOnlyAssigned: true },
      }),
      this.prisma.groupMembership.findMany({
        where: { groupId, status: MembershipStatus.ACTIVE, role: { not: GroupRole.MEMBER } },
        select: {
          id: true,
          userId: true,
          role: true,
          specialty: true,
          panelSeenAt: true,
          user: { select: { name: true } },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.groupMembership.groupBy({
        by: ['accompaniedById'],
        where: {
          groupId,
          status: MembershipStatus.ACTIVE,
          role: GroupRole.MEMBER,
          accompaniedById: { not: null },
        },
        _count: { _all: true },
      }),
    ]);
    const quantos = new Map(acompanhados.map((a) => [a.accompaniedById, a._count._all]));
    const acompanha = (r: GroupRole) => r === GroupRole.PROFESSIONAL || r === GroupRole.OWNER;
    return {
      staff: pessoas.map((p) => ({
        membershipId: p.id,
        name: p.user.name,
        role: p.role,
        specialty: p.specialty,
        accompanies: acompanha(p.role) ? (quantos.get(p.id) ?? 0) : null,
        panelSeenAt: p.panelSeenAt,
        isMe: p.userId === actorId,
        manageable: p.userId !== actorId && canManageMember(eu.role, p.role),
      })),
      grantableRoles: [...rolesGrantableBy(eu.role)],
      proSeeOnlyAssigned: grupo.proSeeOnlyAssigned,
      history: eu.role === GroupRole.OWNER ? await this.history(groupId) : null,
    };
  }

  /**
   * A especialidade do profissional (#404, ADR 043). Nutrição recorta, na
   * mesma transação, os vínculos que ele recebe: o que sobra é Alimentação,
   * Metas, Corpo e Fotos das refeições. Trocar para outra não devolve nada.
   */
  async setSpecialty(
    actorId: string,
    groupId: string,
    membershipId: string,
    specialty: Specialty | null,
  ): Promise<{ membershipId: string; specialty: Specialty | null; narrowedLinks: number }> {
    const eu = await this.assertAction(actorId, groupId, 'member.role');
    const alvo = await this.prisma.groupMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, groupId: true, userId: true, role: true, status: true, specialty: true },
    });
    // Amarrado à comunidade da URL: o id do corpo só encontra, nunca autoriza.
    if (!alvo || alvo.groupId !== groupId || alvo.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    if (alvo.role !== GroupRole.PROFESSIONAL) {
      throw new ConflictException('Especialidade é só de quem é profissional');
    }
    if (!canManageMember(eu.role, alvo.role)) {
      throw new ForbiddenException('Seu papel não muda a especialidade desta pessoa');
    }
    if (alvo.specialty === specialty) {
      return { membershipId: alvo.id, specialty, narrowedLinks: 0 };
    }
    const at = new Date();
    const corte = await this.links.narrowReceiverOps(groupId, alvo.userId, specialty, at);
    await this.prisma.$transaction([
      this.prisma.groupMembership.update({ where: { id: alvo.id }, data: { specialty } }),
      ...corte.ops,
      this.prisma.groupAuditLog.create({
        data: {
          groupId,
          actorId,
          action: 'members.specialty',
          targetCount: 1,
          payload: { membershipIds: [alvo.id], from: alvo.specialty, to: specialty },
        },
      }),
    ]);
    return { membershipId: alvo.id, specialty, narrowedLinks: corte.narrowed };
  }

  private async history(groupId: string): Promise<StaffChange[]> {
    const linhas = await this.prisma.groupAuditLog.findMany({
      where: { groupId, action: { in: HISTORY_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MAX,
      select: {
        createdAt: true,
        action: true,
        targetCount: true,
        payload: true,
        actor: { select: { name: true } },
      },
    });
    const payloadOf = (p: unknown) =>
      (p && typeof p === 'object' ? p : {}) as {
        membershipIds?: string[];
        from?: string | null;
        to?: string | null;
        value?: boolean;
        accompaniedById?: string | null;
      };
    const ids = new Set<string>();
    for (const l of linhas) {
      const p = payloadOf(l.payload);
      if (p.membershipIds?.length === 1) ids.add(p.membershipIds[0]!);
      if (p.accompaniedById) ids.add(p.accompaniedById);
    }
    const nomes = new Map(
      (
        await this.prisma.groupMembership.findMany({
          where: { id: { in: [...ids] }, groupId },
          select: { id: true, user: { select: { name: true } } },
        })
      ).map((m) => [m.id, m.user.name]),
    );
    return linhas.map((l) => {
      const p = payloadOf(l.payload);
      const um = p.membershipIds?.length === 1 ? p.membershipIds[0]! : null;
      const acompanhante =
        l.action === 'members.accompany'
          ? p.accompaniedById
            ? (nomes.get(p.accompaniedById) ?? null)
            : null
          : undefined;
      return {
        at: l.createdAt,
        action: l.action,
        actorName: l.actor?.name ?? null,
        targetName: um ? (nomes.get(um) ?? null) : null,
        targetCount: l.targetCount,
        from: p.from ?? null,
        to:
          acompanhante !== undefined
            ? acompanhante
            : l.action === 'group.pro_see_only_assigned'
              ? String(Boolean(p.value))
              : (p.to ?? null),
      };
    });
  }

  private async assertAction(
    userId: string,
    groupId: string,
    action: GroupAction,
  ): Promise<{ id: string; role: GroupRole }> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, role: true, status: true },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);
    if (!can(eu.role, action)) {
      throw new ForbiddenException('Seu papel nesta comunidade não cuida da equipe');
    }
    return eu;
  }
}
