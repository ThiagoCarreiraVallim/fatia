import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ShareScope, type PlanOfferStatus, type PlanSchedule } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { planEndDate } from '../workout/helpers/planned-schedule';
import { MAX_CHANGE_NOTE } from './dto/plan-send.dto';
import { resolveMemberTarget } from './member-file-target';
import {
  documentToSnapshot,
  parsePlanDocument,
  snapshotToDocument,
  type PlanDocumentView,
} from './plan-document';
import { offerAdjustedNotice } from './plan-offer-notices';
import { PlanOfferService } from './plan-offer.service';
import { parsePlanSnapshot, sessionExercises } from './plan-snapshot-v2';
import { ProfessionalAccessService } from './professional-access.service';

/** Ações da trilha (`ProfessionalAccessLog.action`) da cópia do aluno. */
export const COPY_READ_ACTION = 'open_plan_copy';
export const COPY_EDIT_ACTION = 'edit_plan_copy';

const OFFER_NOT_FOUND = 'Plan offer not found';

export interface PlanCopyView {
  offerId: string;
  membershipId: string;
  studentName: string;
  /** O título da cópia (o da última versão). */
  title: string;
  /** Quem mandou o plano; nulo se apagou a conta. */
  authorName: string | null;
  /** O modelo da biblioteca de onde a cópia saiu ("Ver original"). */
  template: { id: string; title: string } | null;
  /** A versão que o editor abre: a última (a que espera resposta, se houver). */
  version: { id: string; version: number; status: PlanOfferStatus };
  /** Há uma versão nova esperando o aceite da pessoa. */
  pendingUpdate: boolean;
  schedule: PlanSchedule;
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  weekdays: number[];
  document: PlanDocumentView | null;
  /** Sessões feitas da cópia ("6 de 16"). Lido pela porta de Treino. */
  progress: { done: number; planned: number | null };
  /** A última série de cada exercício ("última da Ana: 62,5 kg × 8"). */
  lastSets: Record<number, { weightKg: number | null; reps: number | null }>;
}

export interface SavePlanCopyInput {
  document: unknown;
  title?: string;
  changeNote?: string | null;
  /** "Avisar a Ana no app" (Pn-09e). Padrão: avisa. */
  notify?: boolean;
}

/**
 * Editar a cópia de um aluno (#406, Pn-09e). A cópia é a oferta (#379): o
 * editor abre a última versão, e salvar grava uma versão nova pelo fluxo de
 * versão — a pessoa vê o que mudou no app e aceita; o modelo da biblioteca, a
 * versão em uso até o aceite e tudo o que ela registrou ficam como estão.
 *
 * Exige `member.plans` no papel, a pessoa ativa nesta comunidade e a porta de
 * leitura de Treino de quem edita (vínculo ativo, especialidade e "só quem
 * acompanha"): ler e salvar ficam na trilha da pessoa (`ProfessionalAccessLog`).
 * Sem administração pelo MCP.
 */
@Injectable()
export class PlanCopyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: PlanOfferService,
    private readonly access: ProfessionalAccessService,
    private readonly notifications: NotificationService,
  ) {}

  async get(
    viewerId: string,
    groupId: string,
    membershipId: string,
    offerId: string,
  ): Promise<PlanCopyView> {
    const { offer, subjectId } = await this.resolve(
      viewerId,
      groupId,
      membershipId,
      offerId,
      COPY_READ_ACTION,
    );
    const latest = offer.versions.at(-1)!;
    const accepted = offer.versions.some((v) => v.status === 'ACCEPTED');
    const snap = parsePlanSnapshot(latest.snapshot);
    const planIds = offer.plans.filter((p) => p.userId === subjectId).map((p) => p.id);
    const [done, planned] = planIds.length
      ? await Promise.all([
          this.prisma.workoutSession.count({
            where: { userId: subjectId, planId: { in: planIds }, completedAt: { not: null } },
          }),
          this.prisma.plannedSession.count({
            where: { userId: subjectId, planId: { in: planIds } },
          }),
        ])
      : [0, 0];
    const ids = snap
      ? [
          ...new Set(
            snap.sessions
              .flatMap(sessionExercises)
              .flatMap((e) =>
                e.source === 'custom'
                  ? []
                  : [e.source === 'catalog' ? e.catalogExerciseId : e.groupExerciseId],
              ),
          ),
        ]
      : [];
    const lastSets: PlanCopyView['lastSets'] = {};
    if (ids.length) {
      const sets = await this.prisma.sessionSet.findMany({
        where: {
          exerciseId: { in: ids },
          session: { userId: subjectId, completedAt: { not: null } },
          weightKg: { not: null },
        },
        orderBy: [{ session: { startedAt: 'desc' } }, { setNumber: 'desc' }],
        select: { exerciseId: true, weightKg: true, reps: true },
        take: 500,
      });
      for (const s of sets) {
        if (!(s.exerciseId in lastSets)) {
          lastSets[s.exerciseId] = { weightKg: s.weightKg, reps: s.reps };
        }
      }
    }
    return {
      offerId: offer.id,
      membershipId,
      studentName: offer.user.name,
      title: latest.title,
      authorName: offer.author?.name ?? null,
      template: offer.sourceTemplate
        ? { id: offer.sourceTemplate.id, title: offer.sourceTemplate.title }
        : null,
      version: { id: latest.id, version: latest.version, status: latest.status },
      pendingUpdate: accepted && latest.status === 'PENDING',
      schedule: latest.schedule,
      startDate: latest.startDate,
      endDate:
        latest.schedule === 'CALENDAR' && latest.startDate && latest.weeks
          ? planEndDate(latest.startDate, latest.weeks)
          : latest.endDate,
      weeks: latest.weeks,
      weekdays: latest.weekdays,
      document: snap ? await snapshotToDocument(this.prisma, snap, groupId) : null,
      progress: { done, planned: latest.schedule === 'CALENDAR' ? planned : null },
      lastSets,
    };
  }

  async save(
    viewerId: string,
    groupId: string,
    membershipId: string,
    offerId: string,
    input: SavePlanCopyInput,
  ): Promise<{ offerId: string; versionId: string; version: number }> {
    const doc = parsePlanDocument(input.document);
    const { offer, subjectId, editorName } = await this.resolve(
      viewerId,
      groupId,
      membershipId,
      offerId,
      COPY_EDIT_ACTION,
    );
    if (offer.endedAt) {
      throw new ConflictException('Esse plano já terminou para a pessoa: mande um novo.');
    }
    const latest = offer.versions.at(-1)!;
    const title = (input.title?.trim() || latest.title).slice(0, 100);
    // Na cópia, o exercício da comunidade viaja por valor (#379): a pessoa pode
    // sair da comunidade e o plano continua dela.
    const snapshot = await documentToSnapshot(this.prisma, doc, title, {
      editorId: viewerId,
      groupId,
      groupByValue: true,
    });
    const weekdays = snapshot.sessions.every((s) => s.weekday)
      ? snapshot.sessions.map((s) => s.weekday!).sort((a, b) => a - b)
      : undefined;
    const changeNote = input.changeNote?.trim()
      ? input.changeNote.trim().slice(0, MAX_CHANGE_NOTE)
      : null;
    const r = await this.offers.writeTeamVersion(offer.id, subjectId, viewerId, {
      title,
      snapshot,
      changeNote,
      weekdays,
    });
    if (input.notify !== false) {
      this.notifications.notify(
        [subjectId],
        offerAdjustedNotice({ offerId: offer.id, authorName: editorName, title }),
      );
    }
    return { offerId: r.id, versionId: r.versionId, version: r.version };
  }

  /**
   * A oferta amarrada à pessoa da URL e à comunidade, e a porta de leitura de
   * Treino de quem olha (grava a trilha, inclusive a recusa). Oferta de outra
   * pessoa, de outra comunidade ou apagada responde como inexistente.
   */
  private async resolve(
    viewerId: string,
    groupId: string,
    membershipId: string,
    offerId: string,
    action: string,
  ) {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.plans',
    );
    const offer = await this.prisma.planOffer.findFirst({
      where: { id: offerId, userId: target.subjectUserId, groupId, removedAt: null },
      include: {
        user: { select: { name: true, timezone: true } },
        author: { select: { name: true } },
        sourceTemplate: { select: { id: true, title: true } },
        versions: { orderBy: { version: 'asc' } },
        plans: { select: { id: true, userId: true } },
      },
    });
    if (!offer || offer.versions.length === 0) throw new NotFoundException(OFFER_NOT_FOUND);
    // A porta de leitura: sem vínculo ativo com Treino, 404 (e a tentativa na trilha).
    const subjectId = await this.access.assertReadable(
      viewerId,
      membershipId,
      ShareScope.WORKOUT,
      action,
    );
    const editor = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { name: true },
    });
    return { offer, subjectId, editorName: editor?.name ?? 'A equipe' };
  }
}
