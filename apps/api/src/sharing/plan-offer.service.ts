import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import { planEndDate, scheduleDates } from '../workout/helpers/planned-schedule';
import { WorkoutPlanService } from '../workout/workout-plan.service';
import { MAX_OFFER_NOTE, MAX_OFFER_WEEKS, type SendPlanOfferDto } from './dto/plan-offer.dto';
import { TEAM_ROLES } from './permissions';
import { PlanMaterializerService } from './plan-materializer.service';
import { diffOfferVersions, exerciseKey, type FieldChange, type PlanDiff } from './plan-offer-diff';
import { activeLinksOf, hasActiveLink, isLinked } from './plan-offer-links';
import { offerAnsweredNotice, offerSentNotice, offerUpdatedNotice } from './plan-offer-notices';
import {
  buildPlanSnapshot,
  PLAN_SNAPSHOT_VERSION,
  planSnapshotSchema,
  type PlanSnapshot,
} from './plan-snapshot';

/** Recusa única: oferta ou versão alheia ou inexistente (#92). */
const OFFER_NOT_FOUND = 'Plan offer not found';
const MEMBERSHIP_NOT_FOUND = 'Membership not found';
const OFFER_UNAVAILABLE = 'Esse plano não está mais disponível';
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
  /** O plano que o aceite criou na conta da pessoa. */
  planId: string | null;
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
  plans: { select: { id: true, userId: true } },
} satisfies Prisma.PlanOfferInclude;

type OfferRow = Prisma.PlanOfferGetPayload<{ include: typeof OFFER_INCLUDE }>;
type VersionRow = OfferRow['versions'][number];

/** O retrato gravado, ou nulo se não valida (versão de uma era futura do produto). */
function parseSnapshot(snapshot: Prisma.JsonValue): PlanSnapshot | null {
  const parsed = planSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

/** As versões da oferta, na leitura: a última, a aceita e a que a tela mostra. */
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
export class PlanOfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: PlanMaterializerService,
    private readonly notifications: NotificationService,
    private readonly plans: WorkoutPlanService,
  ) {}

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
    const offer = await this.prisma.planOffer.findFirst({
      where: { id: offerId, userId: ctx.studentId, groupId: ctx.groupId, authorId },
      select: { id: true },
    });
    if (!offer) throw new NotFoundException(OFFER_NOT_FOUND);
    const content = await this.versionContent(authorId, input);

    const created = await this.inTransaction(async (db) => {
      await this.lockOffer(db, offerId);
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

  // ---------------------------------------------------------------- aluno

  async list(userId: string): Promise<PlanOfferList> {
    const [offers, links] = await Promise.all([
      this.prisma.planOffer.findMany({
        where: { userId },
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

    // Plano, troca de versão e agenda vão numa transação de lote só: ou entra
    // tudo, ou a versão volta ao que era e a pessoa pode tentar de novo. Nunca
    // ficam duas versões aceitas.
    try {
      const { planId, writes } = await this.materializer.offerPlanWrites(
        userId,
        version.snapshot,
        offerId,
        this.planOf(offer, userId),
      );
      await this.prisma.$transaction([
        ...writes,
        this.prisma.planOfferVersion.updateMany({
          where: { offerId, status: 'ACCEPTED', id: { not: version.id } },
          data: { status: 'SUPERSEDED', respondedAt: now },
        }),
        ...this.agendaWrites(userId, planId, version, todayInTz(timezone)),
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
    // `findById` com o `userId` de quem envia: plano de outra pessoa é 404.
    const plan = await this.plans.findById(authorId, input.planId);
    // Sem `groupId`: numa oferta, o exercício da comunidade viaja por valor.
    const snapshot = buildPlanSnapshot(plan);
    const note = input.note?.trim() ? input.note.trim().slice(0, MAX_OFFER_NOTE) : null;

    if (input.schedule === 'FLEXIBLE') {
      return {
        title: plan.name,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        snapshotVersion: PLAN_SNAPSHOT_VERSION,
        schedule: 'FLEXIBLE' as const,
        startDate: null,
        weeks: null,
        weekdays: [],
        note,
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
      title: plan.name,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      snapshotVersion: PLAN_SNAPSHOT_VERSION,
      schedule: 'CALENDAR' as const,
      startDate,
      weeks: input.weeks,
      weekdays,
      note,
    };
  }

  private async findOffer(userId: string, offerId: string): Promise<OfferRow> {
    const offer = await this.prisma.planOffer.findFirst({
      where: { id: offerId, userId },
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

  /** O plano que a oferta criou na conta da pessoa (o `userId` confere de novo). */
  private planOf(offer: OfferRow, userId: string): string | null {
    return offer.plans.find((p) => p.userId === userId)?.id ?? null;
  }

  /**
   * A agenda do plano depois do aceite (decisão do dono, #379): de hoje em
   * diante sai a de antes e entra a desta versão; o que passou fica. Plano
   * flexível não tem linhas, só a próxima sessão calculada na leitura.
   */
  private agendaWrites(userId: string, planId: string, version: VersionRow, today: string) {
    const clear = this.prisma.plannedSession.deleteMany({
      where: { userId, planId, date: { gte: today } },
    });
    if (version.schedule !== 'CALENDAR' || !version.startDate || !version.weeks) return [clear];
    const rows = scheduleDates({
      startDate: version.startDate,
      weeks: version.weeks,
      weekdays: version.weekdays,
    })
      .map((date, i) => ({ date, order: i + 1 }))
      .filter((row) => row.date >= today)
      .map((row) => ({ ...row, userId, planId, offerVersionId: version.id }));
    return [clear, this.prisma.plannedSession.createMany({ data: rows })];
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
    return {
      id: offer.id,
      author: offer.author ? { name: offer.author.name } : null,
      group: offer.group ? { id: offer.group.id, name: offer.group.name } : null,
      kind,
      shown: this.versionView(shown, shownSnap, acceptedSnap, diff, names),
      accepted: accepted ? { id: accepted.id, version: accepted.version, planId } : null,
      diff,
      planId,
    };
  }

  private versionView(
    row: VersionRow,
    snap: PlanSnapshot | null,
    previous: PlanSnapshot | null,
    diff: PlanDiff | null,
    names: Map<number, { name: string; muscleGroup: string }>,
  ): OfferVersionView {
    const items = snap ? [...snap.exercises].sort((a, b) => a.order - b.order) : [];
    const added = new Set(diff?.added ?? []);
    const changed = new Map((diff?.changed ?? []).map((c) => [c.key, c.fields]));
    const describe = (item: PlanSnapshot['exercises'][number]) => {
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
      endDate: row.startDate && row.weeks ? planEndDate(row.startDate, row.weeks) : null,
      weeks: row.weeks,
      weekdays: row.weekdays,
      note: row.note,
      sentAt: row.sentAt,
      respondedAt: row.respondedAt,
      summary: {
        exercises: items.length,
        sets,
        minutes: items.length ? Math.max(5, Math.round(seconds / 300) * 5) : 0,
      },
      exercises: items.map((item) => {
        const key = exerciseKey(item);
        return {
          key,
          ...describe(item),
          targetSets: item.targetSets,
          targetReps: item.targetReps,
          restSeconds: item.restSeconds ?? null,
          isNew: added.has(key),
          changes: changed.get(key) ?? [],
        };
      }),
      removed: (previous?.exercises ?? [])
        .filter((item) => removedKeys.has(exerciseKey(item)))
        .sort((a, b) => a.order - b.order)
        .map((item) => ({ key: exerciseKey(item), name: describe(item).name })),
    };
  }

  /** Nome e grupo dos exercícios por id: catálogo público, ou da comunidade. */
  private async namesOf(snaps: Array<PlanSnapshot | null>) {
    const catalog = new Set<number>();
    for (const snap of snaps)
      for (const item of snap?.exercises ?? [])
        if (item.source === 'catalog') catalog.add(item.catalogExerciseId);
    if (catalog.size === 0) return new Map<number, { name: string; muscleGroup: string }>();
    const rows = await this.prisma.exercise.findMany({
      where: { id: { in: [...catalog] }, ...CATALOG_EXERCISE },
      select: { id: true, name: true, muscleGroup: true },
    });
    return new Map(rows.map((r) => [r.id, { name: r.name, muscleGroup: r.muscleGroup }]));
  }

  private async inTransaction<T>(fn: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A oferta mudou ao mesmo tempo em outro lugar. Tente de novo.');
      }
      throw error;
    }
  }
}
