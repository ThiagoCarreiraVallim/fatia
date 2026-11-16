import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type {
  CircuitEventDto,
  CircuitResultDto,
  FinishCircuitDto,
  LogCircuitDto,
} from './dto/circuit.dto';
import {
  circuitDefinitionFromPlan,
  circuitIntervalsTotal,
  circuitSetRows,
  circuitTotalsFromRows,
  newCircuitJson,
  parseCircuitJson,
  type CircuitDefinitionV1,
  type CircuitJsonV1,
  type CircuitResultV1,
} from './helpers/circuit';

/** Folga para relógio de aparelho adiantado; a mesma do `finish` da sessão. */
const CLOCK_SLACK_MS = 5 * 60 * 1000;

/**
 * A sessão de circuito (#380): o progresso (toques com horário, para retomar
 * em outra aba ou aparelho), o "Encerrar circuito" e o registro sem relógio
 * (MCP).
 *
 * Tudo preso ao `userId` da sessão ou do plano; id de outra pessoa responde
 * como inexistente (§IDs de docs/MCP.md).
 */
@Injectable()
export class CircuitSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Guarda os toques. A lista vem inteira e substitui a anterior: reenviar é idempotente. */
  async saveProgress(userId: string, sessionId: string, events: CircuitEventDto[]) {
    const { session, json } = await this.openCircuit(userId, sessionId);
    const next: CircuitJsonV1 = { ...json, events: this.checkEvents(events, session.startedAt) };
    // Só grava enquanto a sessão está aberta: um progresso atrasado (rede que
    // volta depois do "Encerrar") não pode reabrir nem sobrescrever o fim.
    const { count } = await this.prisma.workoutSession.updateMany({
      where: { id: sessionId, userId, completedAt: null },
      data: { circuit: next as unknown as Prisma.InputJsonValue },
    });
    if (count === 0) throw new ConflictException('Este circuito já foi encerrado.');
    return { events: next.events.length };
  }

  /**
   * "Encerrar circuito": grava o resultado, uma série por exercício por round
   * ou intervalo, e fecha a sessão. O resultado vem contado pelo relógio do
   * cliente (`@fatia/api-client`); aqui ele é conferido contra o circuito, e
   * reps e totais são contados de novo pelas séries.
   *
   * Repetir o "Encerrar" (duplo toque, rede que cai) devolve o mesmo fim: a
   * escrita só acontece com a sessão aberta, e as séries têm `clientKey`.
   */
  async finish(userId: string, sessionId: string, dto: FinishCircuitDto) {
    const session = await this.ownSession(userId, sessionId);
    const json = parseCircuitJson(session.circuit);
    if (!json) throw new BadRequestException('Esta sessão não é de circuito.');
    if (session.completedAt) {
      if (json.result) return { sessionId, result: json.result, alreadyFinished: true };
      throw new ConflictException('Esta sessão já foi encerrada.');
    }
    const events = this.checkEvents(dto.events, session.startedAt);
    const { result, rows } = this.buildResult(json.definition, dto.result);
    const next: CircuitJsonV1 = { ...json, events, result };

    const { count } = await this.prisma.workoutSession.updateMany({
      where: { id: sessionId, userId, completedAt: null },
      data: {
        completedAt: new Date(),
        circuit: next as unknown as Prisma.InputJsonValue,
        ...(dto.feeling !== undefined ? { feeling: dto.feeling } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    if (count === 0) {
      // Outro "Encerrar" passou na frente: o fim dele vale.
      const again = parseCircuitJson((await this.ownSession(userId, sessionId)).circuit);
      if (again?.result) return { sessionId, result: again.result, alreadyFinished: true };
      throw new ConflictException('Esta sessão já foi encerrada.');
    }
    await this.createSets(sessionId, rows);
    return { sessionId, result, alreadyFinished: false };
  }

  /**
   * Registrar um circuito feito sem o relógio (MCP): "fiz o AMRAP 12, 5 rounds
   * e 2". Com `sessionId`, encerra a sessão de circuito aberta; sem, cria uma
   * sessão já terminada do circuito.
   */
  async log(userId: string, dto: LogCircuitDto) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { id: dto.planId, userId },
      include: {
        circuit: true,
        exercises: { include: { exercise: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.kind !== 'CIRCUIT' || !plan.circuit) {
      throw new BadRequestException('Este plano não é um circuito.');
    }
    const definition = circuitDefinitionFromPlan(plan);
    const resultDto = this.resultFromLog(definition, dto);

    if (dto.sessionId) {
      const session = await this.ownSession(userId, dto.sessionId);
      if (session.planId !== plan.id) {
        throw new BadRequestException('Esta sessão não é deste circuito.');
      }
      return this.finish(userId, dto.sessionId, {
        events: parseCircuitJson(session.circuit)?.events ?? [],
        result: resultDto,
        feeling: dto.feeling,
        notes: dto.notes,
      });
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    if (Number.isNaN(completedAt.getTime())) {
      throw new BadRequestException('completedAt inválido — use ISO 8601.');
    }
    if (completedAt.getTime() > Date.now() + CLOCK_SLACK_MS) {
      throw new BadRequestException('completedAt está no futuro.');
    }
    const startedAt = new Date(completedAt.getTime() - resultDto.elapsedSeconds * 1000);
    const { result, rows } = this.buildResult(definition, resultDto);
    const json: CircuitJsonV1 = { ...newCircuitJson(definition, startedAt), result };
    const session = await this.prisma.workoutSession.create({
      data: {
        userId,
        planId: plan.id,
        startedAt,
        completedAt,
        feeling: dto.feeling ?? null,
        notes: dto.notes ?? null,
        circuit: json as unknown as Prisma.InputJsonValue,
      },
    });
    await this.createSets(session.id, rows);
    return { sessionId: session.id, result, alreadyFinished: false };
  }

  private async createSets(sessionId: string, rows: ReturnType<typeof circuitSetRows>) {
    if (rows.length === 0) return;
    await this.prisma.sessionSet.createMany({
      data: rows.map((r) => ({ sessionId, ...r })),
      skipDuplicates: true,
    });
  }

  /** O resultado conferido contra o circuito, com reps e totais contados pelas séries. */
  private buildResult(
    def: CircuitDefinitionV1,
    dto: CircuitResultDto,
  ): { result: CircuitResultV1; rows: ReturnType<typeof circuitSetRows> } {
    const n = def.exercises.length;
    const hasRounds = def.format === 'AMRAP' || def.format === 'FOR_TIME';
    const intervalsTotal = circuitIntervalsTotal(def);
    if (hasRounds && dto.partialExercises >= Math.max(1, n)) {
      throw new BadRequestException('O round parcial tem menos exercícios que o circuito.');
    }
    if (def.format === 'FOR_TIME' && dto.roundsCompleted > (def.config.rounds ?? 0)) {
      throw new BadRequestException('Mais rounds do que o circuito tem.');
    }
    if (intervalsTotal !== null && (dto.intervalsCompleted ?? 0) > intervalsTotal) {
      throw new BadRequestException('Mais intervalos do que o circuito tem.');
    }
    if (dto.roundSeconds.length > dto.roundsCompleted) {
      throw new BadRequestException('Há mais tempos de round do que rounds.');
    }
    const counts = {
      roundsCompleted: hasRounds ? dto.roundsCompleted : 0,
      partialExercises: hasRounds ? dto.partialExercises : 0,
      intervalsCompleted: hasRounds ? null : (dto.intervalsCompleted ?? 0),
    };
    const rows = circuitSetRows(def, counts);
    const exercises = circuitTotalsFromRows(rows);
    return {
      rows,
      result: {
        ...counts,
        roundSeconds: hasRounds ? dto.roundSeconds : [],
        partialRoundSeconds: hasRounds ? (dto.partialRoundSeconds ?? null) : null,
        elapsedSeconds: dto.elapsedSeconds,
        finalTimeSeconds: def.format === 'FOR_TIME' ? (dto.finalTimeSeconds ?? null) : null,
        completed: dto.completed,
        totalReps: exercises.reduce((sum, e) => sum + e.reps, 0),
        exercises,
      },
    };
  }

  /** O que o MCP manda vira o mesmo resultado do relógio, com os padrões do formato. */
  private resultFromLog(def: CircuitDefinitionV1, dto: LogCircuitDto): CircuitResultDto {
    const c = def.config;
    const planned =
      def.format === 'TABATA'
        ? ((c.workSeconds ?? 0) + (c.restSeconds ?? 0)) * (c.intervals ?? 0)
        : def.format === 'FOR_TIME'
          ? null
          : (c.durationSeconds ?? 0);
    const finalTime = def.format === 'FOR_TIME' ? (dto.finalTimeSeconds ?? null) : null;
    const elapsed = dto.elapsedSeconds ?? finalTime ?? planned;
    if (elapsed === null) {
      throw new BadRequestException('Informe finalTimeSeconds ou elapsedSeconds do For Time.');
    }
    const rounds =
      def.format === 'FOR_TIME' && finalTime !== null
        ? (dto.roundsCompleted ?? c.rounds ?? 0)
        : (dto.roundsCompleted ?? 0);
    const intervalsTotal = circuitIntervalsTotal(def);
    return {
      roundsCompleted: rounds,
      partialExercises: finalTime !== null ? 0 : (dto.partialExercises ?? 0),
      roundSeconds: (dto.roundSeconds ?? []).slice(0, rounds),
      partialRoundSeconds: null,
      elapsedSeconds: elapsed,
      finalTimeSeconds: finalTime,
      intervalsCompleted:
        intervalsTotal === null ? null : (dto.intervalsCompleted ?? intervalsTotal),
      completed:
        def.format === 'FOR_TIME'
          ? finalTime !== null
          : intervalsTotal === null || (dto.intervalsCompleted ?? intervalsTotal) >= intervalsTotal,
    };
  }

  /**
   * Os toques em ordem, dentro de uma janela plausível: nada antes do começo
   * da sessão (com folga) nem no futuro. Fora dela é relógio errado ou
   * corpo forjado, e o relógio do circuito sairia de qualquer jeito.
   */
  private checkEvents(events: CircuitEventDto[], startedAt: Date) {
    const min = startedAt.getTime() - CLOCK_SLACK_MS;
    const max = Date.now() + CLOCK_SLACK_MS;
    if (events.some((e) => e.at < min || e.at > max)) {
      throw new BadRequestException('Horário de toque fora do circuito.');
    }
    return events.map((e) => ({ type: e.type, at: e.at })).sort((a, b) => a.at - b.at);
  }

  private async openCircuit(userId: string, sessionId: string) {
    const session = await this.ownSession(userId, sessionId);
    const json = parseCircuitJson(session.circuit);
    if (!json) throw new BadRequestException('Esta sessão não é de circuito.');
    if (session.completedAt) throw new ConflictException('Este circuito já foi encerrado.');
    return { session, json };
  }

  private async ownSession(userId: string, id: string) {
    const session = await this.prisma.workoutSession.findFirst({ where: { id, userId } });
    // Mesma resposta para "não existe" e "não é sua" (§IDs de docs/MCP.md).
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }
}
