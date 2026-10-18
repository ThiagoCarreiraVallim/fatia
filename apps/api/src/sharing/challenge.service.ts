import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  MembershipStatus,
  type ChallengeMetric,
  type GroupChallenge,
  type GroupRole,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { addDaysIso, dateInTz, dayBoundsInTz, todayInTz } from '../progress/helpers/date-tz';
import {
  buildScoreboard,
  ScoreboardService,
  type ScoreboardEntry,
} from '../social/scoreboard.service';
import { assertCanEditContent, canEditContent, requireContentRole } from './content-roles';
import { can } from './permissions';

export const CHALLENGE_TITLE_MIN = 3;
export const CHALLENGE_TITLE_MAX = 80;
export const CHALLENGE_DESCRIPTION_MAX = 1000;
/** Desafio é campanha, não estado permanente: até 90 dias. */
export const CHALLENGE_MAX_DAYS = 90;
/** Desafios marcados ou em andamento ao mesmo tempo, por comunidade. */
export const CHALLENGE_MAX_OPEN = 10;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;
/** O apelido sai para os outros participantes: uma linha, sem caractere de controle. */
export const DISPLAY_NAME_PATTERN = /^[^\p{Cc}<>]+$/u;
/** Placar mais velho que isto é recalculado na leitura. */
export const SCORE_TTL_MS = 5 * 60_000;
const FINALIZE_INTERVAL_MS = 60 * 60_000;

export type ChallengeStatus = 'upcoming' | 'running' | 'ended';
export type Medal = 'gold' | 'silver' | 'bronze';

export interface ChallengeInput {
  title: string;
  description?: string | null;
  metric: ChallengeMetric;
  /** YYYY-MM-DD no fuso da comunidade, inclusivos. */
  startDate: string;
  endDate: string;
}

export interface MyParticipation {
  displayName: string;
  score: number;
  /** Nulo para quem ainda não tem posição (desafio marcado). */
  rank: number | null;
  medal: Medal | null;
}

export interface ChallengeView {
  id: string;
  title: string;
  description: string | null;
  metric: ChallengeMetric;
  startDate: string;
  endDate: string;
  status: ChallengeStatus;
  endedEarly: boolean;
  participants: number;
  /** Quem criou pode editar e encerrar; quem modera também. */
  canManage: boolean;
  me: MyParticipation | null;
}

export interface ChallengeList {
  /** Hoje no fuso da comunidade: o primeiro dia que um desafio novo pode ter. */
  today: string;
  challenges: ChallengeView[];
}

export interface ChallengeDetail extends ChallengeView {
  /**
   * Só para quem participa (ADR 027 §5): quem não entrou recebe `null`, e a
   * tela convida a entrar.
   */
  leaderboard: Array<ScoreboardEntry & { medal: Medal | null }> | null;
  /** O apelido sugerido para entrar: o da comunidade, ou o primeiro nome. */
  suggestedDisplayName: string;
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

/**
 * Desafios da comunidade (Fase 8a, ADR 027).
 *
 * A equipe (`challenge.manage`) marca e encerra; o membro ativo
 * (`challenge.join`) entra com um apelido e vê o ranking — só quem entrou vê. O
 * placar é calculado por `ScoreboardService` (`social/`), que nunca recebe nada
 * além de quem participa deste desafio: os participantes saem sempre de uma
 * consulta que parte do desafio da URL.
 */
@Injectable()
export class ChallengeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChallengeService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreboard: ScoreboardService,
  ) {}

  onModuleInit(): void {
    const run = () =>
      void this.finalizeDue(new Date()).catch((err: unknown) =>
        this.logger.warn(
          `Encerramento de desafios falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.timer = setInterval(run, FINALIZE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
    const minhas = await this.prisma.groupChallengeParticipant.findMany({
      where: { membershipId, challengeId: { in: rows.map((r) => r.id) } },
    });
    const views: ChallengeView[] = [];
    for (const r of rows) {
      const p = minhas.find((m) => m.challengeId === r.id) ?? null;
      const scores = p ? await this.scoresOf(r.id) : [];
      views.push(this.view(r, now, role, userId, p, scores));
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

  async get(
    userId: string,
    groupId: string,
    challengeId: string,
    now = new Date(),
  ): Promise<ChallengeDetail> {
    const { role, membershipId, displayName, userName } = await this.member(
      userId,
      groupId,
      'challenge.join',
    );
    const row = await this.find(groupId, challengeId);
    await this.refresh(row, now);
    const linhas = await this.prisma.groupChallengeParticipant.findMany({
      where: { challengeId: row.id, ...ATIVOS },
      select: { membershipId: true, displayName: true, score: true, finalRank: true },
    });
    const meu = linhas.find((l) => l.membershipId === membershipId) ?? null;
    const scores = linhas.map((l) => l.score);
    const atual = await this.find(groupId, challengeId);
    const view = this.view(atual, now, role, userId, meu, scores);
    return {
      ...view,
      leaderboard: meu ? this.leaderboard(view.status, linhas, membershipId) : null,
      suggestedDisplayName: displayName ?? firstName(userName),
    };
  }

  async join(
    userId: string,
    groupId: string,
    challengeId: string,
    displayName: string | undefined,
    now = new Date(),
  ): Promise<ChallengeDetail> {
    const m = await this.member(userId, groupId, 'challenge.join');
    const row = await this.find(groupId, challengeId);
    if (statusOf(row, now) === 'ended') throw new ConflictException('Este desafio já terminou');
    const nome = cleanDisplayName(displayName ?? m.displayName ?? firstName(m.userName));
    await this.prisma.$transaction([
      this.prisma.groupChallengeParticipant.upsert({
        where: { challengeId_membershipId: { challengeId: row.id, membershipId: m.membershipId } },
        create: { challengeId: row.id, membershipId: m.membershipId, displayName: nome },
        update: { displayName: nome },
      }),
      // O apelido vale para a comunidade: o próximo desafio já sugere este.
      this.prisma.groupMembership.update({
        where: { id: m.membershipId },
        data: { displayName: nome },
      }),
      // Placar velho de propósito: quem entrou aparece com a pontuação certa já
      // na próxima leitura.
      this.prisma.groupChallenge.update({ where: { id: row.id }, data: { scoredAt: null } }),
    ]);
    return this.get(userId, groupId, challengeId, now);
  }

  async leave(userId: string, groupId: string, challengeId: string, now = new Date()) {
    const m = await this.member(userId, groupId, 'challenge.join');
    const row = await this.find(groupId, challengeId);
    // Encerrado, o resultado é história: sair não apaga a colocação de ninguém.
    if (statusOf(row, now) === 'ended') throw new ConflictException('Este desafio já terminou');
    await this.prisma.groupChallengeParticipant.deleteMany({
      where: { challengeId: row.id, membershipId: m.membershipId },
    });
    return { left: true };
  }

  // ---------------------------------------------------------------- equipe

  async create(userId: string, groupId: string, input: ChallengeInput, now = new Date()) {
    await this.member(userId, groupId, 'challenge.manage');
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { timezone: true },
    });
    const janela = this.window(input, group.timezone);
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
        metric: input.metric,
        timezone: group.timezone,
        ...janela,
      },
    });
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
    await this.prisma.groupChallenge.update({
      where: { id: row.id },
      data: {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        metric: input.metric,
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
    await this.finalize(row.id, now);
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
   * fecha; as outras desistem.
   */
  async finalizeDue(now = new Date()): Promise<number> {
    const vencidos = await this.prisma.groupChallenge.findMany({
      where: { finalizedAt: null, endsAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    let fechados = 0;
    for (const v of vencidos) if (await this.finalize(v.id, now)) fechados += 1;
    return fechados;
  }

  private async finalize(challengeId: string, now: Date): Promise<boolean> {
    const claim = await this.prisma.groupChallenge.updateMany({
      where: { id: challengeId, finalizedAt: null, endsAt: { lte: now } },
      data: { finalizedAt: now },
    });
    if (claim.count === 0) return false;
    const row = await this.prisma.groupChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    const pontos = await this.score(row);
    const scores = pontos.map((p) => p.score);
    await this.prisma.$transaction([
      ...pontos.map((p) =>
        this.prisma.groupChallengeParticipant.update({
          where: { id: p.participantId },
          data: { score: p.score, finalRank: rankOf(p.score, scores) },
        }),
      ),
      this.prisma.groupChallenge.update({ where: { id: row.id }, data: { scoredAt: now } }),
    ]);
    return true;
  }

  /**
   * Recalcula o placar de um desafio em andamento quando ele está velho. O
   * encerrado que ninguém fechou ainda (o intervalo é de hora em hora) fecha
   * aqui, na primeira leitura.
   */
  private async refresh(row: GroupChallenge, now: Date): Promise<void> {
    const status = statusOf(row, now);
    if (status === 'upcoming') return;
    if (status === 'ended') {
      if (!row.finalizedAt) await this.finalize(row.id, now);
      return;
    }
    if (row.scoredAt && now.getTime() - row.scoredAt.getTime() < SCORE_TTL_MS) return;
    const pontos = await this.score(row);
    await this.prisma.$transaction([
      ...pontos.map((p) =>
        this.prisma.groupChallengeParticipant.update({
          where: { id: p.participantId },
          data: { score: p.score },
        }),
      ),
      this.prisma.groupChallenge.update({ where: { id: row.id }, data: { scoredAt: now } }),
    ]);
  }

  /**
   * Os participantes saem DESTE desafio, com o `userId` lido da associação —
   * a pré-condição de `ScoreboardService.recompute`. Quem saiu da comunidade
   * não pontua nem aparece.
   */
  private async score(row: GroupChallenge) {
    const participantes = await this.prisma.groupChallengeParticipant.findMany({
      where: { challengeId: row.id, ...ATIVOS },
      select: {
        id: true,
        membershipId: true,
        membership: { select: { userId: true, user: { select: { timezone: true } } } },
      },
    });
    const pontos = await this.scoreboard.recompute(
      { metric: row.metric, startsAt: row.startsAt, endsAt: row.endsAt, timezone: row.timezone },
      participantes.map((p) => ({
        membershipId: p.membershipId,
        userId: p.membership.userId,
        timezone: p.membership.user.timezone,
      })),
    );
    const porMembro = new Map(pontos.map((p) => [p.membershipId, p.score]));
    return participantes.map((p) => ({
      participantId: p.id,
      score: porMembro.get(p.membershipId) ?? 0,
    }));
  }

  /**
   * O ranking como sai: encerrado, vale a posição gravada ao fechar (a medalha
   * não muda se alguém sai da comunidade depois); antes, a posição de agora.
   */
  private leaderboard(
    status: ChallengeStatus,
    linhas: ReadonlyArray<{
      membershipId: string;
      displayName: string;
      score: number;
      finalRank: number | null;
    }>,
    membershipId: string,
  ): Array<ScoreboardEntry & { medal: Medal | null }> {
    const placar = buildScoreboard(
      linhas.map((l) => ({
        displayName: l.displayName,
        score: l.score,
        isMe: l.membershipId === membershipId,
      })),
    );
    if (status !== 'ended') return placar.map((e) => ({ ...e, medal: null }));
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

  private async scoresOf(challengeId: string): Promise<number[]> {
    const linhas = await this.prisma.groupChallengeParticipant.findMany({
      where: { challengeId, ...ATIVOS },
      select: { score: true },
    });
    return linhas.map((l) => l.score);
  }

  // ---------------------------------------------------------------- apoio

  private async member(
    userId: string,
    groupId: string,
    action: 'challenge.join' | 'challenge.manage',
  ) {
    const role = await requireContentRole(
      this.prisma,
      userId,
      groupId,
      action,
      action === 'challenge.manage'
        ? 'Seu papel não cria desafios nesta comunidade'
        : 'Seu papel não participa de desafios',
    );
    const m = await this.prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, displayName: true, user: { select: { name: true } } },
    });
    return { role, membershipId: m.id, displayName: m.displayName, userName: m.user.name };
  }

  /** Sempre pelo par da URL: id de desafio de outra comunidade é 404. */
  private async find(groupId: string, challengeId: string): Promise<Row> {
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
    meu: { displayName: string; score: number; finalRank: number | null } | null,
    scores: readonly number[],
  ): ChallengeView {
    const status = statusOf(row, now);
    const rank =
      !meu || status === 'upcoming'
        ? null
        : status === 'ended'
          ? (meu.finalRank ?? rankOf(meu.score, scores))
          : rankOf(meu.score, scores);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      metric: row.metric,
      startDate: dateInTz(row.startsAt, row.timezone),
      endDate: dateInTz(new Date(row.endsAt.getTime() - 1), row.timezone),
      status,
      endedEarly: row.endedEarlyAt !== null,
      participants: row._count.participants,
      canManage: can(role, 'challenge.manage') && canEditContent(role, userId, row.authorId),
      me: meu
        ? {
            displayName: meu.displayName,
            score: meu.score,
            rank,
            medal: status === 'ended' ? medalOf(rank, meu.score) : null,
          }
        : null,
    };
  }
}

/** Só quem ainda está na comunidade conta no placar. */
const ATIVOS = { membership: { status: MembershipStatus.ACTIVE } } as const;

export function statusOf(
  row: Pick<GroupChallenge, 'startsAt' | 'endsAt'>,
  now: Date,
): ChallengeStatus {
  if (now < row.startsAt) return 'upcoming';
  if (now >= row.endsAt) return 'ended';
  return 'running';
}

export function cleanDisplayName(raw: string): string {
  const nome = raw.trim().replace(/\s+/g, ' ');
  if (nome.length < DISPLAY_NAME_MIN || nome.length > DISPLAY_NAME_MAX) {
    throw new BadRequestException(
      `O apelido precisa ter de ${DISPLAY_NAME_MIN} a ${DISPLAY_NAME_MAX} caracteres`,
    );
  }
  if (!DISPLAY_NAME_PATTERN.test(nome)) {
    throw new BadRequestException('O apelido não pode ter quebra de linha nem < ou >');
  }
  return nome;
}

function firstName(name: string): string {
  const primeiro = name.trim().split(/\s+/)[0] ?? '';
  return primeiro.length >= DISPLAY_NAME_MIN ? primeiro.slice(0, DISPLAY_NAME_MAX) : 'Participante';
}
