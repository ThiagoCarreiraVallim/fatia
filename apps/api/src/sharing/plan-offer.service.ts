import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  GroupRole,
  MembershipStatus,
  Prisma,
  type PlanOfferStatus,
  type PlanSchedule,
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { assertDay } from '../common/dates';
import { NotificationService } from '../notifications/notification.service';
import { todayInTz } from '../progress/helpers/date-tz';
import { CATALOG_EXERCISE } from '../workout/helpers/exercise-access';
import { isoWeekday, planEndDate, scheduleDates } from '../workout/helpers/planned-schedule';
import { WorkoutPlanService } from '../workout/workout-plan.service';
import type { SendMemberPlanDto } from './dto/member-file.dto';
import { MAX_OFFER_NOTE, MAX_OFFER_WEEKS, type SendPlanOfferDto } from './dto/plan-offer.dto';
import { MAX_CHANGE_NOTE } from './dto/plan-send.dto';
import { TEAM_ROLES } from './permissions';
import { PlanMaterializerService, type OfferSessionPlan } from './plan-materializer.service';
import { diffKeys, diffOfferVersions, type FieldChange, type PlanDiff } from './plan-offer-diff';
import { activeLinksOf, hasActiveLink, isLinked } from './plan-offer-links';
import {
  offerAnsweredNotice,
  offerRemovedNotice,
  offerSentNotice,
  offerUpdatedNotice,
} from './plan-offer-notices';
import { resolveMemberTarget } from './member-file-target';
import { buildPlanSnapshot } from './plan-snapshot';
import {
  parsePlanSnapshot,
  PLAN_SNAPSHOT_V2,
  planSnapshotV2Schema,
  readPlanSnapshot,
  sessionExercises,
  sessionLetter,
  type PlanExerciseItem,
  type PlanSnapshotV2,
} from './plan-snapshot-v2';

/** O lote inteiro numa transação (#405): até 200 pessoas cabem com folga. */
const BATCH_TIMEOUT_MS = 60_000;
/** De quanto em quanto tempo a versão aceita para o futuro assume (I1 do PR #461). */
const SETTLE_EVERY_MS = 60 * 60 * 1000;

/**
 * A oferta que um reenvio do mesmo modelo, pelo mesmo autor, transforma em
 * versão nova (#405). É também o "já tem" da tela: os dois leem daqui, para a
 * marca e o envio nunca discordarem. Recusada conta (vira versão nova, com o
 * recado); apagada ou terminada, não.
 */
export function resendTargetWhere(
  userId: string,
  groupId: string,
  authorId: string,
  templateId: string,
): Prisma.PlanOfferWhereInput {
  return {
    userId,
    groupId,
    authorId,
    sourceTemplateId: templateId,
    removedAt: null,
    endedAt: null,
  };
}

/** Recusa única: oferta ou versão alheia ou inexistente (#92). */
const OFFER_NOT_FOUND = 'Plan offer not found';
const MEMBERSHIP_NOT_FOUND = 'Membership not found';
const OFFER_UNAVAILABLE = 'Esse plano não está mais disponível';
const OFFER_ENDED = 'Esse plano já terminou para a pessoa: mande um novo.';

/**
 * Enfileira quem mexe na ordem dos planos de uma pessoa numa comunidade
 * (#402): enviar (posição nova) e reordenar na ficha. Solta no fim da transação.
 */
async function lockMemberOrder(db: Prisma.TransactionClient, userId: string, groupId: string) {
  const key = `plan-offer-order:${userId}:${groupId}`;
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Trava a linha da pessoa e lê se ela já reordenou no app. O reordenar dela
 * (`WorkoutPlanService.reorder`) grava `plansOrderedAt` antes das posições, na
 * mesma linha: com a trava, a equipe lê o valor já gravado e não sobrescreve.
 */
async function lockSubject(db: Prisma.TransactionClient, userId: string) {
  const rows = await db.$queryRaw<Array<{ plansOrderedAt: Date | null }>>`
    SELECT "plansOrderedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return rows[0] ?? null;
}
const ALREADY_ANSWERED =
  'Essa versão do plano já foi respondida ou substituída. Atualize a tela para ver a atual.';

/** Segundos por série além do descanso: a execução, para o "~40′" da tela. */
const SECONDS_PER_SET = 45;
/** Descanso de quem não prescreveu descanso. */
const DEFAULT_REST_SECONDS = 120;

export interface OfferExerciseView {
  /** `catalog:10`, `custom:Stiff`: a chave do "o que mudou". */
  key: string;
  /** Id do catálogo, para "Como fazer". Nulo no exercício que viaja por valor. */
  exerciseId: number | null;
  name: string;
  muscleGroup: string | null;
  targetSets: number;
  targetReps: string;
  restSeconds: number | null;
  /** Sessão do plano (#406): "A · Legs". Nulo no plano de uma sessão só. */
  session: string | null;
  /** Exercício que a versão nova trouxe ("novo" na lista). */
  isNew: boolean;
  /** O que mudou neste exercício em relação à versão aceita. */
  changes: FieldChange[];
}

export interface OfferVersionView {
  id: string;
  version: number;
  status: PlanOfferStatus;
  title: string;
  schedule: PlanSchedule;
  startDate: string | null;
  /** Último dia do plano de calendário (fim da última semana). */
  endDate: string | null;
  weeks: number | null;
  weekdays: number[];
  note: string | null;
  /** "O que mudou" (#405), escrito por quem reenviou. */
  changeNote: string | null;
  sentAt: Date;
  respondedAt: Date | null;
  summary: { exercises: number; sets: number; minutes: number };
  exercises: OfferExerciseView[];
  /** Exercícios da versão aceita que a nova tirou. */
  removed: Array<{ key: string; name: string }>;
}

export interface PlanOfferView {
  id: string;
  /** Nulo quando o autor apagou a conta. */
  author: { name: string } | null;
  group: { id: string; name: string } | null;
  /** `new`: primeira oferta. `update`: versão nova de um plano já aceito. */
  kind: 'new' | 'update';
  /** A versão que a tela mostra: a que espera resposta, a recusada, ou a em uso. */
  shown: OfferVersionView;
  /** A versão em uso, quando há. */
  accepted: { id: string; version: number; planId: string | null } | null;
  diff: PlanDiff | null;
  /** O plano que o aceite criou na conta da pessoa (o da primeira sessão). */
  planId: string | null;
  /** Os planos de todas as sessões (#406), na ordem. */
  planIds: string[];
}

export interface PlanOfferSummary {
  id: string;
  versionId: string;
  title: string;
  version: number;
  kind: 'new' | 'update';
  status: PlanOfferStatus;
  schedule: PlanSchedule;
  authorName: string | null;
  groupName: string | null;
  sentAt: Date;
  planId: string | null;
  href: string;
}

export interface PlanOfferList {
  /** Esperando resposta: o aviso do Treino e o "Para fazer" do Hoje. */
  pending: PlanOfferSummary[];
  /** Com uma versão em uso. */
  accepted: PlanOfferSummary[];
}

const OFFER_INCLUDE = {
  author: { select: { name: true } },
  group: { select: { id: true, name: true } },
  versions: { orderBy: { version: 'asc' } },
  plans: { select: { id: true, userId: true, sessionIndex: true } },
} satisfies Prisma.PlanOfferInclude;

type OfferRow = Prisma.PlanOfferGetPayload<{ include: typeof OFFER_INCLUDE }>;
type VersionRow = OfferRow['versions'][number];

/** O retrato gravado (v1 ou v2, sempre lido como v2), ou nulo se não valida. */
const parseSnapshot = (snapshot: Prisma.JsonValue): PlanSnapshotV2 | null =>
  parsePlanSnapshot(snapshot);

/** As versões da oferta, na leitura: a última, a aceita e a que a tela mostra. */
/** A versão já começou (ou não tem dia de começar): pode estar em uso hoje. */
function startedBy(v: { schedule: PlanSchedule; startDate: string | null }, today: string) {
  return v.schedule !== 'CALENDAR' || !v.startDate || v.startDate <= today;
}

function versionsOf(offer: OfferRow) {
  const latest = offer.versions.at(-1)!;
  // A de maior número: uma falha antiga pode ter deixado outra aceita para trás.
  const accepted = offer.versions.filter((v) => v.status === 'ACCEPTED').at(-1) ?? null;
  // A última fala por si quando espera resposta ou foi recusada; aceita ou
  // substituída, a tela mostra a que está em uso.
  const shown =
    latest.status === 'PENDING' || latest.status === 'DECLINED' ? latest : (accepted ?? latest);
  const kind: 'new' | 'update' = accepted && shown.id !== accepted.id ? 'update' : 'new';
  return { latest, accepted, shown, kind };
}

/**
 * Plano de treino que a equipe manda para o aluno (#379, ADR 014).
 *
 * A oferta é do aluno: ele lê, aceita, recusa e desfaz. O aceite passa pelo
 * `PlanMaterializerService`, a única máquina de cópia entre contas, e cria o
 * plano sob o `userId` dele. A versão nova não muda nada sem o aceite: o plano
 * só troca de exercícios quando a pessoa aceita a troca.
 *
 * Do lado da equipe, `send` e `update` são a porta mínima (o editor é a #406):
 * o autor sai do contexto autenticado e o aluno da associação, e só há oferta
 * com `ProfessionalLink` ativo entre os dois naquela comunidade. Recusar não
 * mexe no vínculo nem no consentimento.
 */
@Injectable()
export class PlanOfferService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlanOfferService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: PlanMaterializerService,
    private readonly notifications: NotificationService,
    private readonly plans: WorkoutPlanService,
  ) {}

  onModuleInit(): void {
    // `unref`: o timer não segura o processo (nem o jest) só por existir.
    this.timer = setInterval(() => {
      void this.settleScheduledVersions().catch((err: unknown) =>
        this.logger.warn(
          `Versões agendadas não assumiram: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, SETTLE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------------- equipe

  async send(
    authorId: string,
    membershipId: string,
    input: SendPlanOfferDto,
  ): Promise<{ id: string; versionId: string; version: number }> {
    const ctx = await this.assertCanSend(authorId, membershipId);
    const content = await this.versionContent(authorId, input);
    const offer = await this.prisma.planOffer.create({
      data: {
        userId: ctx.studentId,
        authorId,
        groupId: ctx.groupId,
        versions: { create: { version: 1, ...content } },
      },
      include: { versions: true },
    });
    this.notifications.notify(
      [ctx.studentId],
      offerSentNotice({ offerId: offer.id, authorName: ctx.authorName, title: content.title }),
    );
    return { id: offer.id, versionId: offer.versions[0]!.id, version: 1 };
  }

  /**
   * Versão nova de uma oferta (#379). A versão anterior que ainda esperava
   * resposta vira substituída; a aceita continua em uso até a pessoa aceitar a
   * troca. A oferta precisa ser do aluno da associação e do mesmo autor.
   */
  async update(
    authorId: string,
    membershipId: string,
    offerId: string,
    input: SendPlanOfferDto,
  ): Promise<{ id: string; versionId: string; version: number }> {
    const ctx = await this.assertCanSend(authorId, membershipId);
    // Apagada pela ficha (#402) é como se não existisse; terminada não recebe versão nova.
    const offer = await this.prisma.planOffer.findFirst({
      where: {
        id: offerId,
        userId: ctx.studentId,
        groupId: ctx.groupId,
        authorId,
        removedAt: null,
      },
      select: { id: true, endedAt: true },
    });
    if (!offer) throw new NotFoundException(OFFER_NOT_FOUND);
    if (offer.endedAt) throw new ConflictException(OFFER_ENDED);
    const content = await this.versionContent(authorId, input);

    const created = await this.inTransaction(async (db) => {
      await this.lockOffer(db, offerId);
      // Relida com a trava: "Terminar hoje" ou "Apagar" podem ter chegado no meio.
      const still = await db.planOffer.findFirst({
        where: { id: offerId, removedAt: null, endedAt: null },
        select: { id: true },
      });
      if (!still) throw new ConflictException(OFFER_ENDED);
      const last = await db.planOfferVersion.findFirst({
        where: { offerId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      await db.planOfferVersion.updateMany({
        where: { offerId, status: 'PENDING' },
        data: { status: 'SUPERSEDED', respondedAt: new Date() },
      });
      return db.planOfferVersion.create({
        data: { offerId, version: (last?.version ?? 0) + 1, ...content },
      });
    });
    this.notifications.notify(
      [ctx.studentId],
      offerUpdatedNotice({ offerId, authorName: ctx.authorName, title: content.title }),
    );
    return { id: offerId, versionId: created.id, version: created.version };
  }

  /**
   * A versão nova que a edição da cópia de um aluno grava (#406, Pn-09e). Quem
   * chama já conferiu o papel, a associação e a porta de leitura de Treino de
   * quem edita. Segue o fluxo de versão: a versão que esperava resposta fica
   * substituída e a aceita continua em uso até a pessoa aceitar a nova; nada
   * do que ela registrou muda. `editorId` fica na versão (quem editou).
   */
  async writeTeamVersion(
    offerId: string,
    studentUserId: string,
    editorId: string,
    content: {
      title: string;
      snapshot: PlanSnapshotV2;
      changeNote: string | null;
      weekdays?: number[];
    },
  ): Promise<{ id: string; versionId: string; version: number }> {
    const created = await this.inTransaction(async (db) => {
      await this.lockOffer(db, offerId);
      // Relida com a trava: "Terminar hoje" ou "Apagar" podem ter chegado no meio.
      const offer = await db.planOffer.findFirst({
        where: { id: offerId, userId: studentUserId, removedAt: null },
        select: { endedAt: true },
      });
      if (!offer) throw new NotFoundException(OFFER_NOT_FOUND);
      if (offer.endedAt) throw new ConflictException(OFFER_ENDED);
      const last = await db.planOfferVersion.findFirst({
        where: { offerId },
        orderBy: { version: 'desc' },
      });
      if (!last) throw new NotFoundException(OFFER_NOT_FOUND);
      await db.planOfferVersion.updateMany({
        where: { offerId, status: 'PENDING' },
        data: { status: 'SUPERSEDED', respondedAt: new Date() },
      });
      return db.planOfferVersion.create({
        data: {
          offerId,
          version: last.version + 1,
          title: content.title,
          snapshot: content.snapshot as unknown as Prisma.InputJsonValue,
          snapshotVersion: PLAN_SNAPSHOT_V2,
          // A agenda segue a da última versão; no modo Agenda, os dias são os
          // das sessões (quando todas têm dia).
          schedule: last.schedule,
          startDate: last.startDate,
          weeks: last.weeks,
          weekdays:
            last.schedule === 'CALENDAR' && content.weekdays?.length
              ? content.weekdays
              : last.weekdays,
          endDate: last.endDate,
          note: last.note,
          changeNote: content.changeNote,
          authorId: editorId,
        },
      });
    });
    return { id: offerId, versionId: created.id, version: created.version };
  }

  // ------------------------------------------------- equipe, pela ficha (#402)

  /**
   * Um plano para UMA pessoa, pela ficha (#402, Pn-05q): um modelo da
   * biblioteca DESTA comunidade ou um plano da conta de quem envia. Precisa de
   * `member.plans` no papel e do vínculo ativo com a pessoa (o mesmo do #379).
   * A oferta entra no fim da ordem da ficha.
   */
  async sendToMember(
    authorId: string,
    groupId: string,
    membershipId: string,
    input: SendMemberPlanDto,
  ): Promise<{ id: string; versionId: string; version: number }> {
    if (Boolean(input.templateId) === Boolean(input.planId)) {
      throw new BadRequestException('Escolha um plano da biblioteca ou um plano seu, um só.');
    }
    await resolveMemberTarget(this.prisma, authorId, groupId, membershipId, 'member.plans');
    const ctx = await this.assertCanSend(authorId, membershipId);
    const source = input.templateId
      ? await this.templateSource(groupId, input.templateId)
      : await this.planSource(authorId, input.planId!);
    const content = this.scheduleContent(source, input);
    // A posição é "a última + 1": dois envios ao mesmo tempo leriam a mesma
    // última. A trava por pessoa e comunidade enfileira os dois.
    const offer = await this.inTransaction(async (db) => {
      await lockMemberOrder(db, ctx.studentId, groupId);
      const last = await db.planOffer.aggregate({
        where: { userId: ctx.studentId, groupId, removedAt: null },
        _max: { position: true },
      });
      return db.planOffer.create({
        data: {
          userId: ctx.studentId,
          authorId,
          groupId,
          position: (last._max.position ?? -1) + 1,
          sourceTemplateId: input.templateId ?? null,
          versions: { create: { version: 1, ...content } },
        },
        include: { versions: true },
      });
    });
    this.notifications.notify(
      [ctx.studentId],
      offerSentNotice({ offerId: offer.id, authorName: ctx.authorName, title: content.title }),
    );
    return { id: offer.id, versionId: offer.versions[0]!.id, version: 1 };
  }

  /**
   * "Apagar da Ana" e "Terminar hoje" (Pn-05s). É do autor ou do dono.
   *
   * - Terminar: as sessões da agenda de amanhã em diante saem, a versão que
   *   esperava aceite fica substituída, e a cópia segue com a pessoa.
   * - Apagar: a cópia sai da conta dela (o treino que ela registrou fica, sem o
   *   plano) e a oferta some do app e da ficha. A linha fica para o export.
   */
  async removeForMember(
    viewerId: string,
    groupId: string,
    membershipId: string,
    offerId: string,
    opts: { notify: boolean; endToday: boolean },
  ): Promise<{ offerId: string; result: 'removed' | 'ended' }> {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.plans',
    );
    const offer = await this.prisma.planOffer.findFirst({
      where: { id: offerId, userId: target.subjectUserId, groupId, removedAt: null },
      select: {
        id: true,
        authorId: true,
        versions: { orderBy: { version: 'desc' }, take: 1, select: { title: true } },
        user: { select: { timezone: true } },
      },
    });
    if (!offer) throw new NotFoundException(OFFER_NOT_FOUND);
    if (offer.authorId !== viewerId && target.viewerRole !== GroupRole.OWNER) {
      throw new ForbiddenException('Só quem mandou o plano, ou o dono, tira o plano da pessoa');
    }
    const now = new Date();
    const supersede = this.prisma.planOfferVersion.updateMany({
      where: { offerId, status: 'PENDING' },
      data: { status: 'SUPERSEDED', respondedAt: now },
    });
    const title = offer.versions[0]?.title ?? 'o plano';

    if (opts.endToday) {
      const today = todayInTz(offer.user.timezone);
      await this.prisma.$transaction([
        supersede,
        this.prisma.plannedSession.deleteMany({
          where: {
            userId: target.subjectUserId,
            plan: { fromOfferId: offerId },
            date: { gt: today },
          },
        }),
        this.prisma.planOffer.update({ where: { id: offerId }, data: { endedAt: now } }),
      ]);
    } else {
      await this.prisma.$transaction([
        supersede,
        // O `userId` no filtro: a cópia é da pessoa da URL, nunca de outra.
        this.prisma.workoutPlan.deleteMany({
          where: { userId: target.subjectUserId, fromOfferId: offerId },
        }),
        this.prisma.planOffer.update({ where: { id: offerId }, data: { removedAt: now } }),
      ]);
    }
    if (opts.notify) {
      const author = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { name: true },
      });
      this.notifications.notify(
        [target.subjectUserId],
        offerRemovedNotice({
          authorName: author?.name ?? 'A equipe',
          title,
          ended: opts.endToday,
        }),
      );
    }
    return { offerId, result: opts.endToday ? 'ended' : 'removed' };
  }

  /**
   * A ordem dos planos na ficha (#402). A equipe define a ordem inicial: ela
   * vai para as cópias já aceitas enquanto a pessoa não reordenou no app.
   * Depois disso a lista do app é dela, e aqui só muda a ordem das ofertas.
   */
  async reorderForMember(
    viewerId: string,
    groupId: string,
    membershipId: string,
    offerIds: string[],
  ): Promise<{ offerIds: string[] }> {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.plans',
    );
    const subjectId = target.subjectUserId;
    await this.inTransaction(async (db) => {
      await lockMemberOrder(db, subjectId, groupId);
      const current = await db.planOffer.findMany({
        where: { userId: subjectId, groupId, removedAt: null },
        select: { id: true },
      });
      const ids = new Set(current.map((o) => o.id));
      // Id de outra pessoa (ou já apagado) responde como inexistente.
      if (offerIds.some((id) => !ids.has(id))) throw new NotFoundException(OFFER_NOT_FOUND);
      // A lista é a ordem inteira: faltar um deixaria duas posições iguais.
      if (new Set(offerIds).size !== offerIds.length || offerIds.length !== ids.size) {
        throw new BadRequestException(
          'Mande todos os planos da pessoa, cada um uma vez, na ordem nova.',
        );
      }
      for (const [position, id] of offerIds.entries()) {
        await db.planOffer.update({ where: { id }, data: { position } });
      }
      // A ordem da pessoa nunca é sobrescrita: a linha dela fica travada e a
      // cópia só muda enquanto `plansOrderedAt` está vazio, lido aqui dentro.
      const subject = await lockSubject(db, subjectId);
      if (subject?.plansOrderedAt) return;
      for (const [position, id] of offerIds.entries()) {
        await db.workoutPlan.updateMany({
          where: { userId: subjectId, fromOfferId: id, user: { plansOrderedAt: null } },
          data: { position },
        });
      }
    });
    return { offerIds };
  }

  /**
   * Um modelo da biblioteca para várias pessoas, pelo envio em lote (#405).
   * Quem chama já conferiu o papel, a associação desta comunidade e o vínculo
   * ativo com quem envia, e já validou as datas.
   *
   * O lote é uma transação só (revisão do PR #461): ou todo mundo recebe, ou
   * ninguém. As travas por pessoa saem em ordem de `userId`, então dois lotes
   * ao mesmo tempo nunca se esperam em círculo. Os avisos vão depois do commit.
   *
   * Se quem envia já mandou este modelo à pessoa (`resendTargetWhere`: o mesmo
   * critério do "já tem"), sai uma versão nova da mesma oferta, com "o que
   * mudou": a versão que esperava resposta fica substituída e a aceita continua
   * em uso até o novo aceite. Senão, nasce uma oferta no fim da ordem da ficha.
   */
  async sendTemplateBatch(
    author: { id: string; name: string },
    groupId: string,
    templateId: string,
    source: { title: string; snapshot: PlanSnapshotV2 },
    items: Array<{
      userId: string;
      input: Pick<SendMemberPlanDto, 'schedule' | 'startDate' | 'weeks' | 'weekdays' | 'note'> & {
        endDate?: string | null;
        changeNote?: string | null;
      };
    }>,
  ): Promise<Array<{ id: string; versionId: string; version: number; kind: 'new' | 'update' }>> {
    const contents = items.map((i) => this.scheduleContent(source, i.input));
    const results = await this.inTransaction(
      async (db) => {
        for (const userId of [...new Set(items.map((i) => i.userId))].sort()) {
          await lockMemberOrder(db, userId, groupId);
        }
        const out: Array<{
          id: string;
          versionId: string;
          version: number;
          kind: 'new' | 'update';
        }> = [];
        for (const [i, item] of items.entries()) {
          out.push(
            await this.writeTemplateVersion(
              db,
              author.id,
              groupId,
              item.userId,
              templateId,
              contents[i]!,
            ),
          );
        }
        return out;
      },
      { timeout: BATCH_TIMEOUT_MS },
    );
    results.forEach((r, i) => {
      const notice = r.kind === 'update' ? offerUpdatedNotice : offerSentNotice;
      this.notifications.notify(
        [items[i]!.userId],
        notice({ offerId: r.id, authorName: author.name, title: contents[i]!.title }),
      );
    });
    return results;
  }

  private async writeTemplateVersion(
    db: Prisma.TransactionClient,
    authorId: string,
    groupId: string,
    studentUserId: string,
    templateId: string,
    content: ReturnType<PlanOfferService['scheduleContent']>,
  ): Promise<{ id: string; versionId: string; version: number; kind: 'new' | 'update' }> {
    const existing = await db.planOffer.findFirst({
      where: resendTargetWhere(studentUserId, groupId, authorId, templateId),
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      await this.lockOffer(db, existing.id);
      const last = await db.planOfferVersion.findFirst({
        where: { offerId: existing.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      await db.planOfferVersion.updateMany({
        where: { offerId: existing.id, status: 'PENDING' },
        data: { status: 'SUPERSEDED', respondedAt: new Date() },
      });
      const v = await db.planOfferVersion.create({
        data: { offerId: existing.id, version: (last?.version ?? 0) + 1, ...content },
      });
      return { id: existing.id, versionId: v.id, version: v.version, kind: 'update' };
    }
    const last = await db.planOffer.aggregate({
      where: { userId: studentUserId, groupId, removedAt: null },
      _max: { position: true },
    });
    // Na primeira versão não há o que mudou.
    const offer = await db.planOffer.create({
      data: {
        userId: studentUserId,
        authorId,
        groupId,
        position: (last._max.position ?? -1) + 1,
        sourceTemplateId: templateId,
        versions: { create: { version: 1, ...content, changeNote: null } },
      },
      include: { versions: true },
    });
    return { id: offer.id, versionId: offer.versions[0]!.id, version: 1, kind: 'new' };
  }

  /**
   * Cancela um envio que ainda espera resposta (#405, "Enviados
   * recentemente"). Com a oferta travada, confere de novo que nenhuma versão
   * foi aceita: o aceite e o cancelamento nunca se cruzam. A oferta some do
   * app da pessoa; a linha fica, para o export dela.
   */
  async revokePending(offerId: string): Promise<void> {
    await this.inTransaction(async (db) => {
      await this.lockOffer(db, offerId);
      const aceita = await db.planOfferVersion.count({
        where: { offerId, status: 'ACCEPTED' },
      });
      if (aceita > 0) {
        throw new ConflictException(
          'A pessoa já aceitou este plano. Para tirar, use a ficha dela em Planos.',
        );
      }
      const now = new Date();
      await db.planOfferVersion.updateMany({
        where: { offerId, status: 'PENDING' },
        data: { status: 'SUPERSEDED', respondedAt: now },
      });
      await db.planOffer.update({ where: { id: offerId }, data: { removedAt: now } });
    });
  }

  /**
   * O retrato de um modelo de treino da biblioteca desta comunidade. O
   * rascunho (#405) ainda não se envia.
   */
  async templateSource(groupId: string, templateId: string) {
    const tpl = await this.prisma.groupPlanTemplate.findFirst({
      where: { id: templateId, groupId },
      select: { kind: true, title: true, snapshot: true, draft: true },
    });
    if (!tpl) throw new NotFoundException('Template not found');
    if (tpl.draft) throw new ConflictException('Termine o rascunho antes de enviar.');
    if (tpl.kind !== 'WORKOUT') {
      throw new BadRequestException(
        'Plano alimentar para uma pessoa chega com o editor de dieta. Por ora, só treino.',
      );
    }
    const snap = parseSnapshot(tpl.snapshot);
    if (!snap) throw new BadRequestException('Este modelo não pode ser enviado.');
    return { title: tpl.title, snapshot: await this.groupItemsByValue(snap, groupId) };
  }

  private async planSource(authorId: string, planId: string) {
    // `findById` com o `userId` de quem envia: plano de outra pessoa é 404.
    const plan = await this.plans.findById(authorId, planId);
    const lido = readPlanSnapshot(buildPlanSnapshot(plan));
    if (!lido.ok) throw new BadRequestException('Este plano não pode ser enviado.');
    return { title: plan.name, snapshot: lido.snapshot };
  }

  /**
   * Numa oferta o exercício da comunidade viaja por valor (#379): a pessoa
   * pode sair da comunidade e o plano continua dela. O modelo da biblioteca
   * guarda o exercício da comunidade por referência, então ele vira custom aqui.
   */
  async groupItemsByValue(snap: PlanSnapshotV2, groupId: string): Promise<PlanSnapshotV2> {
    const ids = snap.sessions
      .flatMap(sessionExercises)
      .flatMap((e) => (e.source === 'group' ? [e.groupExerciseId] : []));
    if (ids.length === 0) return snap;
    const rows = await this.prisma.exercise.findMany({
      where: { id: { in: ids }, groupOwned: true, groupId },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const byValue = (item: PlanExerciseItem): PlanExerciseItem => {
      if (item.source !== 'group') return item;
      const ex = byId.get(item.groupExerciseId);
      if (!ex) throw new BadRequestException('Um exercício deste modelo não existe mais.');
      const { source: _source, groupExerciseId: _id, ...base } = item;
      void _source;
      void _id;
      const definition = Object.fromEntries(
        Object.entries({
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          equipment: ex.equipment,
          level: ex.level,
          mechanic: ex.mechanic,
          primaryMuscles: ex.primaryMuscles,
          secondaryMuscles: ex.secondaryMuscles,
          instructions: ex.instructions,
          youtubeVideoId: ex.youtubeVideoId,
          youtubeVideoIdPt: ex.youtubeVideoIdPt,
        }).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)),
      );
      return { ...base, source: 'custom' as const, exercise: definition } as PlanExerciseItem;
    };
    const sessions = snap.sessions.map((s) => ({
      ...s,
      items: s.items.map((i) =>
        i.type === 'circuit' ? { ...i, exercises: i.exercises.map(byValue) } : byValue(i),
      ),
    }));
    const parsed = planSnapshotV2Schema.safeParse({ ...snap, version: PLAN_SNAPSHOT_V2, sessions });
    if (!parsed.success) throw new BadRequestException('Este modelo não pode ser enviado.');
    return parsed.data;
  }

  // ---------------------------------------------------------------- aluno

  async list(userId: string): Promise<PlanOfferList> {
    const [offers, links] = await Promise.all([
      this.prisma.planOffer.findMany({
        // A oferta que a equipe apagou (#402) some do app; a linha fica no export.
        where: { userId, removedAt: null },
        include: OFFER_INCLUDE,
        orderBy: { updatedAt: 'desc' },
      }),
      activeLinksOf(this.prisma, userId),
    ]);
    const pending: PlanOfferSummary[] = [];
    const accepted: PlanOfferSummary[] = [];
    for (const offer of offers) {
      if (offer.versions.length === 0) continue;
      const v = versionsOf(offer);
      const summary = (version: VersionRow): PlanOfferSummary => ({
        id: offer.id,
        versionId: version.id,
        title: version.title,
        version: version.version,
        kind: v.kind,
        status: version.status,
        schedule: version.schedule,
        authorName: offer.author?.name ?? null,
        groupName: offer.group?.name ?? null,
        sentAt: version.sentAt,
        planId: this.planOf(offer, userId),
        href: `/workout/offers/${offer.id}`,
      });
      // Sem vínculo ativo com quem enviou, a pendente não se responde mais.
      if (v.latest.status === 'PENDING' && isLinked(offer, links)) pending.push(summary(v.latest));
      if (v.accepted) accepted.push(summary(v.accepted));
    }
    pending.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return { pending, accepted };
  }

  async get(userId: string, offerId: string): Promise<PlanOfferView> {
    return this.view(await this.findOffer(userId, offerId), userId);
  }

  /**
   * Aceita a versão que a pessoa viu. A primeira cria o plano; a de uma
   * atualização troca os exercícios do mesmo plano. Com datas, refaz a agenda
   * de hoje em diante.
   *
   * Só a última versão pode ser aceita, esperando resposta ou recusada (o
   * "Desfazer" seguido do aceite, ou o aceite direto pelo MCP). A versão é
   * reservada antes da cópia: o segundo toque para no 409, sem plano a mais.
   */
  async accept(
    userId: string,
    offerId: string,
    versionId: string,
    timezone: string,
  ): Promise<PlanOfferView> {
    const offer = await this.findOffer(userId, offerId);
    const version = this.versionOf(offer, versionId);
    const { latest } = versionsOf(offer);
    if (version.id !== latest.id) throw new ConflictException(ALREADY_ANSWERED);
    if (version.status !== 'PENDING' && version.status !== 'DECLINED') {
      throw new ConflictException(ALREADY_ANSWERED);
    }

    const now = new Date();
    await this.claim(offer, version, ['PENDING', 'DECLINED'], {
      status: 'ACCEPTED',
      respondedAt: now,
    });

    const today = todayInTz(timezone);
    const existing = this.plansOf(offer, userId);
    const inUse = offer.versions
      .filter((v) => v.status === 'ACCEPTED' && v.id !== version.id && startedBy(v, today))
      .at(-1);
    if (existing.length && inUse && version.schedule === 'CALENDAR' && version.startDate! > today) {
      // Versão que começa no futuro (revisão do PR #461): a que está em uso
      // segue, com os exercícios e a agenda dela, até a véspera; daí em diante
      // a agenda já é a nova, e `settleScheduledVersions` troca os exercícios
      // e substitui a antiga quando o dia chega.
      try {
        await this.prisma.$transaction([
          this.prisma.planOfferVersion.updateMany({
            where: { offerId, status: 'ACCEPTED', id: { notIn: [version.id, inUse.id] } },
            data: { status: 'SUPERSEDED', respondedAt: now },
          }),
          ...this.agendaWrites(
            userId,
            existing.map((p) => p.id),
            this.sessionPlansFor(existing, version),
            version,
            version.startDate!,
          ),
        ]);
      } catch (error) {
        await this.prisma.planOfferVersion.update({
          where: { id: version.id },
          data: { status: version.status, respondedAt: version.respondedAt },
        });
        throw error;
      }
      await this.notifyTeam(offer, userId, version.title, 'accepted');
      return this.view(await this.findOffer(userId, offerId), userId);
    }

    // Plano, troca de versão e agenda vão numa transação de lote só: ou entra
    // tudo, ou a versão volta ao que era e a pessoa pode tentar de novo. Nunca
    // ficam duas versões aceitas.
    try {
      const { plans, writes } = await this.materializer.offerPlanWrites(
        userId,
        version.snapshot,
        offerId,
        existing,
        today,
      );
      await this.prisma.$transaction([
        ...writes,
        this.prisma.planOfferVersion.updateMany({
          where: { offerId, status: 'ACCEPTED', id: { not: version.id } },
          data: { status: 'SUPERSEDED', respondedAt: now },
        }),
        ...this.agendaWrites(
          userId,
          [...existing.map((p) => p.id), ...plans.map((p) => p.id)],
          plans,
          version,
          today,
        ),
        ...this.positionWrites(
          userId,
          plans.map((p) => p.id),
          offer.position,
        ),
      ]);
    } catch (error) {
      await this.prisma.planOfferVersion.update({
        where: { id: version.id },
        data: { status: version.status, respondedAt: version.respondedAt },
      });
      throw error;
    }

    await this.notifyTeam(offer, userId, version.title, 'accepted');
    return this.view(await this.findOffer(userId, offerId), userId);
  }

  /**
   * A versão aceita para o futuro assume no dia dela (I1 do PR #461): troca os
   * exercícios do plano da pessoa e substitui a que estava em uso. A agenda já
   * foi gravada no aceite. Roda de hora em hora; devolve quantas assumiram.
   */
  async settleScheduledVersions(): Promise<number> {
    const duplas = await this.prisma.planOfferVersion.groupBy({
      by: ['offerId'],
      where: { status: 'ACCEPTED' },
      having: { offerId: { _count: { gt: 1 } } },
    });
    if (duplas.length === 0) return 0;
    const ofertas = await this.prisma.planOffer.findMany({
      where: { id: { in: duplas.map((d) => d.offerId) }, removedAt: null },
      include: { ...OFFER_INCLUDE, user: { select: { timezone: true } } },
    });
    let assumiram = 0;
    for (const offer of ofertas) {
      const nova = offer.versions.filter((v) => v.status === 'ACCEPTED').at(-1)!;
      const hoje = todayInTz(offer.user.timezone);
      if (!startedBy(nova, hoje)) continue;
      const existing = this.plansOf(offer, offer.userId);
      const { plans, writes } = await this.materializer.offerPlanWrites(
        offer.userId,
        nova.snapshot,
        offer.id,
        existing,
        hoje,
      );
      // A agenda da versão já foi gravada no aceite, com os planos de então.
      // Se a versão trouxe ou tirou sessão, os planos mudaram: a agenda de
      // hoje em diante é refeita com os planos certos.
      const antes = new Set(existing.map((e) => e.id));
      const mudou = plans.length !== antes.size || plans.some((p) => !antes.has(p.id));
      if (mudou) {
        writes.push(
          ...this.agendaWrites(
            offer.userId,
            [...existing.map((e) => e.id), ...plans.map((p) => p.id)],
            plans,
            nova,
            hoje,
          ),
        );
      }
      await this.prisma.$transaction([
        ...writes,
        this.prisma.planOfferVersion.updateMany({
          where: { offerId: offer.id, status: 'ACCEPTED', id: { not: nova.id } },
          data: { status: 'SUPERSEDED', respondedAt: new Date() },
        }),
      ]);
      assumiram += 1;
    }
    return assumiram;
  }

  /** Recusa a versão. Numa atualização, é "manter a versão atual". */
  async decline(userId: string, offerId: string, versionId: string): Promise<PlanOfferView> {
    const offer = await this.findOffer(userId, offerId);
    const version = this.versionOf(offer, versionId);
    const { latest, accepted } = versionsOf(offer);
    if (version.id !== latest.id || version.status !== 'PENDING') {
      throw new ConflictException(ALREADY_ANSWERED);
    }
    await this.claim(offer, version, ['PENDING'], {
      status: 'DECLINED',
      respondedAt: new Date(),
    });
    await this.notifyTeam(offer, userId, version.title, accepted ? 'kept' : 'declined');
    return this.view(await this.findOffer(userId, offerId), userId);
  }

  /** "Desfazer" a recusa: a versão volta a esperar, se ainda for a última. */
  async undoDecline(userId: string, offerId: string, versionId: string): Promise<PlanOfferView> {
    const offer = await this.findOffer(userId, offerId);
    const version = this.versionOf(offer, versionId);
    const { latest } = versionsOf(offer);
    if (version.id !== latest.id || version.status !== 'DECLINED') {
      throw new ConflictException(ALREADY_ANSWERED);
    }
    await this.claim(offer, version, ['DECLINED'], { status: 'PENDING', respondedAt: null });
    return this.view(await this.findOffer(userId, offerId), userId);
  }

  // ---------------------------------------------------------------- internos

  /**
   * Trava a oferta (`FOR UPDATE`) até o fim da transação. `update` pega a mesma
   * trava antes de criar a versão nova, então a resposta da pessoa e a versão
   * nova da equipe nunca se cruzam.
   */
  private async lockOffer(db: Prisma.TransactionClient, offerId: string) {
    await db.$queryRaw`SELECT id FROM "PlanOffer" WHERE id = ${offerId} FOR UPDATE`;
  }

  /**
   * Reserva a resposta da pessoa. Sem vínculo ativo entre quem enviou e a
   * pessoa, a oferta não está mais disponível (409). A leitura que a tela usou
   * pode estar velha:
   * com a oferta travada, relê a última versão e só escreve se ela ainda for a
   * respondida, no estado esperado. Senão, 409.
   */
  private async claim(
    offer: OfferRow,
    version: VersionRow,
    from: PlanOfferStatus[],
    data: { status: PlanOfferStatus; respondedAt: Date | null },
  ) {
    await this.inTransaction(async (db) => {
      await this.lockOffer(db, offer.id);
      if (!(await hasActiveLink(db, offer))) throw new ConflictException(OFFER_UNAVAILABLE);
      const latest = await db.planOfferVersion.findFirst({
        where: { offerId: offer.id },
        orderBy: { version: 'desc' },
        select: { id: true, status: true },
      });
      if (latest?.id !== version.id || !from.includes(latest.status)) {
        throw new ConflictException(ALREADY_ANSWERED);
      }
      await db.planOfferVersion.update({ where: { id: version.id }, data });
    });
  }

  /**
   * Quem envia é da equipe ativa da comunidade da associação; o aluno é membro
   * ativo dela e tem `ProfessionalLink` ativo com quem envia. Qualquer falta
   * responde igual a associação inexistente.
   */
  private async assertCanSend(authorId: string, membershipId: string) {
    const student = await this.prisma.groupMembership.findUnique({
      where: { id: membershipId },
      select: { userId: true, groupId: true, role: true, status: true },
    });
    const author = student
      ? await this.prisma.groupMembership.findUnique({
          where: { groupId_userId: { groupId: student.groupId, userId: authorId } },
          select: { role: true, status: true, user: { select: { name: true } } },
        })
      : null;
    const link =
      student && author
        ? await this.prisma.professionalLink.findFirst({
            where: {
              subjectUserId: student.userId,
              professionalId: authorId,
              groupId: student.groupId,
              revokedAt: null,
            },
            select: { id: true },
          })
        : null;
    if (
      !student ||
      student.status !== MembershipStatus.ACTIVE ||
      student.role !== GroupRole.MEMBER ||
      !author ||
      author.status !== MembershipStatus.ACTIVE ||
      !TEAM_ROLES.includes(author.role) ||
      !link
    ) {
      throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    }
    return { studentId: student.userId, groupId: student.groupId, authorName: author.user.name };
  }

  /** O retrato do plano do autor e a agenda pedida, validados. */
  private async versionContent(authorId: string, input: SendPlanOfferDto) {
    // Sem `groupId` no retrato: numa oferta, o exercício da comunidade viaja por valor.
    return this.scheduleContent(await this.planSource(authorId, input.planId), input);
  }

  /** A agenda pedida, validada, sobre o retrato já pronto. */
  private scheduleContent(
    source: { title: string; snapshot: PlanSnapshotV2 },
    input: Pick<SendPlanOfferDto, 'schedule' | 'startDate' | 'weeks' | 'weekdays' | 'note'> & {
      endDate?: string | null;
      changeNote?: string | null;
    },
  ) {
    const snapshot = source.snapshot;
    const note = input.note?.trim() ? input.note.trim().slice(0, MAX_OFFER_NOTE) : null;
    const changeNote = input.changeNote?.trim()
      ? input.changeNote.trim().slice(0, MAX_CHANGE_NOTE)
      : null;

    if (input.schedule === 'FLEXIBLE') {
      return {
        title: source.title,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        snapshotVersion: PLAN_SNAPSHOT_V2,
        schedule: 'FLEXIBLE' as const,
        startDate: null,
        weeks: null,
        weekdays: [],
        // Plano flexível (#405) pode ter um último dia; sem ele, "sem fim".
        endDate: input.endDate ? assertDay(input.endDate, 'endDate') : null,
        note,
        changeNote,
      };
    }
    if (!input.startDate || !input.weeks || !input.weekdays?.length) {
      throw new BadRequestException(
        'Plano de calendário precisa do primeiro dia, de quantas semanas e dos dias da semana.',
      );
    }
    const startDate = assertDay(input.startDate, 'startDate');
    const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
    if (
      !Number.isInteger(input.weeks) ||
      input.weeks < 1 ||
      input.weeks > MAX_OFFER_WEEKS ||
      weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
    ) {
      throw new BadRequestException(
        `Semanas de 1 a ${MAX_OFFER_WEEKS}; dias da semana de 1 (segunda) a 7 (domingo).`,
      );
    }
    return {
      title: source.title,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      snapshotVersion: PLAN_SNAPSHOT_V2,
      schedule: 'CALENDAR' as const,
      startDate,
      weeks: input.weeks,
      weekdays,
      endDate: null,
      note,
      changeNote,
    };
  }

  private async findOffer(userId: string, offerId: string): Promise<OfferRow> {
    const offer = await this.prisma.planOffer.findFirst({
      where: { id: offerId, userId, removedAt: null },
      include: OFFER_INCLUDE,
    });
    if (!offer || offer.versions.length === 0) throw new NotFoundException(OFFER_NOT_FOUND);
    return offer;
  }

  /** A versão do corpo precisa ser desta oferta: id de outra responde como inexistente. */
  private versionOf(offer: OfferRow, versionId: string): VersionRow {
    const version = offer.versions.find((v) => v.id === versionId);
    if (!version) throw new NotFoundException(OFFER_NOT_FOUND);
    return version;
  }

  /**
   * Os planos que a oferta criou na conta da pessoa (o `userId` confere de
   * novo), um por sessão (#406), na ordem das sessões.
   */
  private plansOf(
    offer: OfferRow,
    userId: string,
  ): Array<{ id: string; sessionIndex: number | null }> {
    return offer.plans
      .filter((p) => p.userId === userId)
      .sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0))
      .map((p) => ({ id: p.id, sessionIndex: p.sessionIndex }));
  }

  /** O plano da primeira sessão: o "plano da oferta" de antes da #406. */
  private planOf(offer: OfferRow, userId: string): string | null {
    return this.plansOf(offer, userId)[0]?.id ?? null;
  }

  /**
   * Os planos de cada sessão para a agenda de uma versão que ainda não trocou
   * os exercícios (aceite para o futuro): as sessões já existentes, com o dia
   * da semana que a versão nova dá a cada uma.
   */
  private sessionPlansFor(
    existing: Array<{ id: string; sessionIndex: number | null }>,
    version: VersionRow,
  ): OfferSessionPlan[] {
    const snap = parseSnapshot(version.snapshot);
    const count = snap?.sessions.length ?? 1;
    // Só as sessões que a versão nova ainda tem (D2 da revisão do PR #462): o
    // plano de uma sessão que saiu não recebe dia da agenda nova.
    return existing
      .filter((p) => (p.sessionIndex ?? 0) < count)
      .map((p) => ({
        id: p.id,
        sessionIndex: p.sessionIndex ?? 0,
        weekday: snap?.sessions[p.sessionIndex ?? 0]?.weekday ?? null,
      }));
  }

  /**
   * A agenda dos planos depois do aceite (decisão do dono, #379): de hoje em
   * diante sai a de antes e entra a desta versão; o que passou fica. Plano
   * flexível não tem linhas, só a próxima sessão calculada na leitura.
   *
   * Com sessões (#406), cada dia cai no plano da sessão daquele dia da semana
   * (modo Agenda); sem dia marcado, as sessões se revezam na ordem (A, B, C…).
   */
  private agendaWrites(
    userId: string,
    clearPlanIds: string[],
    plans: OfferSessionPlan[],
    version: VersionRow,
    from: string,
  ) {
    const clear = this.prisma.plannedSession.deleteMany({
      where: { userId, planId: { in: [...new Set(clearPlanIds)] }, date: { gte: from } },
    });
    if (
      version.schedule !== 'CALENDAR' ||
      !version.startDate ||
      !version.weeks ||
      plans.length === 0
    ) {
      return [clear];
    }
    const ordered = [...plans].sort((a, b) => a.sessionIndex - b.sessionIndex);
    const byWeekday = new Map(
      ordered.flatMap((p) => (p.weekday !== null ? [[p.weekday, p.id] as const] : [])),
    );
    const rows = scheduleDates({
      startDate: version.startDate,
      weeks: version.weeks,
      weekdays: version.weekdays,
    })
      .map((date, i) => ({
        date,
        order: i + 1,
        planId: byWeekday.get(isoWeekday(date)) ?? ordered[i % ordered.length]!.id,
      }))
      .filter((row) => row.date >= from)
      .map((row) => ({ ...row, userId, offerVersionId: version.id }));
    return [clear, this.prisma.plannedSession.createMany({ data: rows })];
  }

  /**
   * A ordem que a equipe deu na ficha vai para a cópia (#402), enquanto a
   * pessoa não reordenou os planos no app. Depois a ordem é dela. As sessões
   * da mesma oferta ficam juntas, na ordem delas.
   */
  private positionWrites(userId: string, planIds: string[], position: number | null) {
    if (position === null || planIds.length === 0) return [];
    // Condicionado na própria escrita: se a pessoa reordenou no meio do aceite,
    // a ordem dela fica (o `plansOrderedAt` é lido junto com a escrita).
    return [
      this.prisma.workoutPlan.updateMany({
        where: { id: { in: planIds }, userId, user: { plansOrderedAt: null } },
        data: { position },
      }),
    ];
  }

  /** O aviso à equipe. `notify` não espera a entrega; o nome do aluno é uma leitura só. */
  private async notifyTeam(
    offer: OfferRow,
    userId: string,
    title: string,
    answer: 'accepted' | 'declined' | 'kept',
  ) {
    if (!offer.authorId || !offer.groupId) return;
    // Quem perdeu o vínculo no meio do caminho não fica sabendo da resposta.
    if (!(await hasActiveLink(this.prisma, offer))) return;
    const student = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!student) return;
    this.notifications.notify(
      [offer.authorId],
      offerAnsweredNotice({ groupId: offer.groupId, studentName: student.name, title, answer }),
    );
  }

  private async view(offer: OfferRow, userId: string): Promise<PlanOfferView> {
    const { shown, accepted, kind } = versionsOf(offer);
    const shownSnap = parseSnapshot(shown.snapshot);
    const acceptedSnap = kind === 'update' && accepted ? parseSnapshot(accepted.snapshot) : null;
    const diff =
      shownSnap && acceptedSnap && accepted
        ? diffOfferVersions(
            { ...accepted, snapshot: acceptedSnap },
            { ...shown, snapshot: shownSnap },
          )
        : null;
    const names = await this.namesOf([shownSnap, acceptedSnap]);
    const planId = this.planOf(offer, userId);
    const planIds = this.plansOf(offer, userId).map((p) => p.id);
    return {
      id: offer.id,
      author: offer.author ? { name: offer.author.name } : null,
      group: offer.group ? { id: offer.group.id, name: offer.group.name } : null,
      kind,
      shown: this.versionView(shown, shownSnap, acceptedSnap, diff, names),
      accepted: accepted ? { id: accepted.id, version: accepted.version, planId } : null,
      diff,
      planId,
      planIds,
    };
  }

  private versionView(
    row: VersionRow,
    snap: PlanSnapshotV2 | null,
    previous: PlanSnapshotV2 | null,
    diff: PlanDiff | null,
    names: Map<number, { name: string; muscleGroup: string }>,
  ): OfferVersionView {
    const keyed = snap ? diffKeys(snap, previous) : [];
    const items = keyed.map((k) => k.item);
    const added = new Set(diff?.added ?? []);
    const changed = new Map((diff?.changed ?? []).map((c) => [c.key, c.fields]));
    const multi = (snap?.sessions.length ?? 0) > 1;
    const sessionLabel = (index: number) => {
      if (!multi || !snap) return null;
      const name = snap.sessions[index]?.name.trim();
      return name ? `${sessionLetter(index)} · ${name}` : `Sessão ${sessionLetter(index)}`;
    };
    const describe = (item: PlanExerciseItem) => {
      if (item.source === 'custom') {
        return {
          exerciseId: null,
          name: item.exercise.name,
          muscleGroup: item.exercise.muscleGroup,
        };
      }
      const id = item.source === 'catalog' ? item.catalogExerciseId : item.groupExerciseId;
      const found = names.get(id);
      return {
        exerciseId: item.source === 'catalog' ? id : null,
        name: found?.name ?? 'Exercício',
        muscleGroup: found?.muscleGroup ?? null,
      };
    };
    const sets = items.reduce((n, e) => n + e.targetSets, 0);
    const seconds = items.reduce(
      (n, e) => n + e.targetSets * (SECONDS_PER_SET + (e.restSeconds ?? DEFAULT_REST_SECONDS)),
      0,
    );
    const removedKeys = new Set(diff?.removed ?? []);
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      title: row.title,
      schedule: row.schedule,
      startDate: row.startDate,
      endDate:
        row.schedule === 'CALENDAR' && row.startDate && row.weeks
          ? planEndDate(row.startDate, row.weeks)
          : row.endDate,
      weeks: row.weeks,
      weekdays: row.weekdays,
      note: row.note,
      changeNote: row.changeNote,
      sentAt: row.sentAt,
      respondedAt: row.respondedAt,
      summary: {
        exercises: items.length,
        sets,
        minutes: items.length ? Math.max(5, Math.round(seconds / 300) * 5) : 0,
      },
      exercises: keyed.map(({ key, item, sessionIndex }) => ({
        key,
        ...describe(item),
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        restSeconds: item.restSeconds ?? null,
        session: sessionLabel(sessionIndex),
        isNew: added.has(key),
        changes: changed.get(key) ?? [],
      })),
      removed: (previous ? diffKeys(previous, snap) : [])
        .filter(({ key }) => removedKeys.has(key))
        .map(({ key, item }) => ({ key, name: describe(item).name })),
    };
  }

  /** Nome e grupo dos exercícios por id: catálogo público, ou da comunidade. */
  private async namesOf(snaps: Array<PlanSnapshotV2 | null>) {
    const catalog = new Set<number>();
    for (const snap of snaps)
      for (const item of snap?.sessions.flatMap(sessionExercises) ?? [])
        if (item.source === 'catalog') catalog.add(item.catalogExerciseId);
    if (catalog.size === 0) return new Map<number, { name: string; muscleGroup: string }>();
    const rows = await this.prisma.exercise.findMany({
      where: { id: { in: [...catalog] }, ...CATALOG_EXERCISE },
      select: { id: true, name: true, muscleGroup: true },
    });
    return new Map(rows.map((r) => [r.id, { name: r.name, muscleGroup: r.muscleGroup }]));
  }

  private async inTransaction<T>(
    fn: (db: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout: number },
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, options);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A oferta mudou ao mesmo tempo em outro lugar. Tente de novo.');
      }
      throw error;
    }
  }
}
