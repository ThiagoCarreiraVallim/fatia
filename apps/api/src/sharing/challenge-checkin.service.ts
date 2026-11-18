import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChallengeCheckinStatus,
  ChallengeCheckinType,
  ChallengeFlagSource,
  MediaStatus,
  MembershipStatus,
  Prisma,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { dateInTz } from '../progress/helpers/date-tz';
import { MediaService } from '../storage/media.service';
import {
  CHECKIN_WINDOW_HOURS,
  ChallengeService,
  MIN_WORKOUT_MINUTES,
  REVIEW_QUEUE_MAX,
  statusOf,
  usesPhotoCheckin,
  workoutFingerprint,
  type ChallengeDetail,
} from './challenge.service';
import { checkinVoidedNotice } from './community-notices';

/** "Não parece válido" por pessoa, a cada 24 h (ADR 047): sinalizar não vira arma. */
export const MEMBER_FLAGS_PER_DAY = 3;
/** Folga entre gravar a sessão e terminá-la: o relógio do aparelho e o do servidor. */
const LATE_LOG_SLACK_MS = 60_000;

/** Por que o check-in não conta agora (Cm-18: `curto`, `jafez`, `semtreino`). */
export type CheckinBlock =
  | 'not_participant'
  | 'not_running'
  | 'no_photo_checkin'
  | 'no_workout'
  | 'too_short'
  | 'late_logged'
  | 'already_today'
  /** Este treino já liberou um check-in neste desafio (#395 B2). */
  | 'workout_used';

export interface CheckinWorkout {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  sets: number;
  /** Até quando o check-in deste treino vale. */
  deadline: string;
}

export interface CheckinEligibility {
  eligible: boolean;
  reason: CheckinBlock | null;
  workout: CheckinWorkout | null;
  /** O check-in de hoje, quando já houve (`already_today`). */
  checkedInAt: string | null;
  rules: { minWorkoutMinutes: number; windowHours: number };
}

export interface ReviewItem {
  id: string;
  challengeId: string;
  challengeTitle: string;
  challengeKind: string;
  type: 'photo' | 'water' | 'steps';
  displayName: string;
  date: string;
  capturedAt: string | null;
  source: 'system' | 'member';
  /** Motivo da regra, ou "sinalizado por N participantes". Sem número de ninguém. */
  why: string | null;
  flags: number;
  /** A foto de prova: só aqui, para a equipe que revisa (ADR 044). */
  photoUrl: string | null;
  caption: string | null;
  /** O check-in veio de um treino de pelo menos 20 min registrado no app. */
  workoutLinked: boolean;
  /** Quanto o item vale enquanto espera ("treino +3"). */
  points: number;
}

export interface ReviewQueue {
  items: ReviewItem[];
  /** Quantos esperam ao todo (todas as páginas). */
  open: number;
  /** O teto de sinalizações de membros abertas por desafio. */
  limit: number;
  /** A próxima página da fila (#395 M5); nulo quando acabou. */
  nextCursor: string | null;
}

const NOME_DO_TREINO = (s: { planName: string | null; fromPlan: boolean }) =>
  s.planName ?? (s.fromPlan ? 'Treino do plano' : 'Treino livre');

/**
 * Check-in com foto, sinalização e fila de revisão dos desafios (#395, ADR 044 e
 * 047).
 *
 * - O check-in nasce **válido** quando as regras do servidor passam: a foto foi
 *   enviada pela própria pessoa para este propósito e ainda não serviu, o treino
 *   é dela, terminou há até 2 h, durou 20 min ou mais e foi gravado antes de
 *   terminar, e é o primeiro do dia. O carimbo é do servidor.
 * - Participante sinaliza "Não parece válido" sem ver a foto; o item vai para a
 *   fila e não conta até a equipe decidir. A fila tem teto e cada pessoa
 *   sinaliza no máximo 3 por dia.
 * - A equipe (`challenge.review`) vê a foto e decide; anular manda o motivo à
 *   pessoa e apaga a foto na hora.
 *
 * Todo id que chega pelo corpo ou pela URL é amarrado ao pai: o check-in ao
 * desafio da URL, o desafio à comunidade da URL, a foto e o treino a quem pede.
 */
@Injectable()
export class ChallengeCheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengeService,
    private readonly media: MediaService,
    private readonly notifications: NotificationService,
  ) {}

  /** O que a câmera mostra antes da foto (Cm-18): o treino que libera, ou por que não. */
  async eligibility(
    userId: string,
    groupId: string,
    challengeId: string,
    workoutSessionId?: string,
    now = new Date(),
  ): Promise<CheckinEligibility> {
    const ctx = await this.context(userId, groupId, challengeId);
    return this.evaluate(ctx, workoutSessionId, now);
  }

  async create(
    userId: string,
    groupId: string,
    challengeId: string,
    input: { photoFileId: string; workoutSessionId?: string; caption?: string },
    now = new Date(),
  ): Promise<ChallengeDetail> {
    const ctx = await this.context(userId, groupId, challengeId);
    const e = await this.evaluate(ctx, input.workoutSessionId, now);
    if (!e.eligible)
      throw new ConflictException({ message: blockMessage(e.reason), code: e.reason });

    // A foto: desta pessoa, desta comunidade, para check-in, ainda sem uso. A
    // de outra pessoa (ou de outro propósito) responde como inexistente.
    const foto = await this.prisma.mediaFile.findFirst({
      where: {
        id: input.photoFileId,
        uploaderId: userId,
        groupId,
        purpose: 'challenge_checkin',
        checkinPhotoOf: { is: null },
      },
    });
    if (!foto) throw new NotFoundException('Foto não encontrada');
    const pronta = foto.status === MediaStatus.READY ? foto : await this.confirmed(userId, foto.id);
    const hash = await this.media.sha256Of(pronta);
    if (hash) {
      const repetida = await this.prisma.challengeCheckin.findFirst({
        where: { photoHash: hash, participant: { challengeId: ctx.challenge.id } },
        select: { id: true },
      });
      if (repetida) {
        await this.media.discard([pronta]);
        throw new ConflictException({
          message: 'Esta foto já foi usada neste desafio. Tire uma foto nova.',
          code: 'photo_reused',
        });
      }
    }

    const sessao = await this.prisma.workoutSession.findUniqueOrThrow({
      where: { id: e.workout!.id },
      select: {
        startedAt: true,
        completedAt: true,
        createdAt: true,
        _count: { select: { sets: true } },
      },
    });
    // A foto tem de ser deste treino (#395 M4): pedida depois de a sessão abrir.
    if (pronta.createdAt < sessao.createdAt) {
      throw new ConflictException({
        message: 'Esta foto é de antes do treino. Tire uma foto nova.',
        code: 'photo_before_workout',
      });
    }
    try {
      await this.prisma.challengeCheckin.create({
        data: {
          participantId: ctx.participant!.id,
          type: ChallengeCheckinType.PHOTO,
          date: dateInTz(now, ctx.timezone),
          workoutSessionId: e.workout!.id,
          workoutFingerprint: workoutFingerprint(sessao),
          photoFileId: pronta.id,
          photoHash: hash,
          capturedAt: now,
          caption: input.caption?.trim() || null,
        },
      });
    } catch (err) {
      // Dois toques ao mesmo tempo: os índices únicos (pessoa, tipo, dia) e
      // (pessoa, treino) seguram.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const alvo = JSON.stringify(err.meta?.target ?? '');
        const code: CheckinBlock = alvo.includes('workoutSessionId')
          ? 'workout_used'
          : 'already_today';
        throw new ConflictException({ message: blockMessage(code), code });
      }
      throw err;
    }
    await this.prisma.groupChallenge.update({
      where: { id: ctx.challenge.id },
      data: { scoredAt: null },
    });
    return this.challenges.get(userId, groupId, challengeId, now);
  }

  /**
   * "Não parece válido" (Cm-17): quem participa, sem ver a foto, no check-in de
   * outra pessoa, com o desafio em andamento (#395 I5).
   *
   * A resposta é sempre a mesma (#395 M3): quem sinaliza não fica sabendo se o
   * check-in já foi anulado, revisado ou se a fila de membros encheu. A
   * sinalização fica guardada (e conta no limite de 3 por 24 h); o check-in só
   * vai para a fila se ainda vale, não foi revisado e cabe no teto de
   * sinalizações de membros. Limite e teto são conferidos sob trava (#395 M2).
   */
  async flag(
    userId: string,
    groupId: string,
    challengeId: string,
    checkinId: string,
    now = new Date(),
  ): Promise<{ flagged: true }> {
    const ctx = await this.context(userId, groupId, challengeId);
    if (!ctx.participant) {
      throw new ConflictException('Só quem participa do desafio sinaliza check-in');
    }
    if (statusOf(ctx.challenge, now) !== 'running') {
      throw new ConflictException('Só dá para sinalizar enquanto o desafio está em andamento');
    }
    const alvo = await this.prisma.challengeCheckin.findFirst({
      where: {
        id: checkinId,
        type: ChallengeCheckinType.PHOTO,
        participant: {
          challengeId: ctx.challenge.id,
          membership: { status: MembershipStatus.ACTIVE },
        },
      },
      select: { id: true, participantId: true },
    });
    if (!alvo) throw new NotFoundException('Check-in não encontrado');
    if (alvo.participantId === ctx.participant.id) {
      throw new BadRequestException('Não dá para sinalizar o próprio check-in');
    }
    const neutro = { flagged: true } as const;
    const mudou = await this.prisma.$transaction(async (tx) => {
      // Mesma ordem sempre (pessoa, depois desafio): duas travas sem deadlock.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`challenge-flag:${ctx.membershipId}`}))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`challenge-queue:${ctx.challenge.id}`}))::text`;
      const jaFiz = await tx.challengeCheckinFlag.findUnique({
        where: { checkinId_membershipId: { checkinId, membershipId: ctx.membershipId } },
      });
      if (jaFiz) return false;
      const nas24h = await tx.challengeCheckinFlag.count({
        where: {
          membershipId: ctx.membershipId,
          createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
      });
      if (nas24h >= MEMBER_FLAGS_PER_DAY) {
        throw new HttpException(
          `Você já sinalizou ${MEMBER_FLAGS_PER_DAY} check-ins nas últimas 24 h. A equipe já está olhando.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await tx.challengeCheckinFlag.create({
        data: { checkinId, membershipId: ctx.membershipId, createdAt: now },
      });
      const checkin = await tx.challengeCheckin.findUniqueOrThrow({
        where: { id: checkinId },
        select: { status: true, reviewedAt: true, flagSource: true },
      });
      const total = await tx.challengeCheckinFlag.count({ where: { checkinId } });
      const motivo = `Sinalizado por ${total} participante${total > 1 ? 's' : ''}`;
      if (checkin.status === ChallengeCheckinStatus.FLAGGED) {
        // Já na fila: a contagem atualiza o motivo se ele era de membro.
        if (checkin.flagSource === ChallengeFlagSource.MEMBER) {
          await tx.challengeCheckin.update({
            where: { id: checkinId },
            data: { flagReason: motivo },
          });
        }
        return false;
      }
      if (checkin.status !== ChallengeCheckinStatus.VALID || checkin.reviewedAt !== null) {
        return false;
      }
      // O teto vale só para o que membros puseram na fila (#395 I6).
      const deMembros = await tx.challengeCheckin.count({
        where: {
          participant: { challengeId: ctx.challenge.id },
          status: ChallengeCheckinStatus.FLAGGED,
          flagSource: ChallengeFlagSource.MEMBER,
        },
      });
      if (deMembros >= REVIEW_QUEUE_MAX) return false;
      await tx.challengeCheckin.update({
        where: { id: checkinId },
        data: {
          status: ChallengeCheckinStatus.FLAGGED,
          flagSource: ChallengeFlagSource.MEMBER,
          flagReason: motivo,
          flaggedAt: now,
        },
      });
      return true;
    });
    if (mudou) {
      await this.prisma.groupChallenge.update({
        where: { id: ctx.challenge.id },
        data: { scoredAt: null },
      });
    }
    return neutro;
  }

  /**
   * A fila "Para revisar" (Pn-13): os itens sinalizados dos desafios da
   * comunidade que ainda não fecharam. Só a equipe (`challenge.review`).
   */
  async queue(
    userId: string,
    groupId: string,
    challengeId?: string,
    cursor?: string,
  ): Promise<ReviewQueue> {
    await this.challenges.member(userId, groupId, 'challenge.review');
    if (challengeId) await this.challenges.find(groupId, challengeId);
    const where: Prisma.ChallengeCheckinWhereInput = {
      status: ChallengeCheckinStatus.FLAGGED,
      participant: {
        challenge: { groupId, finalizedAt: null, ...(challengeId ? { id: challengeId } : {}) },
        // Quem revisa não vê (nem decide) o próprio check-in (#395 I1).
        membership: { userId: { not: userId } },
      },
    };
    const [pagina, open] = await Promise.all([
      this.prisma.challengeCheckin.findMany({
        where,
        // Paginada (#395 M5): a fila da comunidade junta vários desafios e pode
        // passar do teto de um.
        orderBy: [{ flaggedAt: 'asc' }, { id: 'asc' }],
        take: REVIEW_QUEUE_MAX + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          photoFile: true,
          _count: { select: { flags: true } },
          participant: {
            select: {
              displayName: true,
              challenge: { select: { id: true, title: true, kind: true, pointsTable: true } },
            },
          },
        },
      }),
      this.prisma.challengeCheckin.count({ where }),
    ]);
    const linhas = pagina.slice(0, REVIEW_QUEUE_MAX);
    const nextCursor = pagina.length > REVIEW_QUEUE_MAX ? linhas.at(-1)!.id : null;
    const items: ReviewItem[] = [];
    for (const c of linhas) {
      const ch = c.participant.challenge;
      const tabela = (ch.pointsTable ?? {}) as Record<string, number>;
      const item = c.type === 'PHOTO' ? 'workout' : c.type === 'WATER' ? 'water' : 'steps';
      items.push({
        id: c.id,
        challengeId: ch.id,
        challengeTitle: ch.title,
        challengeKind: ch.kind,
        type: c.type === 'PHOTO' ? 'photo' : c.type === 'WATER' ? 'water' : 'steps',
        displayName: c.participant.displayName,
        date: c.date,
        capturedAt: c.type === 'PHOTO' ? c.capturedAt.toISOString() : null,
        source: c.flagSource === ChallengeFlagSource.MEMBER ? 'member' : 'system',
        why: c.flagReason,
        flags: c._count.flags,
        photoUrl: c.photoFile ? (await this.media.view(c.photoFile)).url : null,
        caption: c.caption,
        workoutLinked: c.workoutSessionId !== null,
        points: ch.kind === 'POINTS' ? (tabela[item] ?? 0) : 1,
      });
    }
    return { items, open, limit: REVIEW_QUEUE_MAX, nextCursor };
  }

  /**
   * "Vale" ou "Anular" (Pn-13). O item tem de estar na fila e pertencer ao
   * desafio da URL. Anular manda o motivo à pessoa e apaga a foto de prova na
   * hora (ADR 044 §3). Decidido o último item de um desafio encerrado, o pódio
   * sai.
   */
  async resolve(
    userId: string,
    groupId: string,
    challengeId: string,
    checkinId: string,
    input: { decision: 'valid' | 'void'; reason?: string },
    now = new Date(),
  ): Promise<{ id: string; status: 'valid' | 'voided' }> {
    await this.challenges.member(userId, groupId, 'challenge.review');
    const challenge = await this.challenges.find(groupId, challengeId);
    if (challenge.finalizedAt) throw new ConflictException('O resultado deste desafio já saiu');
    const checkin = await this.prisma.challengeCheckin.findFirst({
      where: { id: checkinId, participant: { challengeId: challenge.id } },
      include: {
        photoFile: { select: { id: true, key: true } },
        participant: { select: { membership: { select: { userId: true } } } },
      },
    });
    if (!checkin) throw new NotFoundException('Check-in não encontrado');
    if (checkin.participant.membership.userId === userId) {
      throw new ForbiddenException('Quem revisa não decide o próprio check-in');
    }
    if (checkin.status !== ChallengeCheckinStatus.FLAGGED) {
      throw new ConflictException('Este item não está esperando revisão');
    }
    const motivo = input.reason?.trim() ?? '';
    if (input.decision === 'void' && motivo.length < 3) {
      throw new BadRequestException('Anular pede o motivo, que vai para a pessoa');
    }
    const anulado = input.decision === 'void';
    // "Vale" aceita o treino como está agora (#395 I2): o retrato é regravado,
    // e a próxima conferência não devolve o item à fila pela mesma edição.
    const retrato =
      !anulado && checkin.workoutSessionId
        ? await this.prisma.workoutSession.findUnique({
            where: { id: checkin.workoutSessionId },
            select: { startedAt: true, completedAt: true, _count: { select: { sets: true } } },
          })
        : null;
    // Só decide quem chega primeiro (#395 M1): o `where` com o status fecha a corrida.
    const { count } = await this.prisma.challengeCheckin.updateMany({
      where: { id: checkin.id, status: ChallengeCheckinStatus.FLAGGED },
      data: {
        status: anulado ? ChallengeCheckinStatus.VOIDED : ChallengeCheckinStatus.VALID,
        reviewedById: userId,
        reviewedAt: now,
        reason: anulado ? motivo : null,
        // A foto anulada sai na decisão (ADR 044 §3); o `SetNull` solta a linha.
        ...(anulado ? { photoFileId: null } : {}),
        ...(!anulado && checkin.type === ChallengeCheckinType.PHOTO
          ? { workoutFingerprint: retrato ? workoutFingerprint(retrato) : null }
          : {}),
      },
    });
    if (count === 0) throw new ConflictException('Este item não está esperando revisão');
    if (anulado && checkin.photoFile) await this.media.discard([checkin.photoFile]);
    if (anulado) {
      this.notifications.notify(
        [checkin.participant.membership.userId],
        checkinVoidedNotice({
          groupId,
          challengeId: challenge.id,
          title: challenge.title,
          reason: motivo,
        }),
      );
    }
    await this.prisma.groupChallenge.update({
      where: { id: challenge.id },
      data: { scoredAt: null },
    });
    if (statusOf(challenge, now) === 'ended') await this.challenges.closeOrWait(challenge.id, now);
    return { id: checkin.id, status: anulado ? 'voided' : 'valid' };
  }

  // ---------------------------------------------------------------- apoio

  private async context(userId: string, groupId: string, challengeId: string) {
    const m = await this.challenges.member(userId, groupId, 'challenge.join');
    const challenge = await this.challenges.find(groupId, challengeId);
    const participant = await this.prisma.groupChallengeParticipant.findUnique({
      where: {
        challengeId_membershipId: { challengeId: challenge.id, membershipId: m.membershipId },
      },
      select: { id: true },
    });
    return {
      userId,
      membershipId: m.membershipId,
      challenge,
      participant,
      // O dia do check-in é o do desafio, não o da pessoa (#395 B2): trocar o
      // fuso do aparelho não abre um segundo dia.
      timezone: challenge.timezone,
    };
  }

  private async evaluate(
    ctx: Awaited<ReturnType<ChallengeCheckinService['context']>>,
    workoutSessionId: string | undefined,
    now: Date,
  ): Promise<CheckinEligibility> {
    const rules = { minWorkoutMinutes: MIN_WORKOUT_MINUTES, windowHours: CHECKIN_WINDOW_HOURS };
    const nao = (reason: CheckinBlock, extra: Partial<CheckinEligibility> = {}) => ({
      eligible: false,
      reason,
      workout: null,
      checkedInAt: null,
      rules,
      ...extra,
    });
    if (!usesPhotoCheckin(ctx.challenge)) return nao('no_photo_checkin');
    if (!ctx.participant) return nao('not_participant');
    if (statusOf(ctx.challenge, now) !== 'running') return nao('not_running');

    const hoje = dateInTz(now, ctx.timezone);
    const feito = await this.prisma.challengeCheckin.findUnique({
      where: {
        participantId_type_date: {
          participantId: ctx.participant.id,
          type: ChallengeCheckinType.PHOTO,
          date: hoje,
        },
      },
      select: { capturedAt: true },
    });

    // O treino: o pedido (se for da pessoa) ou o último que o servidor viu
    // terminar na janela. Tudo pelo relógio do servidor (#395 I3): `createdAt`
    // (abriu) e `serverCompletedAt` (fechou); o `startedAt` e o `completedAt`
    // vêm do aparelho.
    const desde = new Date(now.getTime() - CHECKIN_WINDOW_HOURS * 60 * 60_000);
    const sessao = await this.prisma.workoutSession.findFirst({
      where: {
        userId: ctx.userId,
        ...(workoutSessionId ? { id: workoutSessionId } : {}),
        serverCompletedAt: { gte: desde, lte: new Date(now.getTime() + 5 * 60_000) },
      },
      orderBy: { serverCompletedAt: 'desc' },
      select: {
        id: true,
        planName: true,
        fromPlan: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        serverCompletedAt: true,
        _count: { select: { sets: true } },
      },
    });
    if (!sessao || !sessao.completedAt || !sessao.serverCompletedAt) {
      return nao(feito ? 'already_today' : 'no_workout', {
        checkedInAt: feito?.capturedAt.toISOString() ?? null,
      });
    }
    const fim = sessao.serverCompletedAt;
    const minutos = Math.max(0, Math.floor((fim.getTime() - sessao.createdAt.getTime()) / 60_000));
    const workout: CheckinWorkout = {
      id: sessao.id,
      name: NOME_DO_TREINO(sessao),
      startedAt: sessao.createdAt.toISOString(),
      endedAt: fim.toISOString(),
      minutes: minutos,
      sets: sessao._count.sets,
      deadline: new Date(fim.getTime() + CHECKIN_WINDOW_HOURS * 60 * 60_000).toISOString(),
    };
    if (feito) {
      return nao('already_today', { workout, checkedInAt: feito.capturedAt.toISOString() });
    }
    // Um treino, um check-in no desafio (#395 B2): o de ontem às 23h10 não vale
    // de novo às 00h10.
    const usado = await this.prisma.challengeCheckin.findUnique({
      where: {
        participantId_workoutSessionId: {
          participantId: ctx.participant.id,
          workoutSessionId: sessao.id,
        },
      },
      select: { id: true },
    });
    if (usado) return nao('workout_used', { workout });
    // Treino lançado depois (gravado só depois de ter terminado, "treino
    // retroativo não conta", Pn-13) ou com o fim reescrito à mão (#395 I3).
    if (
      sessao.createdAt.getTime() > sessao.completedAt.getTime() + LATE_LOG_SLACK_MS ||
      Math.abs(sessao.completedAt.getTime() - fim.getTime()) > LATE_LOG_SLACK_MS
    ) {
      return nao('late_logged', { workout });
    }
    if (minutos < MIN_WORKOUT_MINUTES) return nao('too_short', { workout });
    return { eligible: true, reason: null, workout, checkedInAt: null, rules };
  }

  private async openCount(challengeId: string): Promise<number> {
    return this.prisma.challengeCheckin.count({
      where: { participant: { challengeId }, status: ChallengeCheckinStatus.FLAGGED },
    });
  }

  private async confirmed(userId: string, fileId: string) {
    await this.media.confirm(userId, fileId);
    return this.prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
  }
}

/** A frase de cada bloqueio, a mesma da prancha Cm-18. */
export function blockMessage(reason: CheckinBlock | null): string {
  switch (reason) {
    case 'not_participant':
      return 'Entre no desafio para fazer check-in.';
    case 'not_running':
      return 'O check-in vale só enquanto o desafio está em andamento.';
    case 'no_photo_checkin':
      return 'Este desafio não tem check-in com foto.';
    case 'no_workout':
      return `O check-in fica liberado até ${CHECKIN_WINDOW_HOURS} h depois de terminar um treino registrado.`;
    case 'too_short':
      return `O desafio pede pelo menos ${MIN_WORKOUT_MINUTES} min de treino. Este não conta.`;
    case 'late_logged':
      return 'Treino lançado depois de feito não conta para o check-in.';
    case 'already_today':
      return 'Um check-in por dia. Volte amanhã depois do treino.';
    case 'workout_used':
      return 'Este treino já valeu um check-in neste desafio. Faça o próximo treino.';
    default:
      return 'Não dá para fazer check-in agora.';
  }
}
