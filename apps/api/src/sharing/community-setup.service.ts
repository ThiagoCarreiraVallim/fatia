import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupRole, MembershipStatus, SetupStep, type Prisma } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import {
  communitySlug,
  computeSetup,
  MANUAL_SETUP_STEPS,
  type SetupFacts,
  type SetupState,
} from './community-setup';
import { assertGroupAction } from './permissions';

const NOT_FOUND = 'Group not found';

/** "Primeiros passos" (#412, Pn-21d), agora pelo checklist (#372). */
export interface FirstSteps {
  /** Checklist completo: a demo vira link e o item do menu vira "Primeiros passos". */
  active: boolean;
  activeMembers: number;
  done: number;
  total: number;
}

/** O estado do guia, com o endereço do painel na web ("Ver na web" do app, Onb-C3). */
export interface SetupView extends SetupState {
  webUrl: string;
}

export interface SlugCheck {
  /** O endereço livre: o do nome, ou o do nome com número quando já existe. */
  slug: string;
  /** O endereço do nome já era de outra comunidade. */
  taken: boolean;
}

/** Quantas variações com número tentar antes do sufixo aleatório. */
const SLUG_TRIES = 20;

/**
 * Marca passos do checklist pela ação (salvar a marca, o acesso, as
 * categorias). Sem repetir: o array é um conjunto. Fora de transação de
 * propósito: a marca é aviso de progresso, não pode derrubar o que salvou.
 */
export async function markSetupSteps(
  prisma: PrismaService,
  groupId: string,
  steps: readonly SetupStep[],
): Promise<void> {
  for (const step of new Set(steps)) {
    await prisma.$executeRaw`
      UPDATE "Group" SET "setupSteps" = array_append("setupSteps", ${step}::"SetupStep")
      WHERE "id" = ${groupId} AND NOT (${step}::"SetupStep" = ANY("setupSteps"))`;
  }
}

/**
 * O checklist de primeiros passos do dono (#372, Onb-C3 e Onb-Criador-Web). Só
 * o dono vê e mexe (`group.setup`), e a demo não tem (já vem pronta).
 */
@Injectable()
export class CommunitySetupService {
  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() config?: ConfigService,
  ) {
    this.webOrigin = (config?.get<string>('WEB_ORIGIN') ?? 'http://localhost:3030').replace(
      /\/+$/,
      '',
    );
  }

  async get(userId: string, groupId: string): Promise<SetupView> {
    await this.owner(userId, groupId);
    return this.state(groupId);
  }

  /** Marcar ou desmarcar à mão. O que o dado já mostra continua feito. */
  async setStep(
    userId: string,
    groupId: string,
    step: SetupStep,
    done: boolean,
  ): Promise<SetupView> {
    await this.owner(userId, groupId);
    if (!MANUAL_SETUP_STEPS.includes(step)) throw new NotFoundException('Step not found');
    if (done) {
      await markSetupSteps(this.prisma, groupId, [step]);
    } else {
      await this.prisma.$executeRaw`
        UPDATE "Group" SET "setupSteps" = array_remove("setupSteps", ${step}::"SetupStep")
        WHERE "id" = ${groupId}`;
    }
    return this.state(groupId);
  }

  /** Fechar o guia, ou "Repetir o guia" (volta mesmo completo, até fechar). */
  async setGuide(userId: string, groupId: string, visible: boolean): Promise<SetupView> {
    await this.owner(userId, groupId);
    const now = new Date();
    await this.prisma.group.update({
      where: { id: groupId },
      data: visible
        ? { setupHiddenAt: null, setupRepeatedAt: now }
        : { setupHiddenAt: now, setupRepeatedAt: null },
    });
    return this.state(groupId);
  }

  /**
   * "Primeiros passos" (Pn-21d): a comunidade de verdade da dona. A demo e a
   * comunidade de outra pessoa respondem como inexistentes. A comunidade está
   * ativa quando o checklist está completo (o critério provisório da #412,
   * 5 membros ativos, saiu).
   */
  async firstSteps(ownerId: string, groupId: string): Promise<FirstSteps> {
    const mine = await this.prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: ownerId,
        role: GroupRole.OWNER,
        status: MembershipStatus.ACTIVE,
        group: { isDemo: false },
      },
      select: { id: true },
    });
    if (!mine) throw new NotFoundException(NOT_FOUND);
    const [setup, activeMembers] = await Promise.all([
      this.state(groupId),
      this.prisma.groupMembership.count({
        where: { groupId, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
      }),
    ]);
    return { active: setup.complete, activeMembers, done: setup.done, total: setup.total };
  }

  /**
   * O endereço `fat.ia.br/<slug>` do nome (Onb-C1). O slug é público por
   * natureza (link de convite e página), então dizer que já existe não vaza
   * nada. Quando existe, sugere o primeiro com número que estiver livre.
   */
  async slugCheck(name: string): Promise<SlugCheck> {
    const base = communitySlug(name);
    const candidatos = [base, ...Array.from({ length: SLUG_TRIES }, (_, i) => `${base}-${i + 2}`)];
    const usados = new Set(
      (
        await this.prisma.group.findMany({
          where: { slug: { in: candidatos } },
          select: { slug: true },
        })
      ).map((g) => g.slug),
    );
    const livre =
      candidatos.find((s) => !usados.has(s)) ?? `${base}-${Math.random().toString(36).slice(2, 6)}`;
    return { slug: livre, taken: usados.has(base) };
  }

  private async owner(userId: string, groupId: string): Promise<void> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { group: { select: { isDemo: true } } },
    });
    if (!m || m.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);
    assertGroupAction(m, 'group.setup');
  }

  private async state(groupId: string): Promise<SetupView> {
    const g = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: {
        type: true,
        kind: true,
        brandColor: true,
        coverFileId: true,
        avatarFileId: true,
        requiredSharingScopes: true,
        equipment: true,
        customEquipment: true,
        setupSteps: true,
        setupHiddenAt: true,
        setupRepeatedAt: true,
      },
    });
    const equipe: Prisma.GroupMembershipWhereInput = {
      groupId,
      role: { notIn: [GroupRole.OWNER, GroupRole.MEMBER] },
      status: { in: [MembershipStatus.INVITED, MembershipStatus.ACTIVE] },
    };
    const [teamInvite, teamMember, memberInvite, member, challenge, plan, tip] = await Promise.all([
      this.prisma.groupInvite.findFirst({
        where: { groupId, role: { not: GroupRole.MEMBER } },
        select: { id: true },
      }),
      this.prisma.groupMembership.findFirst({ where: equipe, select: { id: true } }),
      this.prisma.groupInvite.findFirst({
        where: { groupId, role: GroupRole.MEMBER },
        select: { id: true },
      }),
      this.prisma.groupMembership.findFirst({
        where: { groupId, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
        select: { id: true },
      }),
      this.prisma.groupChallenge.findFirst({ where: { groupId }, select: { id: true } }),
      this.prisma.groupPlanTemplate.findFirst({
        where: { groupId, publishedAt: { not: null } },
        select: { id: true },
      }),
      this.prisma.groupTip.findFirst({
        where: { groupId, publishedAt: { not: null } },
        select: { id: true },
      }),
    ]);
    const facts: SetupFacts = {
      type: g.type,
      kind: g.kind,
      brand: Boolean(g.brandColor || g.coverFileId || g.avatarFileId),
      requiredScopes: g.requiredSharingScopes.length > 0,
      team: Boolean(teamInvite || teamMember),
      members: Boolean(memberInvite || member),
      challenge: Boolean(challenge),
      plan: Boolean(plan || tip),
      equipment: g.equipment.length > 0 || g.customEquipment.length > 0,
    };
    return {
      ...computeSetup(facts, g.setupSteps, g.setupHiddenAt, g.setupRepeatedAt),
      webUrl: `${this.webOrigin}/org/${groupId}`,
    };
  }
}
