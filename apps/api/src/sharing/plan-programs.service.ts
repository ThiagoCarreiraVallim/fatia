import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, ShareScope } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { addDaysIso, dateInTz } from '../progress/helpers/date-tz';
import { blockTemplate, MAX_BLOCK_WEEKS, MIN_BLOCK_WEEKS } from '../workout/helpers/block-template';
import { can } from './permissions';
import { offerState } from './plan-offer-state';
import { ProfessionalAccessService } from './professional-access.service';
import { accompaniedOnly } from './team-reach';

/** Status de um plano na lista (Pn-30). `SENT` = enviado, sem Treino liberado para quem olha. */
export type PlanProgramStatus = 'SENT' | 'SCHEDULED' | 'ACTIVE' | 'ENDING' | 'ENDED';

export interface PlanProgramItem {
  offerId: string;
  membershipId: string;
  name: string;
  title: string;
  authorName: string | null;
  schedule: 'CALENDAR' | 'FLEXIBLE';
  startDate: string | null;
  endDate: string | null;
  status: PlanProgramStatus;
  /** Dias até começar, no agendado. */
  startsInDays: number | null;
  /** A pessoa libera Treino para quem olha: só então há progresso. */
  sharesWorkout: boolean;
  progress: {
    /** Treinos feitos do plano. */
    done: number;
    /** Sessões da agenda (calendário); nulo no flexível. */
    planned: number | null;
    percent: number | null;
    weekNumber: number | null;
    weeks: number | null;
  } | null;
  /** Fases do bloco (3 a 6 semanas de calendário), com a semana de agora. */
  phases: { week: number; focus: string; startDate: string; endDate: string; current: boolean }[];
  /** Etiquetas do modelo de onde o plano saiu (nível). */
  tags: string[];
}

export interface PlanProgramsView {
  counts: { all: number; active: number; ending: number; scheduled: number; ended: number };
  items: PlanProgramItem[];
}

/** "Terminando": a última semana do plano de calendário. */
const ENDING_DAYS = 6;
/** Terminados ficam na lista por este tempo; depois, só na ficha. */
const ENDED_VISIBLE_DAYS = 60;
const ACTION = 'list_plan_programs';

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'iniciante',
  intermediate: 'intermediário',
  advanced: 'avançado',
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Programas (#403, Pn-30): os planos com começo e fim que a comunidade mandou,
 * por aluno. Só lê o que a #379/#402 gravam (`PlanOffer`).
 *
 * A lista é da equipe que atende (`member.file`: dono e profissional), com o
 * recorte "profissionais veem só quem acompanham". O plano é da equipe, mas o
 * progresso (treinos feitos) é dado de Treino: só sai pela porta de leitura,
 * com a categoria liberada para QUEM OLHA, e cada leitura entra na trilha da
 * pessoa. Sem isso o plano aparece só como "enviado" — nem o status, que
 * diria se ela aceitou e está treinando.
 */
@Injectable()
export class PlanProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProfessionalAccessService,
  ) {}

  async list(viewerId: string, groupId: string, now: Date = new Date()): Promise<PlanProgramsView> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: viewerId } },
      select: { role: true, status: true, group: { select: { timezone: true } } },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Comunidade não encontrada.');
    }
    if (!can(eu.role, 'member.file')) throw new ForbiddenException('Sem acesso aos programas.');
    const today = dateInTz(now, eu.group.timezone);
    const meus = await accompaniedOnly(this.prisma, viewerId, groupId);

    const membros = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        status: MembershipStatus.ACTIVE,
        ...(meus ? { id: { in: [...meus] } } : {}),
      },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });
    const porUsuario = new Map(membros.map((m) => [m.userId, m]));
    const offers = await this.prisma.planOffer.findMany({
      where: { groupId, removedAt: null, userId: { in: [...porUsuario.keys()] } },
      select: {
        id: true,
        userId: true,
        endedAt: true,
        author: { select: { name: true } },
        sourceTemplate: { select: { level: true } },
        versions: { orderBy: { version: 'asc' } },
        plans: { select: { id: true, userId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Treino liberado para quem olha, uma leitura por pessoa (na trilha dela).
    const links = await this.prisma.professionalLink.findMany({
      where: {
        groupId,
        professionalId: viewerId,
        revokedAt: null,
        scopes: { has: ShareScope.WORKOUT },
        subjectUserId: { in: [...new Set(offers.map((o) => o.userId))] },
      },
      select: { subjectUserId: true },
    });
    const lerTreino = new Map<string, boolean>();
    for (const userId of new Set(links.map((l) => l.subjectUserId))) {
      const m = porUsuario.get(userId)!;
      lerTreino.set(userId, await this.canReadWorkout(viewerId, m.id));
    }

    const items: PlanProgramItem[] = [];
    const limiteTerminado = addDaysIso(today, -ENDED_VISIBLE_DAYS);
    for (const o of offers) {
      const st = offerState(o.versions, o.endedAt, today);
      if (!st || st.status === 'DECLINED') continue;
      const m = porUsuario.get(o.userId)!;
      const treino = lerTreino.get(o.userId) === true;
      const { shown, endDate } = st;
      if (st.status === 'ENDED' && endDate && endDate < limiteTerminado) continue;

      let status: PlanProgramStatus = 'SENT';
      let progress: PlanProgramItem['progress'] = null;
      if (treino && st.status !== 'PENDING') {
        status =
          st.status === 'ENDED' ? 'ENDED' : st.status === 'SCHEDULED' ? 'SCHEDULED' : 'ACTIVE';
        if (status === 'ACTIVE' && endDate && daysBetween(today, endDate) <= ENDING_DAYS) {
          status = 'ENDING';
        }
        const copia = o.plans.find((p) => p.userId === o.userId)?.id ?? null;
        if (copia) {
          progress = await offerProgress(this.prisma, o.userId, copia, shown, st.weekNumber);
        }
      }
      items.push({
        offerId: o.id,
        membershipId: m.id,
        name: m.user.name,
        title: shown.title,
        authorName: o.author?.name ?? null,
        schedule: shown.schedule,
        startDate: shown.schedule === 'CALENDAR' ? shown.startDate : null,
        endDate,
        status,
        startsInDays:
          status === 'SCHEDULED' && shown.startDate ? daysBetween(today, shown.startDate) : null,
        sharesWorkout: treino,
        progress,
        phases: phasesOf(shown, today),
        tags: o.sourceTemplate?.level
          ? [LEVEL_LABEL[o.sourceTemplate.level] ?? o.sourceTemplate.level]
          : [],
      });
    }
    const conta = (s: PlanProgramStatus) => items.filter((i) => i.status === s).length;
    return {
      counts: {
        all: items.length,
        active: conta('ACTIVE'),
        ending: conta('ENDING'),
        scheduled: conta('SCHEDULED'),
        ended: conta('ENDED'),
      },
      items,
    };
  }

  private async canReadWorkout(viewerId: string, membershipId: string): Promise<boolean> {
    try {
      await this.access.assertReadable(viewerId, membershipId, ShareScope.WORKOUT, ACTION);
      return true;
    } catch (err) {
      if (err instanceof NotFoundException) return false;
      throw err;
    }
  }
}

/**
 * Treinos feitos do plano que a equipe mandou (#403, #405). Lê dado de Treino
 * da pessoa: só se chama depois de `assertReadable` com Treino liberado para
 * quem olha (a leitura fica na trilha dela).
 */
export async function offerProgress(
  prisma: PrismaService,
  userId: string,
  planId: string,
  shown: { schedule: 'CALENDAR' | 'FLEXIBLE'; weeks: number | null },
  weekNumber: number | null,
): Promise<NonNullable<PlanProgramItem['progress']>> {
  const [done, planned] = await Promise.all([
    prisma.workoutSession.count({ where: { userId, planId, completedAt: { not: null } } }),
    shown.schedule === 'CALENDAR'
      ? prisma.plannedSession.count({ where: { userId, planId } })
      : Promise.resolve(null),
  ]);
  return {
    done,
    planned,
    percent: planned ? Math.min(100, Math.round((done / planned) * 100)) : null,
    weekNumber,
    weeks: shown.weeks,
  };
}

/** As semanas do bloco, com o foco de cada uma (ADR 019, #379). */
function phasesOf(
  shown: { schedule: 'CALENDAR' | 'FLEXIBLE'; startDate: string | null; weeks: number | null },
  today: string,
): PlanProgramItem['phases'] {
  if (shown.schedule !== 'CALENDAR' || !shown.startDate || !shown.weeks) return [];
  if (shown.weeks < MIN_BLOCK_WEEKS || shown.weeks > MAX_BLOCK_WEEKS) return [];
  const inicio = shown.startDate;
  return blockTemplate(shown.weeks).map((w) => {
    const startDate = addDaysIso(inicio, (w.weekNumber - 1) * 7);
    const endDate = addDaysIso(startDate, 6);
    return {
      week: w.weekNumber,
      focus: w.focus,
      startDate,
      endDate,
      current: startDate <= today && today <= endDate,
    };
  });
}
