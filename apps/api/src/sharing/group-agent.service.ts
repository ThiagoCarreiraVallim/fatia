import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, type GroupAgent, type MediaFile } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { MediaService, type MediaView } from '../storage/media.service';
import { requireContentRole } from './content-roles';

/** Limites do agente da comunidade, iguais no `apps/agent` (`ChatPersona`). */
export const AGENT_NAME_MIN = 2;
export const AGENT_NAME_MAX = 40;
export const AGENT_INSTRUCTIONS_MAX = 2000;
/**
 * O nome entra numa frase do prompt, fora da cerca: sem caractere de controle
 * (quebra de linha abriria um parágrafo novo de "instrução") e sem `<` ou `>`,
 * que formam os delimitadores da cerca.
 */
export const AGENT_NAME_PATTERN = /^[^\p{Cc}<>]+$/u;

export interface GroupAgentView {
  /** Falso enquanto o dono nunca salvou: a tela mostra o formulário vazio. */
  configured: boolean;
  name: string;
  instructions: string;
  enabled: boolean;
  avatar: MediaView | null;
  updatedAt: Date | null;
}

export interface GroupAgentInput {
  name: string;
  instructions: string;
  enabled: boolean;
  /** `undefined` mantém o avatar; `null` tira. */
  avatarFileId?: string | null;
}

/** Um agente que a pessoa pode escolher no chat. */
export interface ChatAgentOption {
  groupId: string;
  name: string;
  communityName: string;
  avatarUrl: string | null;
}

/** O que vai ao `apps/agent` num turno: quem o assistente é nesta conversa. */
export interface ChatPersona {
  groupId: string;
  name: string;
  community: string;
  instructions: string;
}

type AgentRow = GroupAgent & { avatarFile: MediaFile | null };

/**
 * O agente da comunidade (Fase 7c, ADR 031): nome, avatar e orientações por
 * cima do mesmo assistente. O dono configura (`group.update`); o membro ativo
 * escolhe no chat. As orientações nunca mudam o que as tools enxergam: elas
 * seguem com o login de quem conversa.
 */
@Injectable()
export class GroupAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  // ---------------------------------------------------------------- dono

  async get(userId: string, groupId: string): Promise<GroupAgentView> {
    await requireContentRole(
      this.prisma,
      userId,
      groupId,
      'group.update',
      'Só o dono configura o agente',
    );
    const agente = await this.prisma.groupAgent.findUnique({
      where: { groupId },
      include: { avatarFile: true },
    });
    return this.view(agente);
  }

  async put(userId: string, groupId: string, input: GroupAgentInput): Promise<GroupAgentView> {
    await requireContentRole(
      this.prisma,
      userId,
      groupId,
      'group.update',
      'Só o dono configura o agente',
    );
    const atual = await this.prisma.groupAgent.findUnique({
      where: { groupId },
      select: { avatarFileId: true },
    });
    const anterior = atual?.avatarFileId ?? null;
    let avatarFileId = anterior;
    if (input.avatarFileId !== undefined && input.avatarFileId !== anterior) {
      // O arquivo tem de ser desta comunidade e enviado como avatar do agente:
      // um `fileId` de outra comunidade, ou a capa de um plano, é 404.
      avatarFileId = input.avatarFileId
        ? (await this.media.resolveForGroup(groupId, input.avatarFileId, 'agent_avatar')).id
        : null;
    }
    const dados = {
      name: input.name.trim(),
      instructions: input.instructions.trim(),
      enabled: input.enabled,
      avatarFileId,
    };
    const salvo = await this.prisma.groupAgent.upsert({
      where: { groupId },
      create: { groupId, ...dados },
      update: dados,
      include: { avatarFile: true },
    });
    if (anterior && anterior !== avatarFileId) await this.media.discardById(anterior);
    return this.view(salvo);
  }

  // ---------------------------------------------------------------- chat

  /**
   * Os agentes que esta pessoa pode escolher: das comunidades em que ela está
   * ativa e cujo dono ligou o agente. O padrão é o da comunidade que paga o
   * assento dela, quando ele está na lista; senão, o assistente da Fatia.
   */
  async listForChat(
    userId: string,
    seatGroupId: string | null,
  ): Promise<{ defaultGroupId: string | null; agents: ChatAgentOption[] }> {
    const linhas = await this.prisma.groupAgent.findMany({
      where: {
        enabled: true,
        group: { memberships: { some: { userId, status: MembershipStatus.ACTIVE } } },
      },
      include: { avatarFile: true, group: { select: { name: true, avatarFile: true } } },
      orderBy: { group: { name: 'asc' } },
    });
    const agents = await Promise.all(
      linhas.map(async (a) => ({
        groupId: a.groupId,
        name: a.name,
        communityName: a.group.name,
        avatarUrl: await this.avatarUrl(a),
      })),
    );
    const padrao = agents.some((a) => a.groupId === seatGroupId) ? seatGroupId : null;
    return { defaultGroupId: padrao, agents };
  }

  /** Confere a escolha de uma conversa nova: fora das opções é 404, como comunidade alheia. */
  async assertSelectable(userId: string, groupId: string): Promise<void> {
    if (!(await this.personaFor(userId, groupId))) {
      throw new NotFoundException('Agente não encontrado');
    }
  }

  /**
   * A persona de um turno, conferida **a cada turno**: quem saiu da comunidade,
   * ou cujo dono desligou o agente, volta a conversar com o assistente da
   * Fatia na mesma conversa.
   */
  async personaFor(userId: string, groupId: string | null): Promise<ChatPersona | null> {
    if (!groupId) return null;
    const a = await this.prisma.groupAgent.findFirst({
      where: {
        groupId,
        enabled: true,
        group: { memberships: { some: { userId, status: MembershipStatus.ACTIVE } } },
      },
      include: { group: { select: { name: true } } },
    });
    if (!a) return null;
    return {
      groupId: a.groupId,
      name: a.name,
      community: a.group.name,
      instructions: a.instructions,
    };
  }

  /** Nome e avatar do agente de uma conversa, para o cabeçalho do chat. */
  async headerFor(
    userId: string,
    groupId: string | null,
  ): Promise<{ groupId: string; name: string; avatarUrl: string | null } | null> {
    if (!groupId) return null;
    const a = await this.prisma.groupAgent.findFirst({
      where: {
        groupId,
        enabled: true,
        group: { memberships: { some: { userId, status: MembershipStatus.ACTIVE } } },
      },
      include: { avatarFile: true, group: { select: { avatarFile: true } } },
    });
    if (!a) return null;
    return { groupId: a.groupId, name: a.name, avatarUrl: await this.avatarUrl(a) };
  }

  /** O avatar do agente; sem um, o da comunidade. */
  private async avatarUrl(a: {
    avatarFile: MediaFile | null;
    group: { avatarFile: MediaFile | null };
  }): Promise<string | null> {
    return (await this.media.viewOrNull(a.avatarFile ?? a.group.avatarFile))?.url ?? null;
  }

  private async view(a: AgentRow | null): Promise<GroupAgentView> {
    if (!a) {
      return {
        configured: false,
        name: '',
        instructions: '',
        enabled: false,
        avatar: null,
        updatedAt: null,
      };
    }
    return {
      configured: true,
      name: a.name,
      instructions: a.instructions,
      enabled: a.enabled,
      avatar: await this.media.viewOrNull(a.avatarFile),
      updatedAt: a.updatedAt,
    };
  }
}
