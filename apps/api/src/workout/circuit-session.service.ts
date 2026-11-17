import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { circuitResult, circuitState, type CircuitEvent } from '@fatia/design';
import { PrismaService } from '../common/prisma.service';
import type {
  CircuitEventDto,
  CircuitResultDto,
  FinishCircuitDto,
  LogCircuitDto,
} from './dto/circuit.dto';
import {
  checkCircuitResultBounds,
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
/** A janela dos toques, contada do começo da sessão (revisão da #380). */
const EVENTS_BEFORE_START_MS = 60 * 1000;
const EVENTS_AFTER_START_MS = 6 * 60 * 60 * 1000;

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
   * "Encerrar circuito": conta o resultado pelos toques, com o mesmo relógio
   * da tela (`@fatia/design`), grava uma série por exercício por round ou
   * intervalo e fecha a sessão. O `result` do corpo é só uma dica: um corpo
   * forjado não escolhe quantos rounds valem. Sem o toque de "Encerrar", o fim
   * entra na hora do servidor (ou do último toque, se o aparelho estiver
   * adiantado).
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
    const counted = this.countFromEvents(json, this.checkEvents(dto.events, session.startedAt));
    const { result, rows } = this.buildResult(json.definition, counted.result);
    return this.close(userId, session.id, { ...json, events: counted.events, result }, rows, dto);
  }

  /**
   * Fecha a sessão aberta com o resultado e as séries, numa transação só: se as
   * séries falham, a sessão segue aberta e o "Encerrar" pode ser repetido.
   */
  private async close(
    userId: string,
    sessionId: string,
    next: CircuitJsonV1,
    rows: ReturnType<typeof circuitSetRows>,
    extra: { feeling?: number; notes?: string },
  ) {
    const closed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.workoutSession.updateMany({
        where: { id: sessionId, userId, completedAt: null },
        data: {
          completedAt: new Date(),
          circuit: next as unknown as Prisma.InputJsonValue,
          ...(extra.feeling !== undefined ? { feeling: extra.feeling } : {}),
          ...(extra.notes !== undefined ? { notes: extra.notes } : {}),
        },
      });
      if (count === 0) return false;
      await this.createSets(tx, sessionId, rows);
      return true;
    });
    if (!closed) {
      // Outro "Encerrar" passou na frente: o fim dele vale.
      const again = parseCircuitJson((await this.ownSession(userId, sessionId)).circuit);
      if (again?.result) return { sessionId, result: again.result, alreadyFinished: true };
      throw new ConflictException('Esta sessão já foi encerrada.');
    }
    return { sessionId, result: next.result!, alreadyFinished: false };
  }

  /**
   * O resultado pelos toques, no relógio compartilhado. O "agora" é o maior
   * entre o servidor e o último toque: com o aparelho adiantado, o fim que ele
   * marcou não fica de fora.
   */
  private countFromEvents(json: CircuitJsonV1, events: CircuitEvent[]) {
    const startedAt = Date.parse(json.startedAt);
    const now = events.reduce((max, e) => Math.max(max, e.at), Date.now());
    let run = { startedAt, events };
    if (circuitState(json.definition, run, now).status !== 'done') {
      run = { startedAt, events: [...events, { type: 'end', at: now }] };
    }
    return { events: run.events, result: circuitResult(json.definition, run, now) };
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
      const json = parseCircuitJson(session.circuit);
      if (!json) throw new BadRequestException('Esta sessão não é de circuito.');
      if (session.completedAt) {
        if (json.result)
          return { sessionId: session.id, result: json.result, alreadyFinished: true };
        throw new ConflictException('Esta sessão já foi encerrada.');
      }
      // Sem toques, o tempo contado não passa do que correu desde o começo.
      const sinceStart = (Date.now() - session.startedAt.getTime() + CLOCK_SLACK_MS) / 1000;
      if (resultDto.elapsedSeconds > sinceStart) {
        throw new BadRequestException('O tempo passa do que correu desde o começo da sessão.');
      }
      // O circuito da sessão é o congelado no começo, não o plano de agora.
      const { result, rows } = this.buildResult(json.definition, resultDto, {
        roundTimesOptional: true,
      });
      return this.close(userId, session.id, { ...json, result }, rows, dto);
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    if (Number.isNaN(completedAt.getTime())) {
      throw new BadRequestException('completedAt inválido — use ISO 8601.');
    }
    if (completedAt.getTime() > Date.now() + CLOCK_SLACK_MS) {
      throw new BadRequestException('completedAt está no futuro.');
    }
    const startedAt = new Date(completedAt.getTime() - resultDto.elapsedSeconds * 1000);
    const { result, rows } = this.buildResult(definition, resultDto, { roundTimesOptional: true });
    const json: CircuitJsonV1 = { ...newCircuitJson(definition, startedAt), result };
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workoutSession.create({
        data: {
          userId,
          planId: plan.id,
          // O retrato do plano, como no `start()`: apagar o circuito depois não
          // apaga o nome nem o tipo da sessão no histórico.
          fromPlan: true,
          planName: plan.name,
          startedAt,
          completedAt,
          feeling: dto.feeling ?? null,
          notes: dto.notes ?? null,
          circuit: json as unknown as Prisma.InputJsonValue,
        },
      });
      await this.createSets(tx, created.id, rows);
      return created;
    });
    return { sessionId: session.id, result, alreadyFinished: false };
  }

  /**
   * As séries do fim. O exercício pessoal apagado depois do começo (o retrato
   * ainda o tem) fica sem série: escolha da revisão da #380, em vez de travar o
   * "Apagar exercício" por causa de um circuito aberto. O resultado no JSON
   * guarda o total dele.
   */
  private async createSets(
    db: Prisma.TransactionClient,
    sessionId: string,
    rows: ReturnType<typeof circuitSetRows>,
  ) {
    if (rows.length === 0) return;
    const ids = [...new Set(rows.map((r) => r.exerciseId))];
    const alive = new Set(
      (await db.exercise.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
        (e) => e.id,
      ),
    );
    const data = rows.filter((r) => alive.has(r.exerciseId)).map((r) => ({ sessionId, ...r }));
    if (data.length === 0) return;
    await db.sessionSet.createMany({ data, skipDuplicates: true });
  }

  /** O resultado conferido pelas faixas, com reps e totais contados pelas séries. */
  private buildResult(
    def: CircuitDefinitionV1,
    dto: CircuitResultDto,
    opts: { roundTimesOptional?: boolean } = {},
  ): { result: CircuitResultV1; rows: ReturnType<typeof circuitSetRows> } {
    const hasRounds = def.format === 'AMRAP' || def.format === 'FOR_TIME';
    const counts = {
      roundsCompleted: hasRounds ? dto.roundsCompleted : 0,
      partialExercises: hasRounds ? dto.partialExercises : 0,
      intervalsCompleted: hasRounds ? null : (dto.intervalsCompleted ?? 0),
    };
    const roundSeconds = hasRounds ? dto.roundSeconds : [];
    const finalTimeSeconds = def.format === 'FOR_TIME' ? (dto.finalTimeSeconds ?? null) : null;
    checkCircuitResultBounds(
      def,
      { ...counts, roundSeconds, elapsedSeconds: dto.elapsedSeconds, finalTimeSeconds },
      opts,
    );
    const rows = circuitSetRows(def, counts);
    const exercises = circuitTotalsFromRows(rows);
    return {
      rows,
      result: {
        ...counts,
        roundSeconds,
        partialRoundSeconds: hasRounds ? (dto.partialRoundSeconds ?? null) : null,
        elapsedSeconds: dto.elapsedSeconds,
        finalTimeSeconds,
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
   * Os toques em ordem, dentro de uma janela plausível contada do começo da
   * sessão: de 1 min antes a 6 h depois. O começo e os toques vêm do mesmo
   * relógio (o do aparelho); comparar com a hora do servidor recusava o
   * aparelho adiantado. Fora dela é relógio trocado no meio ou corpo forjado.
   */
  private checkEvents(events: CircuitEventDto[], startedAt: Date) {
    const min = startedAt.getTime() - EVENTS_BEFORE_START_MS;
    const max = startedAt.getTime() + EVENTS_AFTER_START_MS;
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
