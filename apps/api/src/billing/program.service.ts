import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, ProgramKind } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { addDaysIso, dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';
import { can } from '../sharing/permissions';
import type { SeatProvider } from './billing-provider.port';
import { listPrograms, type ProgramView } from './program-view';
import {
  ASSENTOS_MAX,
  diasEntre,
  FUSO_DO_PROVEDOR,
  MINIMO_DO_PROVEDOR_CENTS,
  programPrice,
  vencimentoAvulso,
} from './seat-pricing';
import { SEAT_PROVIDER } from './seat-pool.service';

export type { ProgramView } from './program-view';

export interface CreateProgramInput {
  name: string;
  note?: string | null;
  kind: ProgramKind;
  seats: number;
  /** Primeiro e último dia (`YYYY-MM-DD`, inclusivos), no fuso do provedor. */
  startDate: string;
  endDate: string;
  /** Turma: quem ganha o assento. */
  membershipIds?: string[];
  /** Desafio: quem entrar nele ganha o assento, até acabarem. */
  challengeId?: string;
}

/** Um programa dura no máximo um ano. */
const MAX_DIAS = 366;

/**
 * Programas (#403, Pn-07): PRO por um período para uma turma ou um desafio,
 * em assentos à parte dos do pool. A cobrança é avulsa, na assinatura dos
 * assentos (como o aumento), e o fim é lido da atribuição — no fim a pessoa
 * volta ao Free sem perder nada, sem job.
 *
 * Só o dono (`billing.manage`). Todo id que vem do corpo (membership, desafio)
 * é amarrado à comunidade da URL (ADR 010: o isolamento é da aplicação).
 */
@Injectable()
export class ProgramService {
  private readonly logger = new Logger(ProgramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SEAT_PROVIDER) private readonly provedor: SeatProvider | null,
  ) {}

  list(groupId: string, now: Date = new Date()): Promise<ProgramView[]> {
    return listPrograms(this.prisma, groupId, now);
  }

  async create(
    actorId: string,
    groupId: string,
    input: CreateProgramInput,
    now: Date = new Date(),
  ): Promise<ProgramView> {
    await this.assertManager(actorId, groupId);
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Dê um nome ao programa.');
    if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > ASSENTOS_MAX) {
      throw new BadRequestException(`O número de assentos vai de 1 a ${ASSENTOS_MAX}.`);
    }
    const hoje = dateInTz(now, FUSO_DO_PROVEDOR);
    const dias = diasEntre(input.startDate, input.endDate) + 1;
    if (dias < 1) throw new BadRequestException('O fim vem depois do começo.');
    if (input.startDate < hoje) throw new BadRequestException('O programa começa hoje ou depois.');
    if (dias > MAX_DIAS) throw new BadRequestException('Um programa dura no máximo um ano.');

    const pool = await this.prisma.groupSeatPool.findUnique({ where: { groupId } });
    if (!pool || pool.status === 'CANCELED' || pool.status === 'EXPIRED') {
      throw new NotFoundException('Esta comunidade não tem assentos ativos.');
    }
    if (pool.status === 'PENDING') {
      throw new ConflictException('Os programas ficam disponíveis depois do primeiro pagamento.');
    }
    if (pool.status === 'PAST_DUE') {
      throw new ConflictException(
        'O pagamento dos assentos está em atraso. Regularize antes de criar um programa.',
      );
    }

    // Quem ganha o assento, amarrado à comunidade da URL.
    let membros: string[] = [];
    let challengeId: string | null = null;
    if (input.kind === 'CLASS') {
      membros = [...new Set(input.membershipIds ?? [])];
      if (membros.length > input.seats) {
        throw new ConflictException(
          `A turma tem ${membros.length} pessoas e o programa, ${input.seats} assentos.`,
        );
      }
      if (membros.length) {
        const achados = await this.prisma.groupMembership.count({
          where: { id: { in: membros }, groupId, status: 'ACTIVE' },
        });
        if (achados !== membros.length) throw new NotFoundException('Membro não encontrado.');
      }
    } else {
      const desafio = input.challengeId
        ? await this.prisma.groupChallenge.findFirst({
            where: { id: input.challengeId, groupId },
            select: { id: true },
          })
        : null;
      if (!desafio) throw new NotFoundException('Desafio não encontrado.');
      challengeId = desafio.id;
    }

    const startsAt = dayBoundsInTz(input.startDate, FUSO_DO_PROVEDOR).start;
    const endsAt = dayBoundsInTz(addDaysIso(input.endDate, 1), FUSO_DO_PROVEDOR).start;
    const unit = pool.unitPriceCents;
    const amountCents = programPrice(input.seats, unit, dias);
    const id = randomUUID();

    // Cortesia (sem assinatura no Asaas) não cobra; abaixo do mínimo, também não.
    let providerChargeId: string | null = null;
    if (pool.providerRef && amountCents >= MINIMO_DO_PROVEDOR_CENTS) {
      if (!this.provedor) {
        throw new ConflictException('A cobrança pela web não está disponível nesta instância.');
      }
      try {
        ({ providerChargeId } = await this.provedor.createSubscriptionCharge({
          providerSubscriptionId: pool.providerRef,
          amountCents,
          dueDate: vencimentoAvulso(now),
          // Contagem e período, nunca nome de membro: viaja por e-mail e banco.
          description: `Fatia PRO — programa ${name}, ${input.seats === 1 ? '1 assento' : `${input.seats} assentos`}`,
          externalReference: `group-program:${id}`,
        }));
      } catch (err) {
        this.logger.error({
          event: 'cobranca_de_programa_falhou',
          groupId,
          err: (err as Error).name,
        });
        throw new BadGatewayException(
          'Não conseguimos gerar a cobrança do programa. Tente de novo em alguns minutos.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupProgram.create({
        data: {
          id,
          groupId,
          poolId: pool.id,
          name,
          note: input.note?.trim() || null,
          kind: input.kind,
          challengeId,
          seats: input.seats,
          startsAt,
          endsAt,
          unitPriceCents: unit,
          amountCents,
          providerChargeId,
          chargeStatus: providerChargeId ? 'PENDING' : 'ACTIVE',
          createdById: actorId,
        },
      });
      if (input.kind === 'CLASS') {
        await tx.groupSeatAssignment.createMany({
          data: membros.map((membershipId) => ({
            poolId: pool.id,
            programId: id,
            membershipId,
            startsAt,
            endsAt,
            assignedById: actorId,
          })),
        });
      } else {
        await this.fillFromChallenge(tx, id);
      }
    });
    this.logger.log({ event: 'programa_criado', groupId, kind: input.kind, seats: input.seats });
    const [view] = await listPrograms(this.prisma, groupId, now, { id });
    return view!;
  }

  /**
   * Quem entrou no desafio ganha o assento dos programas dele que ainda valem,
   * por ordem de entrada, até acabarem. Chamado ao entrar no desafio; nunca
   * lança para quem entrou (o desafio não depende do programa).
   */
  async syncChallenge(challengeId: string, now: Date = new Date()): Promise<number> {
    const programas = await this.prisma.groupProgram.findMany({
      where: { challengeId, canceledAt: null, endsAt: { gt: now } },
      select: { id: true },
    });
    let dados = 0;
    for (const p of programas) {
      dados += await this.prisma.$transaction((tx) => this.fillFromChallenge(tx, p.id));
    }
    return dados;
  }

  /** Completa os assentos do programa com quem está no desafio, sob a trava dele. */
  private async fillFromChallenge(tx: Prisma.TransactionClient, programId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`program:${programId}`}))`;
    const p = await tx.groupProgram.findUniqueOrThrow({
      where: { id: programId },
      select: {
        poolId: true,
        groupId: true,
        challengeId: true,
        seats: true,
        startsAt: true,
        endsAt: true,
        createdById: true,
      },
    });
    if (!p.challengeId) return 0;
    const usados = await tx.groupSeatAssignment.findMany({
      where: { programId, revokedAt: null },
      select: { membershipId: true },
    });
    const livres = p.seats - usados.length;
    if (livres <= 0) return 0;
    const ja = new Set(usados.map((u) => u.membershipId));
    const participantes = await tx.groupChallengeParticipant.findMany({
      where: {
        challengeId: p.challengeId,
        // A membership é da mesma comunidade do programa, e ativa.
        membership: { groupId: p.groupId, status: 'ACTIVE' },
      },
      orderBy: { joinedAt: 'asc' },
      select: { membershipId: true },
    });
    const novos = participantes
      .map((x) => x.membershipId)
      .filter((m) => !ja.has(m))
      .slice(0, livres);
    if (!novos.length) return 0;
    await tx.groupSeatAssignment.createMany({
      data: novos.map((membershipId) => ({
        poolId: p.poolId,
        programId,
        membershipId,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        assignedById: p.createdById,
      })),
      skipDuplicates: true,
    });
    return novos.length;
  }

  /** Mesma porta do `SeatPoolService`: fora da comunidade 404, sem o papel 403. */
  private async assertManager(actorId: string, groupId: string): Promise<void> {
    const membership = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: actorId } },
      select: { role: true, status: true },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new NotFoundException('Comunidade não encontrada.');
    }
    if (!can(membership.role, 'billing.manage')) {
      throw new ForbiddenException('Só o dono da comunidade cuida dos programas.');
    }
  }
}
