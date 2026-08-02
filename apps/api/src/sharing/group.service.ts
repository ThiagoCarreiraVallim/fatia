import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { GroupRole, GroupType, MembershipStatus, type Group } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';

/** Resposta única para grupo que não existe e para grupo de que não sou membro (#92). */
const NOT_FOUND = 'Group not found';

/**
 * Status em que a associação ainda é viva — o que decide se o grupo aparece
 * para quem pergunta.
 *
 * Constante compartilhada, e não um `if` por método: `listMine` escondia o
 * grupo de quem saiu (`LEFT`) enquanto `findByIdForMember` barrava só `REMOVED`
 * e continuava devolvendo nome e slug por id. Duas listas escritas à mão
 * divergem; esta é a única.
 */
const STATUS_VIVOS = [MembershipStatus.INVITED, MembershipStatus.ACTIVE] as const;

export interface CreateGroupInput {
  type: GroupType;
  name: string;
  /** Opcional: sem slug, deriva do nome com sufixo aleatório. */
  slug?: string;
}

export interface GroupSummary {
  id: string;
  type: GroupType;
  name: string;
  slug: string;
  /** Papel de quem está perguntando. Nunca o papel de outra pessoa. */
  role: GroupRole;
  status: MembershipStatus;
  membershipId: string;
  joinedAt: Date | null;
  createdAt: Date;
}

/** Preview mostrado a quem foi convidado, ANTES de decidir entrar. */
export interface GroupPreview {
  id: string;
  type: GroupType;
  name: string;
  slug: string;
  memberCount: number;
}

/**
 * Ciclo de vida do grupo (ADR 014).
 *
 * Grupo é contexto administrativo e **não** é permissão: nenhum método daqui
 * cria, lê ou altera `ProfessionalLink`. Entrar concede zero — quem lê dado de
 * saúde é quem tem vínculo consentido pelo titular, ato separado (#155).
 */
@Injectable()
export class GroupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria o grupo já com a membership de `OWNER`.
   *
   * Escrita aninhada, e não duas chamadas: grupo sem dono é órfão com cobrança
   * viva — se a segunda escrita falhasse sozinha, ninguém poderia administrar
   * nem apagar o que ficou. O aninhamento roda numa transação só, sem transação
   * interativa (pgbouncer, ADR 010).
   */
  async create(ownerId: string, input: CreateGroupInput): Promise<Group> {
    const slug = input.slug ?? this.derivarSlug(input.name);

    try {
      return await this.prisma.group.create({
        data: {
          type: input.type,
          name: input.name,
          slug,
          ownerId,
          memberships: {
            create: {
              userId: ownerId,
              role: GroupRole.OWNER,
              status: MembershipStatus.ACTIVE,
              joinedAt: new Date(),
            },
          },
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        // Slug é público e escolhido por humano: colisão é erro de entrada, não
        // existência a esconder.
        throw new ConflictException('Slug já está em uso');
      }
      throw err;
    }
  }

  /** Grupos de quem pergunta, com o papel dele. Nunca grupos de terceiros. */
  async listMine(userId: string): Promise<GroupSummary[]> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        userId,
        // Quem saiu ou foi removido não vê mais o grupo na própria lista; a
        // linha continua no banco para o histórico.
        status: { in: [...STATUS_VIVOS] },
      },
      include: { group: true },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.group.id,
      type: m.group.type,
      name: m.group.name,
      slug: m.group.slug,
      role: m.role,
      status: m.status,
      membershipId: m.id,
      joinedAt: m.joinedAt,
      createdAt: m.group.createdAt,
    }));
  }

  /**
   * Grupo por id, do ponto de vista de quem pergunta.
   *
   * Não-membro recebe o mesmo `NOT_FOUND` de grupo inexistente — devolver
   * "existe, mas você não está" transformaria a rota em oráculo de existência de
   * academia, e o slug é o único identificador público do produto.
   *
   * Quem saiu conta como não-membro: `STATUS_VIVOS` é o mesmo conjunto de
   * `listMine`, senão o grupo some da lista e continua legível por id.
   */
  async findByIdForMember(userId: string, groupId: string): Promise<GroupSummary> {
    const membership = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { group: true },
    });

    if (!membership || !STATUS_VIVOS.some((status) => status === membership.status)) {
      throw new NotFoundException(NOT_FOUND);
    }

    return {
      id: membership.group.id,
      type: membership.group.type,
      name: membership.group.name,
      slug: membership.group.slug,
      role: membership.role,
      status: membership.status,
      membershipId: membership.id,
      joinedAt: membership.joinedAt,
      createdAt: membership.group.createdAt,
    };
  }

  /**
   * Preview pelo slug — o que a pessoa vê antes de pedir para entrar.
   *
   * Exige autenticação (não é `@Public()`) e devolve só metadado do grupo:
   * nome, tipo e quantos membros. **Nunca** a lista de membros — quem está numa
   * academia é informação sobre pessoas, não sobre o grupo.
   */
  async previewBySlug(slug: string): Promise<GroupPreview> {
    const group = await this.prisma.group.findUnique({ where: { slug } });
    if (!group) throw new NotFoundException(NOT_FOUND);

    const memberCount = await this.prisma.groupMembership.count({
      where: { groupId: group.id, status: MembershipStatus.ACTIVE },
    });

    return {
      id: group.id,
      type: group.type,
      name: group.name,
      slug: group.slug,
      memberCount,
    };
  }

  /**
   * Slug a partir do nome, com sufixo aleatório.
   *
   * O sufixo não é enfeite: sem ele "academia central" colide entre cidades
   * diferentes e o segundo dono recebe um erro que não sabe resolver.
   */
  private derivarSlug(name: string): string {
    const base = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    return `${base || 'grupo'}-${randomBytes(4).toString('hex')}`;
  }
}
