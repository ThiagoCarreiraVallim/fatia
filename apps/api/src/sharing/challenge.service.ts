import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  AutoPostKind,
  ChallengeCheckinStatus,
  ChallengeCheckinType,
  ChallengeFlagSource,
  MembershipStatus,
  Prisma,
  type ChallengeMetric,
  type GroupChallenge,
  type GroupRole,
  type StepSource,
} from '@fatia/db';
import { ProgramService } from '../billing/program.service';
import { PrismaService } from '../common/prisma.service';
import { publishAutoPost } from './auto-post';
import { addDaysIso, dateInTz, dayBoundsInTz, todayInTz } from '../progress/helpers/date-tz';
import {
  buildScoreboard,
  ScoreboardService,
  type ParticipantDayFacts,
  type ScoreboardEntry,
} from '../social/scoreboard.service';
import {
  acceptedStepSource,
  currentStreak,
  dayDeadline,
  dayPoints,
  DEFAULT_DAILY_CAP_ML,
  DEFAULT_MAX_POINTS_PER_DAY,
  DEFAULT_STEPS_GOAL,
  DEFAULT_WATER_GOAL_ML,
  parsePointsTable,
  POINT_ITEMS,
  POINT_VALUE_MAX,
  STEPS_CLOSED_MESSAGE,
  STEPS_SYNC_AVAILABLE,
  type ChallengeKindName,
  type DayPart,
  type PointItem,
  type PointsTable,
} from '../social/challenge-days';
import { NotificationService } from '../notifications/notification.service';
import { MediaService } from '../storage/media.service';
import {
  challengeCreatedNotice,
  challengeEndedNotice,
  challengeStartedNotice,
} from './community-notices';
import { COMMUNITY_NAME_USER_SELECT, cleanDisplayName, communityName } from './display-name';
import { assertCanEditContent, canEditContent, requireContentRole } from './content-roles';
import { can } from './permissions';

export const CHALLENGE_TITLE_MIN = 3;
export const CHALLENGE_TITLE_MAX = 80;
export const CHALLENGE_DESCRIPTION_MAX = 1000;
/** Desafio é campanha, não estado permanente: até 90 dias. */
export const CHALLENGE_MAX_DAYS = 90;
/** Desafios marcados ou em andamento ao mesmo tempo, por comunidade. */
export const CHALLENGE_MAX_OPEN = 10;
/** Placar mais velho que isto é recalculado na leitura ("atualiza a cada poucos minutos"). */
export const SCORE_TTL_MS = 5 * 60_000;
const FINALIZE_INTERVAL_MS = 60 * 60_000;
/** O aviso de começo roda mais vezes que o fechamento: "Me avise quando começar". */
const START_NOTICE_INTERVAL_MS = 5 * 60_000;
/**
 * Com a fila de revisão aberta, o pódio espera até isto depois do fim (Cm-17:
 * "O pódio sai 24 h depois do fim, quando a fila de revisão estiver vazia").
 */
export const REVIEW_GRACE_MS = 24 * 60 * 60_000;
/** A foto de prova vive até 30 dias depois do fechamento (ADR 044 §7). */
export const CHECKIN_PHOTO_RETENTION_MS = 30 * 24 * 60 * 60_000;
/** Versão do texto de aceite da foto de check-in (ADR 047). Texto novo, versão nova. */
export const PHOTO_CONSENT_VERSION = '2026-11-18';

/** Métricas que o tipo `METRIC` ainda cria: as que contam treino ou dia, nunca ml nem passos. */
export const METRIC_KIND_METRICS = [
  'WORKOUT_SESSIONS',
  'ACTIVE_DAYS',
  'STREAK_DAYS',
] as const satisfies readonly ChallengeMetric[];
/** As de antes que somavam quantidade: o ranking delas fica só para quem participa. */
const RAW_AMOUNT_METRICS: readonly ChallengeMetric[] = ['WATER_ML', 'STEPS'];
export const NUTRITION_METRICS = [
  'PROTEIN_TARGET_DAYS',
  'KCAL_IN_RANGE_DAYS',
] as const satisfies readonly ChallengeMetric[];

export type ChallengeStatus = 'upcoming' | 'running' | 'ended';
export type Medal = 'gold' | 'silver' | 'bronze';

export interface ChallengeInput {
  title: string;
  description?: string | null;
  /** Ausente = `METRIC` (o desafio de antes). */
  kind?: ChallengeKindName;
  /** Obrigatória em `METRIC`; em `NUTRITION` escolhe proteína ou faixa de kcal. */
  metric?: ChallengeMetric;
  /** YYYY-MM-DD no fuso da comunidade, inclusivos. */
  startDate: string;
  endDate: string;
  pointsTable?: PointsTable | null;
  maxPointsPerDay?: number | null;
  waterGoalMl?: number | null;
  stepsGoal?: number | null;
  dailyCap?: number | null;
  allowedStepSources?: StepSource[] | null;
}

/** As regras do tipo, como a tela mostra (Regras, Pn-13). Nulo onde não se aplica. */
export interface ChallengeRules {
  waterGoalMl: number | null;
  stepsGoal: number | null;
  dailyCap: number | null;
  allowedStepSources: StepSource[];
  pointsTable: PointsTable | null;
  maxPointsPerDay: number | null;
  /** Check-in com foto: treino de no mínimo tantos minutos, até tantas horas depois. */
  checkin: { minWorkoutMinutes: number; windowHours: number } | null;
}

export interface MyParticipation {
  displayName: string;
  score: number;
  /** Nulo para quem ainda não tem posição (desafio marcado). */
  rank: number | null;
  medal: Medal | null;
  /** Dias seguidos com ponto (#395). */
  streak: number;
  /** Check-ins e dias meus esperando a equipe. */
  pendingReview: number;
}

export interface ChallengeView {
  id: string;
  title: string;
  description: string | null;
  kind: ChallengeKindName;
  metric: ChallengeMetric;
  startDate: string;
  endDate: string;
  /** Quantos dias o desafio tem. */
  totalDays: number;
  status: ChallengeStatus;
  endedEarly: boolean;
  /** Encerrado, mas o pódio espera a fila de revisão (até 24 h). */
  resultPending: boolean;
  participants: number;
  rules: ChallengeRules;
  /** Entrar pede o aceite da foto de check-in (ADR 047). */
  needsPhotoConsent: boolean;
  /** Pediu "Me avise quando começar". */
  watching: boolean;
  /** Quem criou pode editar e encerrar; quem modera também. */
  canManage: boolean;
  /** Pode abrir a fila de revisão (`challenge.review`). */
  canReview: boolean;
  me: MyParticipation | null;
}

/** Uma linha de `get_my_challenge_progress`: o desafio e como a pessoa vai nele. */
export interface MyChallengeProgress {
  id: string;
  title: string;
  kind: ChallengeKindName;
  metric: ChallengeMetric;
  status: ChallengeStatus;
  startDate: string;
  endDate: string;
  totalDays: number;
  participants: number;
  displayName: string;
  score: number;
  rank: number | null;
  streak: number;
  pendingReview: number;
  /** Só nos em andamento: o hoje da própria pessoa. */
  today: ChallengeToday | null;
}

export interface ChallengeList {
  /** Hoje no fuso da comunidade: o primeiro dia que um desafio novo pode ter. */
  today: string;
  challenges: ChallengeView[];
}

/** Um item de "Seus pontos de hoje" (Cm-17c), só da própria pessoa. */
export interface TodayItem {
  item: PointItem;
  points: number;
  done: boolean;
  /** O valor de hoje da própria pessoa (ml, passos), quando faz sentido. */
  value: number | null;
  goal: number | null;
}

export interface ChallengeToday {
  date: string;
  points: number;
  maxPoints: number | null;
  items: TodayItem[];
  /** O check-in de hoje, se já houve. */
  checkedInAt: string | null;
}

/** Uma linha da aba de atividade. Foto e motivo só na linha da própria pessoa. */
export interface ActivityItem {
  id: string;
  type: 'checkin' | 'day';
  displayName: string;
  isMe: boolean;
  date: string;
  at: string | null;
  points: number;
  parts: DayPart[];
  /** `voided` só aparece na linha da própria pessoa. */
  status: 'valid' | 'review' | 'voided';
  reason: string | null;
  photoUrl: string | null;
  canFlag: boolean;
  flaggedByMe: boolean;
}

export type LeaderboardRow = ScoreboardEntry & { medal: Medal | null };

export interface ChallengeDetail extends ChallengeView {
  /**
   * Quem é da comunidade vê o ranking (#395), participando ou não: apelido,
   * dias ou pontos e sequência. Nulo só nos desafios de antes que somavam ml ou
   * passos, para quem não entrou.
   */
  leaderboard: LeaderboardRow[] | null;
  /** O apelido sugerido para entrar: o da comunidade, ou o primeiro nome. */
  suggestedDisplayName: string;
  today: ChallengeToday | null;
  activity: ActivityItem[];
}

type Row = GroupChallenge & { _count: { participants: number } };

function medalOf(rank: number | null, score: number): Medal | null {
  if (rank === null || score <= 0) return null;
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
}

/** 1 + quantos fizeram mais: empate divide a posição (1, 1, 3), como no placar. */
function rankOf(score: number, scores: readonly number[]): number {
  return 1 + scores.filter((s) => s > score).length;
}

export const MIN_WORKOUT_MINUTES = 20;
export const CHECKIN_WINDOW_HOURS = 2;

/** O tipo pede check-in com foto? Foto sempre; pontos, se o treino vale ponto. */
export function usesPhotoCheckin(row: Pick<GroupChallenge, 'kind' | 'pointsTable'>): boolean {
  if (row.kind === 'PHOTO') return true;
  return row.kind === 'POINTS' && (parsePointsTable(row.pointsTable).workout ?? 0) > 0;
}

/** Dias do desafio no fuso dele. */
function windowDays(row: Pick<GroupChallenge, 'startsAt' | 'endsAt' | 'timezone'>) {
  return {
    first: dateInTz(row.startsAt, row.timezone),
    last: dateInTz(new Date(row.endsAt.getTime() - 1), row.timezone),
  };
}

function countDays(first: string, last: string): number {
  return (
    Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) +
    1
  );
}

/**
 * Desafios da comunidade (Fase 8a, ADR 027; redesign #395, ADR 044 e 047).
 *
 * A equipe (`challenge.manage`) marca e encerra; o membro ativo
 * (`challenge.join`) entra com um apelido. O placar é calculado por
 * `ScoreboardService` (`social/`), que nunca recebe nada além de quem participa
 * deste desafio: os participantes saem sempre de uma consulta que parte do
 * desafio da URL. Nos tipos do redesign o placar é de **dias** (ou pontos por
 * dia), gravado em `ChallengeDayScore`; os check-ins com foto e a fila de
 * revisão estão no `ChallengeCheckinService`.
 */
@Injectable()
export class ChallengeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChallengeService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreboard: ScoreboardService,
    private readonly notifications: NotificationService,
    @Optional() private readonly media?: MediaService,
    @Optional() private readonly programs?: ProgramService,
  ) {}

  onModuleInit(): void {
    const guard = (what: string, fn: () => Promise<unknown>) => () =>
      void fn().catch((err: unknown) =>
        this.logger.warn(`${what} falhou: ${err instanceof Error ? err.message : String(err)}`),
      );
    const fechar = setInterval(
      guard('Encerramento de desafios', async () => {
        await this.finalizeDue(new Date());
        await this.purgeExpiredPhotos(new Date());
      }),
      FINALIZE_INTERVAL_MS,
    );
    const avisar = setInterval(
      guard('Aviso de começo de desafio', () => this.notifyStarted(new Date())),
      START_NOTICE_INTERVAL_MS,
    );
    fechar.unref();
    avisar.unref();
    this.timers = [fechar, avisar];
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  // ---------------------------------------------------------------- membro

  async list(userId: string, groupId: string, now = new Date()): Promise<ChallengeList> {
    const { role, membershipId } = await this.member(userId, groupId, 'challenge.join');
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { timezone: true },
    });
    const antes = await this.prisma.groupChallenge.findMany({
      where: { groupId },
      orderBy: [{ startsAt: 'desc' }],
      take: 50,
    });
    await Promise.all(antes.map((r) => this.refresh(r, now)));
    const rows = await this.prisma.groupChallenge.findMany({
      where: { id: { in: antes.map((r) => r.id) } },
      include: { _count: { select: { participants: { where: ATIVOS } } } },
    });
    const [minhas, observados, pendentes] = await Promise.all([
      this.prisma.groupChallengeParticipant.findMany({
        where: { membershipId, challengeId: { in: rows.map((r) => r.id) } },
      }),
      this.prisma.groupChallengeWatcher.findMany({
        where: { membershipId, challengeId: { in: rows.map((r) => r.id) } },
        select: { challengeId: true },
      }),
      this.pendingByParticipant(membershipId),
    ]);
    const views: ChallengeView[] = [];
    for (const r of rows) {
      const p = minhas.find((m) => m.challengeId === r.id) ?? null;
      const scores = p ? await this.scoresOf(r.id) : [];
      views.push(
        this.view(r, now, role, userId, p, scores, {
          watching: observados.some((o) => o.challengeId === r.id),
          pendingReview: p ? (pendentes.get(p.id) ?? 0) : 0,
        }),
      );
    }
    // Em andamento primeiro, depois os marcados, depois os encerrados; dentro de
    // cada grupo, o que começa (ou começou) mais perto de hoje primeiro.
    const ordem: Record<ChallengeStatus, number> = { running: 0, upcoming: 1, ended: 2 };
    views.sort(
      (a, b) =>
        ordem[a.status] - ordem[b.status] ||
        (a.status === 'upcoming'
          ? a.startDate.localeCompare(b.startDate)
          : b.startDate.localeCompare(a.startDate)),
    );
    return { today: todayInTz(group.timezone), challenges: views };
  }

  /**
   * "Como estou nos desafios?" (`get_my_challenge_progress`): só os desafios em
   * que a pessoa está e que não acabaram, com a pontuação, a posição, a
   * sequência e o hoje dela. Nada de outra pessoa além da posição.
   */
  async myProgress(
    userId: string,
    groupId: string,
    now = new Date(),
  ): Promise<MyChallengeProgress[]> {
    const { challenges } = await this.list(userId, groupId, now);
    const meus = challenges.filter((c) => c.me !== null && c.status !== 'ended');
    return Promise.all(
      meus.map(async (c) => {
        const me = c.me!;
        const today =
          c.status === 'running' ? (await this.get(userId, groupId, c.id, now)).today : null;
        return {
          id: c.id,
          title: c.title,
          kind: c.kind,
          metric: c.metric,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
          totalDays: c.totalDays,
          participants: c.participants,
          displayName: me.displayName,
          score: me.score,
          rank: me.rank,
          streak: me.streak,
          pendingReview: me.pendingReview,
          today,
        };
      }),
    );
  }

  async get(
    userId: string,
    groupId: string,
    challengeId: string,
    now = new Date(),
  ): Promise<ChallengeDetail> {
    const { role, membershipId, name } = await this.member(userId, groupId, 'challenge.join');
    const row = await this.find(groupId, challengeId);
    await this.refresh(row, now);
    const linhas = await this.prisma.groupChallengeParticipant.findMany({
      where: { challengeId: row.id, ...ATIVOS },
      select: {
        id: true,
        membershipId: true,
        displayName: true,
        score: true,
        finalRank: true,
        streak: true,
        membership: { select: { userId: true, user: { select: { timezone: true } } } },
      },
    });
    const meu = linhas.find((l) => l.membershipId === membershipId) ?? null;
    const scores = linhas.map((l) => l.score);
    const atual = await this.find(groupId, challengeId);
    const [observando, pendentes] = await Promise.all([
      this.prisma.groupChallengeWatcher.findUnique({
        where: { challengeId_membershipId: { challengeId: row.id, membershipId } },
      }),
      this.pendingByParticipant(membershipId),
    ]);
    const view = this.view(atual, now, role, userId, meu, scores, {
      watching: observando !== null,
      pendingReview: meu ? (pendentes.get(meu.id) ?? 0) : 0,
    });
    const verRanking =
      meu !== null || atual.kind !== 'METRIC' || !RAW_AMOUNT_METRICS.includes(atual.metric);
    return {
      ...view,
      leaderboard: verRanking
        ? this.leaderboard(view.status, atual.finalizedAt, linhas, membershipId)
        : null,
      suggestedDisplayName: name,
      today:
        meu && view.status === 'running' && atual.kind !== 'METRIC'
          ? await this.todayOf(atual, meu, now)
          : null,
      activity: atual.kind === 'METRIC' ? [] : await this.activity(atual, linhas, membershipId),
    };
  }

  async join(
    userId: string,
    groupId: string,
    challengeId: string,
    displayName: string | undefined,
    opts: { acceptPhotoTerms?: boolean } = {},
    now = new Date(),
  ): Promise<ChallengeDetail> {
    const m = await this.member(userId, groupId, 'challenge.join');
    const row = await this.find(groupId, challengeId);
    if (statusOf(row, now) === 'ended') throw new ConflictException('Este desafio já terminou');
    const foto = usesPhotoCheckin(row);
    if (foto && opts.acceptPhotoTerms !== true) {
      // ADR 047: a foto de check-in tem aceite próprio, lido na tela de entrada
      // (no app). Sem ele não se entra — nem pelo MCP.
      throw new BadRequestException(
        'Este desafio tem check-in com foto: para entrar, aceite no app que a equipe vê a foto ' +
          'de prova e que ela é apagada 30 dias depois do fim.',
      );
    }
    // Sem nome escolhido (o app não pergunta mais), entra com o do perfil e nada é
    // gravado na comunidade: trocar o nome no perfil troca o próximo desafio.
    const nome = displayName === undefined ? m.name : cleanDisplayName(displayName);
    const aceite = foto ? { photoConsentVersion: PHOTO_CONSENT_VERSION, photoConsentAt: now } : {};
    await this.prisma.$transaction([
      this.prisma.groupChallengeParticipant.upsert({
        where: { challengeId_membershipId: { challengeId: row.id, membershipId: m.membershipId } },
        create: {
          challengeId: row.id,
          membershipId: m.membershipId,
          displayName: nome,
          ...aceite,
        },
        update: { displayName: nome, ...aceite },
      }),
      // Um apelido escolhido vale para a comunidade: o próximo desafio já sugere este.
      ...(displayName === undefined
        ? []
        : [
            this.prisma.groupMembership.update({
              where: { id: m.membershipId },
              data: { displayName: nome },
            }),
          ]),
      // Entrou: o "Me avise" deixa de ser preciso (quem entrou já é avisado).
      this.prisma.groupChallengeWatcher.deleteMany({
        where: { challengeId: row.id, membershipId: m.membershipId },
      }),
      // Placar velho de propósito: quem entrou aparece com a pontuação certa já
      // na próxima leitura.
      this.prisma.groupChallenge.update({ where: { id: row.id }, data: { scoredAt: null } }),
    ]);
    // Programa do desafio (#403): quem entra ganha o assento PRO, até acabar.
    // Falhar aqui não tira ninguém do desafio.
    await this.programs
      ?.syncChallenge(row.id, now)
      .catch((err: unknown) =>
        this.logger.warn(
          `Assento do programa do desafio falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    return this.get(userId, groupId, challengeId, now);
  }

  async leave(userId: string, groupId: string, challengeId: string, now = new Date()) {
    const m = await this.member(userId, groupId, 'challenge.join');
    const row = await this.find(groupId, challengeId);
    // Encerrado, o resultado é história: sair não apaga a colocação de ninguém.
    if (statusOf(row, now) === 'ended') throw new ConflictException('Este desafio já terminou');
    // As fotos de prova saem do bucket antes da linha (ADR 044 §7: sair apaga na hora).
    await this.discardPhotos({
      participant: { challengeId: row.id, membershipId: m.membershipId },
    });
    await this.prisma.groupChallengeParticipant.deleteMany({
      where: { challengeId: row.id, membershipId: m.membershipId },
    });
    return { left: true };
  }

  /** "Me avise quando começar" (Cm-08): só antes de começar e para quem não entrou. */
  async watch(userId: string, groupId: string, challengeId: string, on: boolean, now = new Date()) {
    const m = await this.member(userId, groupId, 'challenge.join');
    const row = await this.find(groupId, challengeId);
    if (on) {
      if (statusOf(row, now) !== 'upcoming') {
        throw new ConflictException('Este desafio já começou');
      }
      await this.prisma.groupChallengeWatcher.upsert({
        where: { challengeId_membershipId: { challengeId: row.id, membershipId: m.membershipId } },
        create: { challengeId: row.id, membershipId: m.membershipId },
        update: {},
      });
    } else {
      await this.prisma.groupChallengeWatcher.deleteMany({
        where: { challengeId: row.id, membershipId: m.membershipId },
      });
    }
    return { watching: on };
  }

  // ---------------------------------------------------------------- equipe

  async create(userId: string, groupId: string, input: ChallengeInput, now = new Date()) {
    await this.member(userId, groupId, 'challenge.manage');
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { timezone: true },
    });
    const janela = this.window(input, group.timezone);
    const regras = normalizeRules(input);
    assertStepsOpen(regras, false);
    const abertos = await this.prisma.groupChallenge.count({
      where: { groupId, endsAt: { gt: now } },
    });
    if (abertos >= CHALLENGE_MAX_OPEN) {
      throw new ConflictException(
        `A comunidade já tem ${CHALLENGE_MAX_OPEN} desafios marcados ou em andamento`,
      );
    }
    const criado = await this.prisma.groupChallenge.create({
      data: {
        groupId,
        authorId: userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        timezone: group.timezone,
        ...regras,
        ...janela,
      },
    });
    await publishAutoPost(this.prisma, {
      groupId,
      actorUserId: userId,
      kind: AutoPostKind.CHALLENGE,
      refId: criado.id,
      title: criado.title,
      meta: null,
    });
    const avisar = await this.prisma.groupMembership.findMany({
      where: { groupId, status: MembershipStatus.ACTIVE, userId: { not: userId } },
      select: { userId: true, group: { select: { name: true } } },
    });
    if (avisar.length > 0) {
      this.notifications.notify(
        avisar.map((m) => m.userId),
        challengeCreatedNotice({
          groupId,
          groupName: avisar[0]!.group.name,
          challengeId: criado.id,
          title: criado.title,
        }),
      );
    }
    return this.get(userId, groupId, criado.id, now);
  }

  /** Só antes de começar: depois, mudar a regra seria mudar o placar de quem já está jogando. */
  async update(
    userId: string,
    groupId: string,
    challengeId: string,
    input: ChallengeInput,
    now = new Date(),
  ) {
    const role = (await this.member(userId, groupId, 'challenge.manage')).role;
    const row = await this.find(groupId, challengeId);
    assertCanEditContent(role, userId, row.authorId);
    if (statusOf(row, now) !== 'upcoming') {
      throw new ConflictException('O desafio já começou: dá para encerrar, não para mudar');
    }
    // O desafio antigo que soma ml ou passos (#395 M8) não se cria mais, mas o
    // que já existe se edita antes de começar, sem trocar o que mede.
    const antigo =
      row.kind === 'METRIC' &&
      RAW_AMOUNT_METRICS.includes(row.metric) &&
      (input.kind ?? 'METRIC') === 'METRIC' &&
      input.metric === row.metric;
    const regras = antigo ? legacyRules(row) : normalizeRules(input);
    assertStepsOpen(regras, rulesUseSteps(row));
    const viraFoto = usesPhotoCheckin({
      kind: regras.kind,
      pointsTable:
        regras.pointsTable === Prisma.DbNull ? null : (regras.pointsTable as Prisma.JsonValue),
    });
    if (viraFoto && !usesPhotoCheckin(row)) {
      // Quem entrou não aceitou foto: o desafio não vira de foto por baixo dele.
      const inscritos = await this.prisma.groupChallengeParticipant.count({
        where: { challengeId: row.id, photoConsentAt: null },
      });
      if (inscritos > 0) {
        throw new ConflictException(
          'Já tem gente inscrita sem o aceite da foto: crie outro desafio com check-in com foto',
        );
      }
    }
    await this.prisma.groupChallenge.update({
      where: { id: row.id },
      data: {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        ...regras,
        ...this.window(input, row.timezone),
      },
    });
    return this.get(userId, groupId, challengeId, now);
  }

  /** Encerra agora: o placar fecha com o que foi registrado até aqui. */
  async end(userId: string, groupId: string, challengeId: string, now = new Date()) {
    const role = (await this.member(userId, groupId, 'challenge.manage')).role;
    const row = await this.find(groupId, challengeId);
    assertCanEditContent(role, userId, row.authorId);
    const status = statusOf(row, now);
    if (status === 'ended') throw new ConflictException('Este desafio já terminou');
    if (status === 'upcoming') {
      throw new ConflictException('O desafio ainda não começou: apague em vez de encerrar');
    }
    await this.prisma.groupChallenge.update({
      where: { id: row.id },
      data: { endsAt: now, endedEarlyAt: now },
    });
    await this.closeOrWait(row.id, now);
    return this.get(userId, groupId, challengeId, now);
  }

  /** Só o que ainda não começou: o que começou tem placar, e placar se encerra. */
  async remove(userId: string, groupId: string, challengeId: string, now = new Date()) {
    const role = (await this.member(userId, groupId, 'challenge.manage')).role;
    const row = await this.find(groupId, challengeId);
    assertCanEditContent(role, userId, row.authorId);
    if (statusOf(row, now) !== 'upcoming') {
      throw new ConflictException('Só dá para apagar um desafio que ainda não começou');
    }
    await this.prisma.groupChallenge.delete({ where: { id: row.id } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------- placar

  /**
   * Fecha os desafios cuja janela acabou. Várias instâncias da API podem rodar
   * isto ao mesmo tempo: quem consegue gravar `finalizedAt` primeiro é quem
   * fecha; as outras desistem. Com a fila de revisão aberta, espera até 24 h.
   */
  async finalizeDue(now = new Date()): Promise<number> {
    const vencidos = await this.prisma.groupChallenge.findMany({
      where: { finalizedAt: null, endsAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    let fechados = 0;
    for (const v of vencidos) if (await this.closeOrWait(v.id, now)) fechados += 1;
    return fechados;
  }

  /**
   * Fecha o desafio encerrado se a fila dele está vazia ou se já passou o prazo
   * de revisão; senão, só recalcula. Chamado também quando a equipe decide o
   * último item da fila.
   */
  async closeOrWait(challengeId: string, now: Date): Promise<boolean> {
    const row = await this.prisma.groupChallenge.findUnique({ where: { id: challengeId } });
    if (!row || row.finalizedAt || row.endsAt > now) return false;
    if (now.getTime() < row.endsAt.getTime() + REVIEW_GRACE_MS) {
      const abertos = await this.prisma.challengeCheckin.count({
        where: { participant: { challengeId: row.id }, status: ChallengeCheckinStatus.FLAGGED },
      });
      if (abertos > 0) {
        await this.rescore(row, now);
        return false;
      }
    }
    return this.finalize(row.id, now);
  }

  private async finalize(challengeId: string, now: Date): Promise<boolean> {
    const claim = await this.prisma.groupChallenge.updateMany({
      where: { id: challengeId, finalizedAt: null, endsAt: { lte: now } },
      data: { finalizedAt: now },
    });
    if (claim.count === 0) return false;
    const row = await this.prisma.groupChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    const pontos = await this.score(row, now);
    const scores = pontos.map((p) => p.score);
    await this.prisma.$transaction([
      ...pontos.map((p) =>
        this.prisma.groupChallengeParticipant.update({
          where: { id: p.participantId },
          data: { score: p.score, streak: p.streak, finalRank: rankOf(p.score, scores) },
        }),
      ),
      ...this.dayScoreWrites(pontos),
      this.prisma.groupChallenge.update({ where: { id: row.id }, data: { scoredAt: now } }),
    ]);
    // Só quem participou e ainda está na comunidade; a posição fica no app.
    const quem = await this.prisma.groupChallengeParticipant.findMany({
      where: { challengeId: row.id, membership: { status: MembershipStatus.ACTIVE } },
      select: { membership: { select: { userId: true, group: { select: { name: true } } } } },
    });
    if (quem.length > 0) {
      this.notifications.notify(
        quem.map((q) => q.membership.userId),
        challengeEndedNotice({
          groupId: row.groupId,
          groupName: quem[0]!.membership.group.name,
          challengeId: row.id,
          title: row.title,
        }),
      );
    }
    return true;
  }

  /**
   * Recalcula o placar de um desafio em andamento quando ele está velho. O
   * encerrado que ninguém fechou ainda (o intervalo é de hora em hora) fecha
   * aqui, na primeira leitura — ou espera a fila de revisão.
   */
  async refresh(row: GroupChallenge, now: Date): Promise<void> {
    const status = statusOf(row, now);
    if (status === 'upcoming') return;
    if (status === 'ended') {
      if (!row.finalizedAt) await this.closeOrWait(row.id, now);
      return;
    }
    if (row.scoredAt && now.getTime() - row.scoredAt.getTime() < SCORE_TTL_MS) return;
    await this.rescore(row, now);
  }

  private async rescore(row: GroupChallenge, now: Date): Promise<void> {
    const pontos = await this.score(row, now);
    await this.prisma.$transaction([
      ...pontos.map((p) =>
        this.prisma.groupChallengeParticipant.update({
          where: { id: p.participantId },
          data: { score: p.score, streak: p.streak },
        }),
      ),
      ...this.dayScoreWrites(pontos),
      this.prisma.groupChallenge.update({ where: { id: row.id }, data: { scoredAt: now } }),
    ]);
  }

  private dayScoreWrites(pontos: Scored[]): Prisma.PrismaPromise<unknown>[] {
    const comDias = pontos.filter((p) => p.days !== null);
    if (comDias.length === 0) return [];
    return [
      this.prisma.challengeDayScore.deleteMany({
        where: { participantId: { in: comDias.map((p) => p.participantId) } },
      }),
      this.prisma.challengeDayScore.createMany({
        data: comDias.flatMap((p) =>
          [...p.days!].map(([date, d]) => ({
            participantId: p.participantId,
            date,
            points: d.points,
            parts: [...d.parts],
          })),
        ),
      }),
    ];
  }

  /**
   * Os participantes saem DESTE desafio, com o `userId` lido da associação —
   * a pré-condição de `ScoreboardService`. Quem saiu da comunidade não pontua
   * nem aparece.
   */
  private async score(row: GroupChallenge, now: Date): Promise<Scored[]> {
    const participantes = await this.prisma.groupChallengeParticipant.findMany({
      where: { challengeId: row.id, ...ATIVOS },
      select: {
        id: true,
        membershipId: true,
        membership: { select: { userId: true, user: { select: { timezone: true } } } },
      },
    });
    const pessoas = participantes.map((p) => ({
      membershipId: p.membershipId,
      userId: p.membership.userId,
      timezone: p.membership.user.timezone,
    }));
    if (row.kind === 'METRIC') {
      const pontos = await this.scoreboard.recompute(
        { metric: row.metric, startsAt: row.startsAt, endsAt: row.endsAt, timezone: row.timezone },
        pessoas,
      );
      const porMembro = new Map(pontos.map((p) => [p.membershipId, p.score]));
      return participantes.map((p) => ({
        participantId: p.id,
        score: porMembro.get(p.membershipId) ?? 0,
        streak: 0,
        days: null,
      }));
    }
    return this.scoreByDays(row, participantes, pessoas, now);
  }

  /**
   * O placar por dias (#395). Para cada participante e dia: o que valeu
   * (check-in válido, água, passos, nutrição), menos os dias que a fila segura
   * (sinalizados ou anulados); depois, os pontos do dia pela regra do tipo.
   *
   * Aqui também a revisão automática: check-in cujo treino mudou ou sumiu volta
   * para a fila, e dia de água ou passos fora do padrão entra nela (até o teto).
   */
  private async scoreByDays(
    row: GroupChallenge,
    participantes: Array<{ id: string; membershipId: string }>,
    pessoas: Array<{ membershipId: string; userId: string; timezone: string }>,
    now: Date,
  ): Promise<Scored[]> {
    const { first, last } = windowDays(row);
    const kind = row.kind as ChallengeKindName;
    const table = parsePointsTable(row.pointsTable);
    const usa = (item: PointItem) =>
      kind === 'POINTS'
        ? (table[item] ?? 0) > 0
        : (item === 'workout' && kind === 'PHOTO') ||
          (item === 'water' && kind === 'WATER') ||
          (item === 'steps' && kind === 'STEPS') ||
          (item === 'protein' && kind === 'NUTRITION' && row.metric !== 'KCAL_IN_RANGE_DAYS') ||
          (item === 'kcal' && kind === 'NUTRITION' && row.metric === 'KCAL_IN_RANGE_DAYS');

    await this.recheckWorkouts(row.id, now);
    const [fatos, provas] = await Promise.all([
      this.scoreboard.dayFacts(
        { metric: row.metric, startsAt: row.startsAt, endsAt: row.endsAt, timezone: row.timezone },
        pessoas,
        {
          water: usa('water')
            ? {
                goal: row.waterGoalMl ?? DEFAULT_WATER_GOAL_ML,
                cap: row.dailyCap ?? DEFAULT_DAILY_CAP_ML,
              }
            : undefined,
          steps: usa('steps')
            ? { goal: row.stepsGoal ?? DEFAULT_STEPS_GOAL, allowed: row.allowedStepSources }
            : undefined,
          nutrition: usa('protein') || usa('kcal'),
        },
      ),
      this.prisma.challengeCheckin.findMany({
        where: {
          participantId: { in: participantes.map((p) => p.id) },
          date: { gte: first, lte: last },
        },
        select: { participantId: true, type: true, date: true, status: true },
      }),
    ]);

    await this.flagSuspiciousDays(row.id, participantes, pessoas, fatos, provas, first, last);
    const provasDepois = await this.prisma.challengeCheckin.findMany({
      where: {
        participantId: { in: participantes.map((p) => p.id) },
        date: { gte: first, lte: last },
      },
      select: { participantId: true, type: true, date: true, status: true },
    });

    const hoje = todayInTz(row.timezone);
    const max = row.maxPointsPerDay ?? DEFAULT_MAX_POINTS_PER_DAY;
    return participantes.map((p) => {
      const pessoa = pessoas.find((x) => x.membershipId === p.membershipId)!;
      const f = fatos.get(pessoa.userId);
      const minhas = provasDepois.filter((c) => c.participantId === p.id);
      const segura = (type: ChallengeCheckinType, date: string) =>
        minhas.some((c) => c.type === type && c.date === date && c.status !== 'VALID');
      const partes = new Map<string, Set<DayPart>>();
      const marca = (date: string, part: DayPart) => {
        if (date < first || date > last) return;
        const s = partes.get(date) ?? new Set<DayPart>();
        s.add(part);
        partes.set(date, s);
      };
      if (usa('workout')) {
        for (const c of minhas) {
          if (c.type === 'PHOTO' && c.status === 'VALID') marca(c.date, 'workout');
        }
      }
      if (f) {
        if (usa('water')) for (const d of f.water.met) if (!segura('WATER', d)) marca(d, 'water');
        if (usa('steps')) for (const d of f.steps.met) if (!segura('STEPS', d)) marca(d, 'steps');
        if (usa('protein')) for (const d of f.protein) marca(d, 'protein');
        if (usa('kcal')) for (const d of f.kcal) marca(d, 'kcal');
      }
      const days = new Map<string, { points: number; parts: Set<DayPart> }>();
      for (const [date, parts] of partes) {
        const pts = dayPoints(kind, parts, table, max, row.metric);
        if (pts > 0) days.set(date, { points: pts, parts });
      }
      const score = [...days.values()].reduce((s, d) => s + d.points, 0);
      const streak = currentStreak(new Set(days.keys()), first, last, hoje);
      return { participantId: p.id, score, streak, days };
    });
  }

  /**
   * "Se você editar o treino depois, o check-in volta para revisão" (Cm-18): o
   * retrato do treino gravado no check-in não bate mais com o treino (ou o
   * treino foi apagado). Vale também para o já aprovado.
   */
  private async recheckWorkouts(challengeId: string, now: Date): Promise<void> {
    const validos = await this.prisma.challengeCheckin.findMany({
      where: {
        participant: { challengeId },
        type: ChallengeCheckinType.PHOTO,
        status: ChallengeCheckinStatus.VALID,
      },
      select: {
        id: true,
        workoutFingerprint: true,
        workoutSession: {
          select: { startedAt: true, completedAt: true, _count: { select: { sets: true } } },
        },
      },
    });
    for (const c of validos) {
      const atual = c.workoutSession ? workoutFingerprint(c.workoutSession) : null;
      if (atual === c.workoutFingerprint) continue;
      await this.prisma.challengeCheckin.update({
        where: { id: c.id },
        data: {
          status: ChallengeCheckinStatus.FLAGGED,
          flagSource: ChallengeFlagSource.SYSTEM,
          flagReason: atual
            ? 'Treino editado depois do check-in'
            : 'Treino apagado depois do check-in',
          flaggedAt: now,
          reviewedAt: null,
          reviewedById: null,
        },
      });
    }
  }

  /** Dia de água ou passos fora do padrão vai para a fila, se ainda não tem prova e cabe. */
  private async flagSuspiciousDays(
    challengeId: string,
    participantes: Array<{ id: string; membershipId: string }>,
    pessoas: Array<{ membershipId: string; userId: string }>,
    fatos: Map<string, ParticipantDayFacts>,
    provas: Array<{ participantId: string; type: ChallengeCheckinType; date: string }>,
    first: string,
    last: string,
  ): Promise<void> {
    const novos: Array<{
      participantId: string;
      type: ChallengeCheckinType;
      date: string;
      reason: string;
    }> = [];
    for (const p of participantes) {
      const f = fatos.get(pessoas.find((x) => x.membershipId === p.membershipId)!.userId);
      if (!f) continue;
      for (const [type, mapa] of [
        [ChallengeCheckinType.WATER, f.water.suspicious],
        [ChallengeCheckinType.STEPS, f.steps.suspicious],
      ] as const) {
        for (const [date, reason] of mapa) {
          if (date < first || date > last) continue;
          if (provas.some((c) => c.participantId === p.id && c.type === type && c.date === date)) {
            continue;
          }
          novos.push({ participantId: p.id, type, date, reason });
        }
      }
    }
    if (novos.length === 0) return;
    // O detector sempre entra (#395 I6): o teto da fila é das sinalizações de
    // membros; um dia fora do padrão nunca conta sem a equipe olhar.
    await this.prisma.challengeCheckin.createMany({
      data: novos.map((n) => ({
        participantId: n.participantId,
        type: n.type,
        date: n.date,
        status: ChallengeCheckinStatus.FLAGGED,
        flagSource: ChallengeFlagSource.SYSTEM,
        flagReason: n.reason,
        flaggedAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  /**
   * O ranking como sai: encerrado, vale a posição gravada ao fechar (a medalha
   * não muda se alguém sai da comunidade depois); antes, a posição de agora.
   */
  private leaderboard(
    status: ChallengeStatus,
    finalizedAt: Date | null,
    linhas: ReadonlyArray<{
      membershipId: string;
      displayName: string;
      score: number;
      finalRank: number | null;
      streak: number;
    }>,
    membershipId: string,
  ): LeaderboardRow[] {
    const placar = buildScoreboard(
      linhas.map((l) => ({
        displayName: l.displayName,
        score: l.score,
        isMe: l.membershipId === membershipId,
        streak: l.streak,
      })),
    );
    // Medalha só com o resultado fechado (#395 B3): encerrado com a fila aberta,
    // o pódio ainda pode mudar.
    if (status !== 'ended' || !finalizedAt) return placar.map((e) => ({ ...e, medal: null }));
    // `buildScoreboard` não recebe id de propósito; a posição gravada volta pela
    // ordem, que é a mesma (pontuação, depois apelido).
    const ordenadas = [...linhas].sort(
      (a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName, 'pt-BR'),
    );
    return placar.map((e, i) => {
      const rank = ordenadas[i]?.finalRank ?? e.rank;
      return { ...e, rank, medal: medalOf(rank, e.score) };
    });
  }

  /**
   * "Seus pontos de hoje" (Cm-17c) e o "Hoje: 1,8 de 2,5 L" do topo: só da
   * própria pessoa. Os valores de água e passos são dela, para ela.
   */
  private async todayOf(
    row: GroupChallenge,
    meu: { id: string; membership: { userId: string; user: { timezone: string } } },
    now: Date,
  ): Promise<ChallengeToday> {
    const tz = meu.membership.user.timezone;
    const userId = meu.membership.userId;
    const hoje = dateInTz(now, tz);
    const kind = row.kind as ChallengeKindName;
    const table = parsePointsTable(row.pointsTable);
    const [dia, agua, passos, checkin] = await Promise.all([
      this.prisma.challengeDayScore.findUnique({
        where: { participantId_date: { participantId: meu.id, date: hoje } },
      }),
      this.prisma.waterLog.aggregate({ where: { userId, date: hoje }, _sum: { ml: true } }),
      this.prisma.stepLog.findMany({
        where: { userId, date: hoje },
        select: { steps: true, source: true, loggedAt: true },
      }),
      this.prisma.challengeCheckin.findUnique({
        where: {
          participantId_type_date: { participantId: meu.id, type: 'PHOTO', date: hoje },
        },
        select: { capturedAt: true, status: true },
      }),
    ]);
    const feito = new Set<string>(dia?.parts ?? []);
    const prazo = dayDeadline(hoje, tz);
    const passosHoje = Math.max(
      0,
      ...passos
        .filter((l) => acceptedStepSource(l.source, row.allowedStepSources) && l.loggedAt <= prazo)
        .map((l) => l.steps),
    );
    const cap = row.dailyCap ?? DEFAULT_DAILY_CAP_ML;
    const itens: TodayItem[] = [];
    const add = (item: PointItem, pontos: number, value: number | null, goal: number | null) =>
      itens.push({ item, points: pontos, done: feito.has(item), value, goal });
    const pts = (item: PointItem) => (kind === 'POINTS' ? (table[item] ?? 0) : 1);
    const quer = (item: PointItem) =>
      kind === 'POINTS'
        ? (table[item] ?? 0) > 0
        : (item === 'workout' && kind === 'PHOTO') ||
          (item === 'water' && kind === 'WATER') ||
          (item === 'steps' && kind === 'STEPS') ||
          (item === 'protein' && kind === 'NUTRITION' && row.metric !== 'KCAL_IN_RANGE_DAYS') ||
          (item === 'kcal' && kind === 'NUTRITION' && row.metric === 'KCAL_IN_RANGE_DAYS');
    for (const item of POINT_ITEMS) {
      if (!quer(item)) continue;
      if (item === 'water') {
        add(
          item,
          pts(item),
          Math.min(agua._sum.ml ?? 0, cap),
          row.waterGoalMl ?? DEFAULT_WATER_GOAL_ML,
        );
      } else if (item === 'steps') {
        add(item, pts(item), passosHoje, row.stepsGoal ?? DEFAULT_STEPS_GOAL);
      } else {
        add(item, pts(item), null, null);
      }
    }
    return {
      date: hoje,
      points: dia?.points ?? 0,
      maxPoints: kind === 'POINTS' ? (row.maxPointsPerDay ?? DEFAULT_MAX_POINTS_PER_DAY) : 1,
      items: itens,
      checkedInAt: checkin ? checkin.capturedAt.toISOString() : null,
    };
  }

  /**
   * A aba de atividade (Cm-17): check-ins (sem foto de ninguém — só a própria
   * pessoa vê a dela, ADR 044) e os dias na meta. Quem é sinalizado nunca sabe
   * quem sinalizou; o motivo da fila só vai para a própria pessoa.
   */
  private async activity(
    row: GroupChallenge,
    linhas: ReadonlyArray<{ id: string; membershipId: string; displayName: string }>,
    membershipId: string,
  ): Promise<ActivityItem[]> {
    const ids = linhas.map((l) => l.id);
    const meuId = linhas.find((l) => l.membershipId === membershipId)?.id ?? null;
    const [checkins, dias] = await Promise.all([
      usesPhotoCheckin(row)
        ? this.prisma.challengeCheckin.findMany({
            where: { participantId: { in: ids }, type: 'PHOTO' },
            orderBy: { capturedAt: 'desc' },
            take: 30,
            include: {
              photoFile: true,
              flags: { where: { membershipId }, select: { id: true } },
            },
          })
        : Promise.resolve([]),
      row.kind === 'PHOTO'
        ? Promise.resolve([])
        : this.prisma.challengeDayScore.findMany({
            where: { participantId: { in: ids }, points: { gt: 0 } },
            orderBy: { date: 'desc' },
            take: 30,
          }),
    ]);
    const nome = (participantId: string) =>
      linhas.find((l) => l.id === participantId)?.displayName ?? '';
    const table = parsePointsTable(row.pointsTable);
    const itens: ActivityItem[] = [];
    for (const c of checkins) {
      const meu = c.participantId === meuId;
      if (c.status === 'VOIDED' && !meu) continue;
      itens.push({
        id: c.id,
        type: 'checkin',
        displayName: nome(c.participantId),
        isMe: meu,
        date: c.date,
        // O horário é rotina: só na própria linha; os outros veem o dia (#395 M6).
        at: meu ? c.capturedAt.toISOString() : null,
        points: row.kind === 'POINTS' ? (table.workout ?? 0) : 1,
        parts: ['workout'],
        status: c.status === 'VALID' ? 'valid' : c.status === 'FLAGGED' ? 'review' : 'voided',
        reason: meu ? (c.status === 'VOIDED' ? c.reason : c.flagReason) : null,
        photoUrl:
          meu && this.media && c.photoFile ? (await this.media.view(c.photoFile)).url : null,
        canFlag:
          meuId !== null &&
          !meu &&
          c.status === 'VALID' &&
          c.reviewedAt === null &&
          statusOf(row, new Date()) === 'running',
        flaggedByMe: c.flags.length > 0,
      });
    }
    for (const d of dias) {
      const meu = d.participantId === meuId;
      itens.push({
        id: d.id,
        type: 'day',
        displayName: nome(d.participantId),
        isMe: meu,
        date: d.date,
        at: null,
        points: d.points,
        parts: d.parts.filter((p): p is DayPart => (POINT_ITEMS as readonly string[]).includes(p)),
        status: 'valid',
        reason: null,
        photoUrl: null,
        canFlag: false,
        flaggedByMe: false,
      });
    }
    itens.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.at ?? '').localeCompare(a.at ?? '') ||
        (a.type === 'checkin' ? -1 : 1),
    );
    return itens.slice(0, 30);
  }

  private async scoresOf(challengeId: string): Promise<number[]> {
    const linhas = await this.prisma.groupChallengeParticipant.findMany({
      where: { challengeId, ...ATIVOS },
      select: { score: true },
    });
    return linhas.map((l) => l.score);
  }

  /** Quantos itens meus estão na fila, por participação (o "em revisão" do cartão). */
  private async pendingByParticipant(membershipId: string): Promise<Map<string, number>> {
    const grupos = await this.prisma.challengeCheckin.groupBy({
      by: ['participantId'],
      where: { participant: { membershipId }, status: ChallengeCheckinStatus.FLAGGED },
      _count: { _all: true },
    });
    return new Map(grupos.map((g) => [g.participantId, g._count._all]));
  }

  // ---------------------------------------------------------------- avisos e retenção

  /**
   * O aviso de começo: a quem pediu "Me avise" e a quem já entrou. Uma vez só,
   * mesmo com várias instâncias (quem grava `startNotifiedAt` primeiro avisa).
   */
  async notifyStarted(now = new Date()): Promise<number> {
    const comecaram = await this.prisma.groupChallenge.findMany({
      where: { startNotifiedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
      take: 100,
    });
    let avisados = 0;
    for (const c of comecaram) {
      const claim = await this.prisma.groupChallenge.updateMany({
        where: { id: c.id, startNotifiedAt: null },
        data: { startNotifiedAt: now },
      });
      if (claim.count === 0) continue;
      const row = await this.prisma.groupChallenge.findUniqueOrThrow({
        where: { id: c.id },
        include: {
          group: { select: { name: true } },
          watchers: {
            where: { membership: { status: MembershipStatus.ACTIVE } },
            select: { membership: { select: { userId: true } } },
          },
          participants: {
            where: ATIVOS,
            select: { membership: { select: { userId: true } } },
          },
        },
      });
      const quem = [
        ...row.watchers.map((w) => w.membership.userId),
        ...row.participants.map((p) => p.membership.userId),
      ];
      if (quem.length === 0) continue;
      this.notifications.notify(
        quem,
        challengeStartedNotice({
          groupId: row.groupId,
          groupName: row.group.name,
          challengeId: row.id,
          title: row.title,
        }),
      );
      avisados += 1;
    }
    return avisados;
  }

  /** A foto de prova vive até 30 dias depois do fechamento (ADR 044 §7). */
  async purgeExpiredPhotos(now = new Date()): Promise<number> {
    const vencidos = await this.prisma.groupChallenge.findMany({
      where: {
        photosPurgedAt: null,
        finalizedAt: { lte: new Date(now.getTime() - CHECKIN_PHOTO_RETENTION_MS) },
      },
      select: { id: true },
      take: 50,
    });
    for (const v of vencidos) {
      await this.discardPhotos({ participant: { challengeId: v.id } });
      await this.prisma.groupChallenge.update({
        where: { id: v.id },
        data: { photosPurgedAt: now },
      });
    }
    return vencidos.length;
  }

  /** Tira do bucket (e da linha) as fotos de prova dos check-ins que casam. */
  async discardPhotos(where: Prisma.ChallengeCheckinWhereInput): Promise<void> {
    const fotos = await this.prisma.challengeCheckin.findMany({
      where: { ...where, photoFileId: { not: null } },
      select: { photoFile: { select: { id: true, key: true } } },
    });
    const arquivos = fotos.flatMap((f) => (f.photoFile ? [f.photoFile] : []));
    if (arquivos.length === 0) return;
    if (this.media) await this.media.discard(arquivos);
    else
      await this.prisma.mediaFile.deleteMany({ where: { id: { in: arquivos.map((a) => a.id) } } });
  }

  /** Saiu da comunidade (ou foi removido): as fotos de prova dela ali saem na hora. */
  async afterMembershipEnded(membershipId: string): Promise<void> {
    await this.discardPhotos({ participant: { membershipId } });
  }

  // ---------------------------------------------------------------- apoio

  async member(
    userId: string,
    groupId: string,
    action: 'challenge.join' | 'challenge.manage' | 'challenge.review',
  ) {
    const role = await requireContentRole(
      this.prisma,
      userId,
      groupId,
      action,
      action === 'challenge.manage'
        ? 'Seu papel não cria desafios nesta comunidade'
        : action === 'challenge.review'
          ? 'Seu papel não revisa check-ins nesta comunidade'
          : 'Seu papel não participa de desafios',
    );
    const m = await this.prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, displayName: true, user: { select: COMMUNITY_NAME_USER_SELECT } },
    });
    // O nome no ranking é o da comunidade, senão o do perfil (`communityName`).
    return { role, membershipId: m.id, name: communityName(m) };
  }

  /** Sempre pelo par da URL: id de desafio de outra comunidade é 404. */
  async find(groupId: string, challengeId: string): Promise<Row> {
    const row = await this.prisma.groupChallenge.findFirst({
      where: { id: challengeId, groupId },
      include: { _count: { select: { participants: { where: ATIVOS } } } },
    });
    if (!row) throw new NotFoundException('Desafio não encontrado');
    return row;
  }

  private window(input: ChallengeInput, timezone: string) {
    const hoje = todayInTz(timezone);
    if (input.startDate < hoje)
      throw new BadRequestException('O desafio não pode começar no passado');
    if (input.endDate < input.startDate) {
      throw new BadRequestException('O fim tem de ser no mesmo dia do início ou depois');
    }
    if (addDaysIso(input.startDate, CHALLENGE_MAX_DAYS - 1) < input.endDate) {
      throw new BadRequestException(`Um desafio dura no máximo ${CHALLENGE_MAX_DAYS} dias`);
    }
    return {
      startsAt: dayBoundsInTz(input.startDate, timezone).start,
      endsAt: dayBoundsInTz(input.endDate, timezone).end,
    };
  }

  private view(
    row: Row,
    now: Date,
    role: GroupRole,
    userId: string,
    meu: {
      displayName: string;
      score: number;
      finalRank: number | null;
      streak: number;
    } | null,
    scores: readonly number[],
    extra: { watching: boolean; pendingReview: number },
  ): ChallengeView {
    const status = statusOf(row, now);
    const rank =
      !meu || status === 'upcoming'
        ? null
        : status === 'ended'
          ? (meu.finalRank ?? rankOf(meu.score, scores))
          : rankOf(meu.score, scores);
    const { first, last } = windowDays(row);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.kind as ChallengeKindName,
      metric: row.metric,
      startDate: first,
      endDate: last,
      totalDays: countDays(first, last),
      status,
      endedEarly: row.endedEarlyAt !== null,
      resultPending: status === 'ended' && row.finalizedAt === null,
      participants: row._count.participants,
      rules: rulesOf(row),
      needsPhotoConsent: usesPhotoCheckin(row),
      watching: extra.watching,
      canManage: can(role, 'challenge.manage') && canEditContent(role, userId, row.authorId),
      canReview: can(role, 'challenge.review'),
      me: meu
        ? {
            displayName: meu.displayName,
            score: meu.score,
            rank,
            medal: status === 'ended' && row.finalizedAt ? medalOf(rank, meu.score) : null,
            streak: meu.streak,
            pendingReview: extra.pendingReview,
          }
        : null,
    };
  }
}

/** A fila "Para revisar" tem teto por desafio (ADR 047). */
export const REVIEW_QUEUE_MAX = 50;

type Scored = {
  participantId: string;
  score: number;
  streak: number;
  days: Map<string, { points: number; parts: Set<DayPart> }> | null;
};

/** Só quem ainda está na comunidade conta no placar. */
const ATIVOS = { membership: { status: MembershipStatus.ACTIVE } } as const;

/** Retrato do treino no check-in: início, fim e quantas séries. */
export function workoutFingerprint(s: {
  startedAt: Date;
  completedAt: Date | null;
  _count: { sets: number };
}): string {
  return `${s.startedAt.toISOString()}|${s.completedAt?.toISOString() ?? ''}|${s._count.sets}`;
}

export function rulesOf(row: GroupChallenge): ChallengeRules {
  const kind = row.kind as ChallengeKindName;
  const agua = kind === 'WATER' || kind === 'POINTS';
  const passos = kind === 'STEPS' || kind === 'POINTS';
  return {
    waterGoalMl: agua ? (row.waterGoalMl ?? DEFAULT_WATER_GOAL_ML) : null,
    stepsGoal: passos ? (row.stepsGoal ?? DEFAULT_STEPS_GOAL) : null,
    dailyCap: agua ? (row.dailyCap ?? DEFAULT_DAILY_CAP_ML) : null,
    allowedStepSources: passos ? row.allowedStepSources : [],
    pointsTable: kind === 'POINTS' ? parsePointsTable(row.pointsTable) : null,
    maxPointsPerDay: kind === 'POINTS' ? (row.maxPointsPerDay ?? DEFAULT_MAX_POINTS_PER_DAY) : null,
    checkin: usesPhotoCheckin(row)
      ? { minWorkoutMinutes: MIN_WORKOUT_MINUTES, windowHours: CHECKIN_WINDOW_HOURS }
      : null,
  };
}

const intEntre = (v: number | null | undefined, min: number, max: number, campo: string) => {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new BadRequestException(`${campo} deve ser um inteiro de ${min} a ${max}`);
  }
  return v;
};

/**
 * As regras do tipo, conferidas e normalizadas: o que não é do tipo fica nulo.
 * Nunca peso nem medida; nutrição só como dia na própria meta; passos à mão
 * nunca contam.
 */
/** Se as regras contam passos: o tipo de passos ou o item de passos nos pontos. */
function rulesUseSteps(r: {
  kind: string;
  metric: ChallengeMetric;
  pointsTable: Prisma.JsonValue | Prisma.InputJsonValue | typeof Prisma.DbNull | null;
}): boolean {
  if (r.kind === 'STEPS' || r.metric === 'STEPS') return true;
  if (r.kind !== 'POINTS' || r.pointsTable === null || r.pointsTable === Prisma.DbNull) {
    return false;
  }
  return (parsePointsTable(r.pointsTable as Prisma.JsonValue).steps ?? 0) > 0;
}

/**
 * Passos fechados até a sync de saúde (ADR 047 §7): não nasce desafio que conte
 * passos. Quem já contava (`jaUsava`) segue contando ao ser editado.
 */
function assertStepsOpen(regras: ReturnType<typeof normalizeRules>, jaUsava: boolean) {
  if (STEPS_SYNC_AVAILABLE || jaUsava) return;
  if (rulesUseSteps(regras)) throw new BadRequestException(STEPS_CLOSED_MESSAGE);
}

/** As regras de um desafio antigo de ml ou passos, como estão (#395 M8). */
function legacyRules(row: GroupChallenge): ReturnType<typeof normalizeRules> {
  return {
    kind: 'METRIC',
    metric: row.metric,
    pointsTable: Prisma.DbNull as Prisma.InputJsonValue | typeof Prisma.DbNull,
    maxPointsPerDay: null,
    waterGoalMl: null,
    stepsGoal: null,
    dailyCap: null,
    allowedStepSources: [],
  };
}

export function normalizeRules(input: ChallengeInput) {
  const kind: ChallengeKindName = input.kind ?? 'METRIC';
  const vazio = {
    pointsTable: Prisma.DbNull as Prisma.InputJsonValue | typeof Prisma.DbNull,
    maxPointsPerDay: null as number | null,
    waterGoalMl: null as number | null,
    stepsGoal: null as number | null,
    dailyCap: null as number | null,
    allowedStepSources: [] as StepSource[],
  };
  const agua = () => {
    const goal = intEntre(input.waterGoalMl, 500, 6000, 'waterGoalMl') ?? DEFAULT_WATER_GOAL_ML;
    const cap = intEntre(input.dailyCap, 1000, 8000, 'dailyCap') ?? DEFAULT_DAILY_CAP_ML;
    if (cap < goal) throw new BadRequestException('O teto do dia não pode ser menor que a meta');
    return { waterGoalMl: goal, dailyCap: cap };
  };
  const passos = () => {
    const fontes = input.allowedStepSources ?? [];
    if (fontes.includes('MANUAL')) {
      throw new BadRequestException('Passos digitados à mão nunca contam em desafio');
    }
    return {
      stepsGoal: intEntre(input.stepsGoal, 1000, 50_000, 'stepsGoal') ?? DEFAULT_STEPS_GOAL,
      allowedStepSources: [...new Set(fontes)],
    };
  };
  switch (kind) {
    case 'METRIC': {
      const metric = input.metric;
      if (!metric || !(METRIC_KIND_METRICS as readonly string[]).includes(metric)) {
        throw new BadRequestException(
          'Escolha treinos, dias ativos ou sequência; água, passos e nutrição têm tipo próprio',
        );
      }
      return { kind, metric, ...vazio };
    }
    case 'PHOTO':
      return { kind, metric: 'WORKOUT_SESSIONS' as ChallengeMetric, ...vazio };
    case 'WATER':
      return { kind, metric: 'WATER_ML' as ChallengeMetric, ...vazio, ...agua() };
    case 'STEPS':
      return { kind, metric: 'STEPS' as ChallengeMetric, ...vazio, ...passos() };
    case 'NUTRITION': {
      const metric = input.metric ?? 'PROTEIN_TARGET_DAYS';
      if (!(NUTRITION_METRICS as readonly string[]).includes(metric)) {
        throw new BadRequestException(
          'Desafio de nutrição conta dias na proteína ou na faixa de calorias da própria meta',
        );
      }
      return { kind, metric, ...vazio };
    }
    case 'POINTS': {
      const bruto = input.pointsTable ?? {};
      for (const [item, v] of Object.entries(bruto)) {
        if (!(POINT_ITEMS as readonly string[]).includes(item)) {
          throw new BadRequestException(`Item de pontos desconhecido: ${item}`);
        }
        if (v !== undefined && (!Number.isInteger(v) || v < 0 || v > POINT_VALUE_MAX)) {
          throw new BadRequestException(`Cada item vale de 0 a ${POINT_VALUE_MAX} pontos`);
        }
      }
      const tabela = parsePointsTable(bruto);
      if (Object.keys(tabela).length === 0) {
        throw new BadRequestException('A tabela de pontos precisa de pelo menos um item');
      }
      return {
        kind,
        metric: 'ACTIVE_DAYS' as ChallengeMetric,
        ...vazio,
        pointsTable: tabela as Prisma.InputJsonValue,
        maxPointsPerDay:
          intEntre(input.maxPointsPerDay, 1, 25, 'maxPointsPerDay') ?? DEFAULT_MAX_POINTS_PER_DAY,
        ...(tabela.water ? agua() : {}),
        ...(tabela.steps ? passos() : {}),
      };
    }
    default: {
      const naoTratado: never = kind;
      throw new BadRequestException(`Tipo de desafio desconhecido: ${String(naoTratado)}`);
    }
  }
}

export function statusOf(
  row: Pick<GroupChallenge, 'startsAt' | 'endsAt'>,
  now: Date,
): ChallengeStatus {
  if (now < row.startsAt) return 'upcoming';
  if (now >= row.endsAt) return 'ended';
  return 'running';
}
