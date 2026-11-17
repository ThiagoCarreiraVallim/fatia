import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, ShareScope, type WorkoutCheckin } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { SharedWithService } from '../sharing/shared-with.service';
import type {
  FinishSessionDto,
  HistoryQueryDto,
  ListSessionsDto,
  StartSessionDto,
  UpdateSessionDto,
  WorkoutCheckinDto,
} from './dto/session.dto';
import { summarizeSession, type SessionSummary } from './session-summary';
import {
  circuitDefinitionFromPlan,
  circuitSummaryView,
  newCircuitJson,
  parseCircuitJson,
  type CircuitJsonV1,
  type CircuitSummaryView,
} from './helpers/circuit';
import { historyItemOf, type WorkoutHistory } from './session-history';
import { sessionKind, sessionKindWhere } from './helpers/session-kind';
import { isCardioExercise } from './helpers/is-cardio';
import {
  afterSessionPosition,
  decodeSessionCursor,
  encodeSessionCursor,
} from './helpers/session-cursor';

export interface PostWorkoutQuestion {
  key: 'fatigue' | 'pain';
  kind: 'scale' | 'yes_no';
  label: string;
  /** Rótulos das pontas da escala ("leve", "no limite"). */
  scaleLabels?: [string, string];
}

/**
 * As perguntas da equipe no fim do treino (prancha `Al-T5b-Fim-perguntas`).
 * Enquanto a #391 não deixa a equipe escrever as dela, o conjunto é este,
 * fixo, e aparece para quem tem vínculo com Treino liberado.
 */
export const DEFAULT_POST_WORKOUT_QUESTIONS: readonly PostWorkoutQuestion[] = [
  {
    key: 'fatigue',
    kind: 'scale',
    label: 'Cansaço depois do treino',
    scaleLabels: ['leve', 'no limite'],
  },
  { key: 'pain', kind: 'yes_no', label: 'Sentiu dor ou desconforto?' },
];

export interface PostWorkoutQuestions {
  /** Quem lê as respostas: os profissionais com Treino liberado. */
  askedBy: string[];
  items: readonly PostWorkoutQuestion[];
}

export type SessionSummaryView = SessionSummary & {
  checkin: Omit<WorkoutCheckin, 'userId'> | null;
  questions: PostWorkoutQuestions | null;
  /** Circuito (#380): rounds, tempo por round, tempo final e a comparação. Nulo em treino de séries. */
  circuit: CircuitSummaryView | null;
  /**
   * O plano que esta sessão virou no "Salvar como plano" (#381). A tela troca
   * o botão por "Ver plano"; nulo se não virou (ou se o plano foi apagado).
   */
  savedPlanId: string | null;
};

const SESSION_INCLUDE = {
  // As respostas do fim do treino vão junto: o dono vê as dele, e a equipe as
  // lê pela leitura de Treino do painel, que confere o escopo e registra
  // (`StudentViewService`).
  checkin: true,
  sets: {
    include: { exercise: true },
    orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
  },
  plan: {
    include: {
      exercises: {
        include: { exercise: true, sets: { orderBy: { order: 'asc' } } },
        orderBy: { order: 'asc' },
      },
    },
  },
} satisfies Prisma.WorkoutSessionInclude;

type SessionWithRelations = Prisma.WorkoutSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

/**
 * O que o plano manda fazer, como a sessão lê (#378). Além de séries e faixa,
 * leva a configuração do exercício para a tela da sessão (#377) usar o
 * descanso, a técnica, a carga inicial, o bi-set e a meta de cardio.
 *
 * `planExerciseId` identifica a linha do plano. Hoje cada exercício entra uma
 * vez por plano (`@@unique([planId, exerciseId])`), porque a sessão agrupa as
 * séries por `exerciseId`; repetir exercício fica para outra issue.
 */
export interface PlannedExerciseView {
  planExerciseId: string;
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string;
  order: number;
  targetSets: number;
  targetReps: string;
  repUnit: 'REPS' | 'SECONDS';
  loadMode: 'WEIGHT' | 'BODYWEIGHT';
  startLoadKg: number | null;
  /** Nulo = o descanso padrão da sessão. */
  restSeconds: number | null;
  technique: 'NORMAL' | 'DROP_SET' | 'TO_FAILURE';
  /** Já falso no último exercício: não há próximo com quem fazer o bi-set. */
  biSetWithNext: boolean;
  notes: string | null;
  cardioTarget: 'TIME' | 'DISTANCE' | null;
  cardioDurationSeconds: number | null;
  cardioDistanceMeters: number | null;
  cardioIntensity: 'LIGHT' | 'MODERATE' | 'VIGOROUS' | null;
  /** Série por série; vazia = `targetSets` séries iguais. */
  sets: Array<{
    order: number;
    kind: 'WARMUP' | 'NORMAL' | 'DROP';
    reps: number;
    loadKg: number | null;
  }>;
}

@Injectable()
export class WorkoutSessionService {
  private readonly sharedWith: SharedWithService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() sharedWith?: SharedWithService,
  ) {
    // Só depende do Prisma: quem monta o serviço à mão (specs, scripts) não
    // precisa montar o resto do compartilhamento.
    this.sharedWith = sharedWith ?? new SharedWithService(prisma);
  }

  /**
   * Abre uma sessão. **Uma aberta por pessoa** (#350): quem garante é o índice
   * único parcial do banco, e não uma checagem antes do `create` — duas chamadas
   * concorrentes (duas abas, o MCP, o treino rápido) passariam juntas nela.
   * A segunda recebe 409 dizendo qual sessão está aberta e como seguir.
   */
  async start(userId: string, dto: StartSessionDto) {
    // O plano vem do corpo: precisa ser da pessoa. Sem isto a sessão de B
    // apontaria para o plano de A, e o `findById` de B mostraria os exercícios
    // de A em `plannedExercises`.
    let circuit: Prisma.InputJsonValue | undefined;
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    let plan: Prisma.WorkoutPlanGetPayload<{
      include: { circuit: true; exercises: { include: { exercise: true } } };
    }> | null = null;
    if (dto.planId) {
      plan = await this.prisma.workoutPlan.findFirst({
        where: { id: dto.planId, userId },
        include: {
          circuit: true,
          exercises: { include: { exercise: true }, orderBy: { order: 'asc' } },
        },
      });
      if (!plan) throw new NotFoundException('Plan not found');
      // Circuito (#380): a sessão congela o circuito no começo, e o relógio
      // conta a partir daqui. Os toques chegam depois, pelo progresso.
      if (plan.kind === 'CIRCUIT') {
        if (plan.exercises.length === 0) {
          throw new BadRequestException('Adicione exercícios ao circuito antes de começar.');
        }
        const previous = await this.lastCircuitResult(userId, plan.id, startedAt);
        circuit = newCircuitJson(circuitDefinitionFromPlan(plan), startedAt, previous);
      }
    }
    try {
      return await this.prisma.workoutSession.create({
        data: {
          userId,
          planId: plan?.id ?? null,
          // O retrato do plano: apagar o plano depois não faz a sessão virar
          // "Treino livre" no histórico (`helpers/session-kind.ts`).
          fromPlan: plan !== null,
          planName: plan?.name ?? null,
          startedAt,
          notes: dto.notes,
          exerciseOrder: dto.exerciseOrder ?? [],
          ...(circuit ? { circuit } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const aberta = await this.prisma.workoutSession.findFirst({
          where: { userId, completedAt: null },
          select: { id: true },
        });
        // O id vai também no corpo: o app e a web abrem a sessão aberta em vez
        // de mostrar erro (#377), e o MCP lê a mesma mensagem de sempre.
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message:
            `Já existe uma sessão de treino aberta (id ${aberta?.id ?? 'desconhecido'}). ` +
            'Retome-a registrando séries nela, ou encerre com finish_workout_session antes de ' +
            'abrir outra.',
          activeSessionId: aberta?.id ?? null,
        });
      }
      throw error;
    }
  }

  async findById(userId: string, id: string) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { id, userId },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new NotFoundException('Session not found');
    return this.shapeSession(session);
  }

  async findActive(userId: string) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { userId, completedAt: null },
      include: SESSION_INCLUDE,
      orderBy: { startedAt: 'desc' },
    });
    return session ? this.shapeSession(session) : null;
  }

  /**
   * As sessões com tudo (séries, plano, check-in) e o tipo de cada uma (#381).
   * É o que o MCP (`list_workout_sessions`) e a leitura de Treino da equipe
   * devolvem; a tela do histórico usa o `history`, mais enxuto.
   *
   * O `cursor` é o id da última sessão da página anterior (contrato do MCP).
   * Ele é lido **desta pessoa** e vira posição (`startedAt`, `id`): o de outra
   * pessoa, ou o de uma sessão já apagada, é 400 — antes o primeiro servia de
   * posição e o segundo encerrava a lista em silêncio.
   */
  async list(userId: string, params: ListSessionsDto) {
    const limit = Math.min(params.limit ?? 20, 50);
    const filters: Prisma.WorkoutSessionWhereInput[] = [{ userId }, sessionKindWhere(params.kind)];
    if (params.date) {
      const start = new Date(`${params.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      filters.push({ startedAt: { gte: start, lt: end } });
    }
    if (params.cursor) {
      const position = await this.prisma.workoutSession.findFirst({
        where: { id: params.cursor, userId },
        select: { id: true, startedAt: true },
      });
      if (!position) {
        throw new BadRequestException(
          'cursor inválido: use o id da última sessão da página anterior.',
        );
      }
      filters.push(afterSessionPosition(position));
    }
    const rows = await this.prisma.workoutSession.findMany({
      where: { AND: filters },
      include: SESSION_INCLUDE,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((row) => ({ ...row, kind: sessionKind(row) }));
  }

  /**
   * O histórico (#381, prancha `Al-T10`): os totais do topo e as linhas, só de
   * sessões concluídas — a aberta mora na barra do treino em andamento. O filtro
   * de tipo vale para os dois.
   *
   * Os totais agregam em memória, como `listPersonalRecords`: a escala é de uma
   * pessoa (centenas de sessões), e o filtro de tipo fica num lugar só
   * (`sessionKindWhere`) em vez de repetido num SQL à mão.
   *
   * A página segue por keyset (`helpers/session-cursor.ts`): o `nextCursor` é
   * a posição da última linha, e não o id dela.
   */
  async history(userId: string, params: HistoryQueryDto): Promise<WorkoutHistory> {
    const limit = Math.min(params.limit ?? 20, 50);
    const where: Prisma.WorkoutSessionWhereInput = {
      userId,
      completedAt: { not: null },
      ...sessionKindWhere(params.kind),
    };
    const pageWhere: Prisma.WorkoutSessionWhereInput = params.cursor
      ? { AND: [where, afterSessionPosition(decodeSessionCursor(params.cursor))] }
      : where;
    const [rows, spans, lifts] = await Promise.all([
      this.prisma.workoutSession.findMany({
        where: pageWhere,
        select: {
          id: true,
          planId: true,
          fromPlan: true,
          planName: true,
          startedAt: true,
          completedAt: true,
          feeling: true,
          notes: true,
          circuit: true,
          plan: { select: { name: true } },
          sets: {
            select: {
              exerciseId: true,
              weightKg: true,
              reps: true,
              rpe: true,
              durationSeconds: true,
              distanceMeters: true,
              avgHeartRate: true,
              exercise: { select: { name: true, muscleGroup: true } },
            },
            orderBy: [{ setNumber: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.workoutSession.findMany({
        where,
        select: { startedAt: true, completedAt: true },
      }),
      this.prisma.sessionSet.findMany({
        where: { session: where, weightKg: { not: null }, reps: { not: null } },
        select: { weightKg: true, reps: true, exercise: { select: { muscleGroup: true } } },
      }),
    ]);

    const page = rows.slice(0, limit);
    const minutes = spans.map((s) => (s.completedAt!.getTime() - s.startedAt.getTime()) / 60_000);
    const volume = lifts
      .filter((s) => !isCardioExercise(s.exercise))
      .reduce((acc, s) => acc + s.weightKg! * s.reps!, 0);
    return {
      totals: {
        sessions: spans.length,
        avgDurationMinutes: minutes.length
          ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
          : null,
        volumeKg: Math.round(volume * 10) / 10,
      },
      items: page.map(historyItemOf),
      nextCursor: rows.length > limit && page.length ? encodeSessionCursor(page.at(-1)!) : null,
    };
  }

  /**
   * Finaliza a sessão. `completedAt` é opcional e serve para registrar treino já
   * ocorrido — "ontem treinei peito, supino 4x8 com 70 kg" — que antes só podia
   * ser fechado com o horário de agora, produzindo uma sessão de um dia de
   * duração.
   *
   * As duas validações existem porque o valor vem do cliente, e um horário
   * incoerente contamina em silêncio todo agregado de duração e volume: um fim
   * antes do início dá duração negativa, e um fim no futuro empurra a sessão
   * para o topo do histórico e não sai de lá.
   */
  async finish(userId: string, id: string, dto: FinishSessionDto) {
    const session = await this.assertOwner(userId, id);

    let requested: Date | null = null;
    if (dto.completedAt) {
      requested = new Date(dto.completedAt);
      if (Number.isNaN(requested.getTime())) {
        throw new BadRequestException('completedAt inválido — use ISO 8601.');
      }
      if (requested < session.startedAt) {
        throw new BadRequestException(
          'completedAt é anterior ao início do treino. Confirme a data com o usuário.',
        );
      }
      // Uma folga pequena absorve relógio de aparelho adiantado; um treino que
      // "termina" amanhã é erro de digitação, não fuso.
      if (requested.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new BadRequestException('completedAt está no futuro.');
      }
    }

    // O fim é gravado só se ainda não há fim (`completedAt: null` no where):
    // dois "Finalizar" ao mesmo tempo — duplo toque, a web e o app — leem a
    // sessão aberta juntos, e sem a condição o segundo trocaria o horário do
    // primeiro. Um `completedAt` explícito é correção e vale sempre.
    if (requested) {
      await this.prisma.workoutSession.update({
        where: { id },
        data: { completedAt: requested },
      });
    } else {
      await this.prisma.workoutSession.updateMany({
        where: { id, userId, completedAt: null },
        data: { completedAt: new Date() },
      });
    }

    const updated = await this.prisma.workoutSession.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.feeling !== undefined ? { feeling: dto.feeling } : {}),
      },
    });
    if (dto.checkin) await this.saveCheckin(userId, id, dto.checkin);
    return updated;
  }

  /**
   * Devolve a sessão no mesmo formato do `findById`: quem reordena ou tira um
   * exercício no meio do treino precisa dos `plannedExercises` já recortados
   * para redesenhar a tela sem uma segunda ida ao servidor.
   */
  async update(userId: string, id: string, dto: UpdateSessionDto) {
    await this.assertOwner(userId, id);
    const session = await this.prisma.workoutSession.update({
      where: { id },
      data: dto,
      include: SESSION_INCLUDE,
    });
    return this.shapeSession(session);
  }

  async delete(userId: string, id: string): Promise<void> {
    // Idempotente. Cancelar um treino podia disparar o DELETE duas vezes (duplo
    // clique / re-render) ou correr com a sessão já removida: o segundo delete
    // batia em Prisma P2025 ("Record to delete does not exist") e virava HTTP 500,
    // só funcionando no retry. Aqui validamos posse e tratamos "já não existe"
    // como no-op. Os SessionSet somem por cascade (onDelete: Cascade no schema).
    // Não usamos transação interativa de propósito: em produção atrás de pgbouncer
    // (transaction pooling) ela falha de forma consistente.
    const session = await this.prisma.workoutSession.findUnique({
      where: { id },
      select: { userId: true },
    });
    // Sessão de outro usuário é tratada como inexistente — resposta idêntica ao
    // "já não existe" para não revelar que o id existe em outra conta (#92).
    if (!session || session.userId !== userId) return; // idempotente: nada a fazer
    try {
      await this.prisma.workoutSession.delete({ where: { id } });
    } catch (err) {
      // P2025: removida concorrentemente entre o findUnique e o delete → no-op.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return;
      throw err;
    }
  }

  /**
   * Grava as respostas do fim do treino (#377, parte da #304). Uma linha por
   * sessão, substituída inteira a cada envio: reenviar é idempotente, e o que
   * não veio fica vazio. "Pular" guarda só que pulou.
   *
   * O `userId` da linha sai da sessão conferida, nunca do corpo.
   */
  async saveCheckin(userId: string, id: string, dto: WorkoutCheckinDto) {
    const session = await this.assertOwner(userId, id);
    if (!session.completedAt) {
      throw new BadRequestException('Finalize o treino antes de responder as perguntas.');
    }
    const skipped = dto.skipped === true;
    const answers = {
      skipped,
      difficulty: skipped ? null : (dto.difficulty ?? null),
      fatigue: skipped ? null : (dto.fatigue ?? null),
      pain: skipped ? null : (dto.pain ?? null),
      painLocation: skipped || dto.pain !== true ? null : dto.painLocation?.trim() || null,
      motivation: skipped ? null : (dto.motivation ?? null),
      note: skipped ? null : dto.note?.trim() || null,
    };
    const { userId: _dono, ...checkin } = await this.prisma.workoutCheckin.upsert({
      where: { sessionId: id },
      create: { sessionId: id, userId: session.userId, ...answers },
      update: { ...answers, answeredAt: new Date() },
    });
    void _dono;
    return checkin;
  }

  /**
   * Quem pergunta no fim do treino: os profissionais com vínculo ativo e
   * Treino liberado (ADR 014). Sem nenhum, a folha não aparece. Só nomes:
   * ninguém aqui vê dado de outra pessoa.
   */
  async postWorkoutQuestions(userId: string): Promise<PostWorkoutQuestions | null> {
    // A mesma regra da porta do painel (vínculo vivo com Treino, os dois ativos
    // na comunidade): só pergunta quem de fato vai poder ler a resposta.
    const viewers = await this.sharedWith.viewersOf(userId, ShareScope.WORKOUT);
    if (viewers.length === 0) return null;
    const people = await this.prisma.user.findMany({
      where: { id: { in: viewers } },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return { askedBy: people.map((p) => p.name), items: DEFAULT_POST_WORKOUT_QUESTIONS };
  }

  /**
   * O "Treino feito!" (prancha `Al-T5-Fim`): a conta é `summarizeSession`;
   * aqui só as leituras, todas presas ao `userId`.
   */
  async summary(userId: string, id: string): Promise<SessionSummaryView> {
    const session = await this.prisma.workoutSession.findFirst({
      where: { id, userId },
      include: {
        checkin: true,
        sets: {
          include: { exercise: true },
          orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
        },
        plan: { select: { name: true, exercises: { select: { exerciseId: true, order: true } } } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    const exerciseIds = [...new Set(session.sets.map((s) => s.exerciseId))];
    const [previous, priorSets, questions, savedPlan] = await Promise.all([
      session.planId
        ? this.prisma.workoutSession.findFirst({
            where: {
              userId,
              planId: session.planId,
              id: { not: session.id },
              completedAt: { not: null },
              startedAt: { lt: session.startedAt },
            },
            orderBy: { startedAt: 'desc' },
            select: {
              id: true,
              startedAt: true,
              completedAt: true,
              sets: { select: { weightKg: true, reps: true } },
            },
          })
        : null,
      exerciseIds.length
        ? this.prisma.sessionSet.findMany({
            where: {
              exerciseId: { in: exerciseIds },
              session: { userId, startedAt: { lt: session.startedAt } },
            },
            select: {
              exerciseId: true,
              sessionId: true,
              weightKg: true,
              reps: true,
              distanceMeters: true,
            },
          })
        : [],
      this.postWorkoutQuestions(userId),
      this.prisma.workoutPlan.findFirst({
        where: { userId, fromSessionId: session.id },
        select: { id: true },
      }),
    ]);

    const summary = summarizeSession({
      session: {
        id: session.id,
        planId: session.planId,
        fromPlan: session.fromPlan,
        planName: session.planName,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        feeling: session.feeling,
        notes: session.notes,
        exerciseOrder: session.exerciseOrder,
        circuit: session.circuit,
        plan: session.plan,
        sets: session.sets,
      },
      previous,
      priorSets,
      now: new Date(),
    });
    const circuit = await this.circuitSummary(userId, session);
    let checkin: SessionSummaryView['checkin'] = null;
    if (session.checkin) {
      const { userId: _dono, ...rest } = session.checkin;
      void _dono;
      checkin = rest;
    }
    return { ...summary, checkin, questions, circuit, savedPlanId: savedPlan?.id ?? null };
  }

  /**
   * O resultado do circuito e a última vez do mesmo circuito, antes deste. As
   * sessões antigas sem resultado (encerradas sem relógio, JSON de outra
   * versão) não contam como "última vez".
   */
  private async circuitSummary(
    userId: string,
    session: { id: string; planId: string | null; startedAt: Date; circuit: Prisma.JsonValue },
  ): Promise<CircuitSummaryView | null> {
    const json = parseCircuitJson(session.circuit);
    if (!json?.result) return null;
    const previous = session.planId
      ? await this.lastCircuitResult(userId, session.planId, session.startedAt, session.id)
      : null;
    return circuitSummaryView(json, previous);
  }

  /** A última sessão terminada do circuito, com resultado, antes de `before`. */
  private async lastCircuitResult(
    userId: string,
    planId: string,
    before: Date,
    excludeId?: string,
  ): Promise<{ sessionId: string; startedAt: Date; json: CircuitJsonV1 } | null> {
    const earlier = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        planId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        completedAt: { not: null },
        startedAt: { lt: before },
        circuit: { not: Prisma.AnyNull },
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { id: true, startedAt: true, circuit: true },
    });
    for (const e of earlier) {
      const json = parseCircuitJson(e.circuit);
      if (json?.result) return { sessionId: e.id, startedAt: e.startedAt, json };
    }
    return null;
  }

  private shapeSession(session: SessionWithRelations) {
    const { plan, ...rest } = session;
    // O que a pessoa tirou deste treino some daqui, e não só da tela do app:
    // web, MCP e o resumo do fim leem a mesma lista, e o progresso "3/5
    // exercícios" contaria o removido como pendente para sempre.
    const removed = new Set(session.removedExerciseIds ?? []);
    const kept = plan ? plan.exercises.filter((pe) => !removed.has(pe.exerciseId)) : [];
    const plannedExercises: PlannedExerciseView[] = kept.map((pe, i) => ({
      planExerciseId: pe.id,
      exerciseId: pe.exerciseId,
      exerciseName: pe.exercise.name,
      muscleGroup: pe.exercise.muscleGroup,
      order: pe.order,
      targetSets: pe.targetSets,
      targetReps: pe.targetReps,
      repUnit: pe.repUnit,
      loadMode: pe.loadMode,
      startLoadKg: pe.startLoadKg,
      restSeconds: pe.restSeconds,
      technique: pe.technique,
      biSetWithNext: pe.biSetWithNext && i < kept.length - 1,
      notes: pe.notes,
      cardioTarget: pe.cardioTarget,
      cardioDurationSeconds: pe.cardioDurationSeconds,
      cardioDistanceMeters: pe.cardioDistanceMeters,
      cardioIntensity: pe.cardioIntensity,
      sets: pe.sets.map((s) => ({ order: s.order, kind: s.kind, reps: s.reps, loadKg: s.loadKg })),
    }));
    return { ...rest, plannedExercises };
  }

  private async assertOwner(userId: string, id: string) {
    const session = await this.prisma.workoutSession.findUnique({ where: { id } });
    // Mesma resposta para "não existe" e "não é sua" (§IDs de docs/MCP.md).
    if (!session || session.userId !== userId) throw new NotFoundException('Session not found');
    return session;
  }
}
