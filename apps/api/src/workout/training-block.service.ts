import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  addDaysIso,
  dateInTz,
  dayBoundsInTz,
  todayInTz,
  weekStartInTz,
} from '../progress/helpers/date-tz';
import {
  BLOCK_TEMPLATE,
  BLOCK_WEEKS_TOTAL,
  KIND_LABEL,
  REP_RANGE_BY_KIND,
  describeWeek,
  type BlockFocus,
  type BlockKind,
} from './helpers/block-template';
import {
  DELOAD_WINDOW,
  detectDeloadSignal,
  type DeloadSignal,
} from './helpers/detect-deload-signal';
import { reconcileBlock, type ReconciledWeek } from './helpers/reconcile-block';
import type { CreateTrainingBlockDto } from './dto/training-block.dto';

/** Meta semanal de sessões quando o usuário não definiu `UserGoals.weeklyWorkouts`. */
const DEFAULT_SESSIONS_PER_WEEK = 3;

interface BlockUserCtx {
  userId: string;
  timezone: string;
}

/**
 * Periodização automática em blocos (#145).
 *
 * O banco guarda a **intenção** (ver o comentário de `TrainingBlock` no schema); o
 * **andamento** é recalculado em toda leitura por `reconcileBlock`, que é puro.
 * Este service é a cola: consulta, monta a resposta explicável e é o único lugar
 * que grava — sempre em rota de escrita, nunca durante um `GET`.
 */
@Injectable()
export class TrainingBlockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria o bloco de 4 semanas ancorado na segunda-feira desta semana, no fuso do
   * usuário. Os fatores do template são **copiados** para as linhas: o bloco que a
   * pessoa aceitou não pode mudar quando `block-template.ts` mudar.
   */
  async create(ctx: BlockUserCtx, dto: CreateTrainingBlockDto) {
    // O `planId` vem do corpo; ser dono da conta não autoriza apontar para o plano
    // de outra pessoa (#204). Mesma resposta para "não existe" e "não é seu" (#92).
    if (dto.planId) {
      const plan = await this.prisma.workoutPlan.findFirst({
        where: { id: dto.planId, userId: ctx.userId },
        select: { id: true },
      });
      if (!plan) throw new NotFoundException('Plan not found');
    }

    await this.closeFinishedBlocks(ctx);

    const stillActive = await this.prisma.trainingBlock.count({
      where: { userId: ctx.userId, status: 'active' },
    });
    // Dois blocos ativos dariam duas semanas correntes contraditórias, e nenhuma
    // das duas seria explicável. Fechar o anterior é decisão do usuário.
    if (stillActive > 0) throw new ConflictException('Active training block already exists');

    const sessionsTarget = dto.sessionsPerWeek ?? (await this.weeklyWorkoutsGoal(ctx.userId));
    const startDate = weekStartInTz(new Date(), ctx.timezone);

    const block = await this.prisma.trainingBlock.create({
      data: {
        userId: ctx.userId,
        planId: dto.planId ?? null,
        kind: dto.kind ?? 'hypertrophy',
        startDate,
        weeksTotal: BLOCK_WEEKS_TOTAL,
        weeks: {
          create: BLOCK_TEMPLATE.map((week) => ({
            weekNumber: week.weekNumber,
            focus: week.focus,
            intensityFactor: week.intensityFactor,
            volumeFactor: week.volumeFactor,
            weekStart: addDaysIso(startDate, 7 * (week.weekNumber - 1)),
            sessionsTarget,
          })),
        },
      },
      include: BLOCK_INCLUDE,
    });

    return this.present(ctx, block);
  }

  /**
   * O bloco ativo, já reconciliado com o calendário real. `null` quando não há
   * bloco — ou quando o que existe já venceu, e nesse caso ele some da tela em vez
   * de virar card fantasma pedindo um treino de um mês atrás.
   *
   * **Não grava.** A reconciliação é derivada; a persistência do fechamento
   * acontece na próxima escrita (`create`/`abandon`).
   */
  async getActive(ctx: BlockUserCtx) {
    const block = await this.prisma.trainingBlock.findFirst({
      where: { userId: ctx.userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: BLOCK_INCLUDE,
    });
    if (!block) return null;

    const view = await this.present(ctx, block);
    return view.status === 'active' ? view : null;
  }

  /** Encerra o bloco por decisão do usuário. */
  async abandon(ctx: BlockUserCtx, id: string): Promise<void> {
    const block = await this.prisma.trainingBlock.findFirst({
      where: { id, userId: ctx.userId },
      select: { id: true },
    });
    // Mesma resposta para "não existe" e "não é seu" (§IDs de docs/MCP.md).
    if (!block) throw new NotFoundException('Training block not found');

    await this.prisma.trainingBlock.update({
      where: { id },
      data: { status: 'abandoned' },
    });
  }

  /**
   * Persiste o fechamento dos blocos que a reconciliação já dá por vencidos.
   *
   * Roda só em rota de escrita. Sem isto, um bloco derivado-abandonado continuaria
   * `active` no banco e travaria a criação do próximo para sempre.
   */
  private async closeFinishedBlocks(ctx: BlockUserCtx): Promise<void> {
    const blocks = await this.prisma.trainingBlock.findMany({
      where: { userId: ctx.userId, status: 'active' },
      include: BLOCK_INCLUDE,
    });

    for (const block of blocks) {
      const reconciled = reconcileBlock({
        weeks: block.weeks.map(toPlannedWeek),
        today: todayInTz(ctx.timezone),
        completedDates: await this.completedDates(ctx, block.startDate),
      });
      if (reconciled.status === 'active') continue;

      await this.prisma.trainingBlock.update({
        where: { id: block.id },
        data: { status: reconciled.status },
      });
    }
  }

  /** Monta a resposta explicável a partir das linhas + do histórico. */
  private async present(ctx: BlockUserCtx, block: BlockRow) {
    const reconciled = reconcileBlock({
      weeks: block.weeks.map(toPlannedWeek),
      today: todayInTz(ctx.timezone),
      completedDates: await this.completedDates(ctx, block.startDate),
    });

    const current = reconciled.weeks.find((w) => w.weekNumber === reconciled.currentWeekNumber);

    // Janela congelada: só sessões concluídas ANTES da semana corrente entram no
    // sinal. Medir com as sessões da própria semana faria a sugestão piscar a cada
    // série registrada — e "por que a semana mudou de novo?" é exatamente a
    // pergunta que esta issue existe para evitar.
    const deload = current
      ? await this.deloadSignal(ctx, block.planId, current.effectiveWeekStart)
      : ({ suggested: false, reason: 'insufficient_history' } as const);

    const weeks = anticipateDeload(reconciled.weeks, current, deload);
    const currentView = weeks.find((w) => w.weekNumber === reconciled.currentWeekNumber) ?? null;
    const nextView =
      weeks.find((w) => w.weekNumber === (reconciled.currentWeekNumber ?? 0) + 1) ?? null;

    const kind = block.kind as BlockKind;

    return {
      id: block.id,
      planId: block.planId,
      planName: block.plan?.name ?? null,
      kind,
      kindLabel: KIND_LABEL[kind],
      repRange: REP_RANGE_BY_KIND[kind],
      startDate: block.startDate,
      weeksTotal: block.weeksTotal,
      status: reconciled.status,
      currentWeek: currentView && { ...currentView, summary: describeWeek(currentView) },
      nextWeek: nextView && { ...nextView, summary: describeWeek(nextView) },
      weeks,
      deload,
      /** A frase inteira, pronta para a tela — web e mobile mostram a mesma. */
      explanation: explain(reconciled.status, currentView, deload),
    };
  }

  /**
   * Datas (YYYY-MM-DD no fuso do usuário) das sessões **concluídas** desde o início
   * do bloco.
   *
   * `completedAt: { not: null }` é a mesma regra da prescrição (#144): sessão em
   * andamento não conta. Sem ela, a semana fecharia no meio do treino de sábado —
   * e a linha do tempo do bloco pularia enquanto a pessoa ainda está na academia.
   */
  private async completedDates(ctx: BlockUserCtx, startDate: string): Promise<string[]> {
    const { start } = dayBoundsInTz(startDate, ctx.timezone);
    const sessions = await this.prisma.workoutSession.findMany({
      where: { userId: ctx.userId, completedAt: { not: null, gte: start } },
      select: { completedAt: true },
    });
    return sessions
      .map((s) => s.completedAt)
      .filter((at): at is Date => at !== null)
      .map((at) => dateInTz(at, ctx.timezone));
  }

  /**
   * Pontos do sinal de deload: as últimas sessões de força concluídas antes de
   * `before`, restritas aos exercícios do plano do bloco quando há um.
   */
  private async deloadSignal(
    ctx: BlockUserCtx,
    planId: string | null,
    before: string,
  ): Promise<DeloadSignal> {
    const exerciseIds = planId ? await this.planExerciseIds(planId) : null;
    // Plano sem exercício nenhum: um `in: []` traria zero sessões e o sinal ficaria
    // preso em "histórico insuficiente" sem ninguém entender por quê.
    if (exerciseIds !== null && exerciseIds.length === 0) {
      return { suggested: false, reason: 'insufficient_history' };
    }

    const validStrengthSet = {
      weightKg: { not: null },
      reps: { not: null },
      ...(exerciseIds ? { exerciseId: { in: exerciseIds } } : {}),
    };

    const { start } = dayBoundsInTz(before, ctx.timezone);
    const sessions = await this.prisma.workoutSession.findMany({
      where: {
        userId: ctx.userId,
        completedAt: { not: null, lt: start },
        sets: { some: validStrengthSet },
      },
      orderBy: { startedAt: 'desc' },
      take: DELOAD_WINDOW,
      select: { sets: { where: validStrengthSet, select: { weightKg: true, rpe: true } } },
    });

    return detectDeloadSignal(
      sessions.map((session) => {
        const rpes = session.sets.map((s) => s.rpe).filter((rpe): rpe is number => rpe !== null);
        const cargas = session.sets.map((s) => s.weightKg ?? 0);
        return {
          avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
          topSetKg: cargas.length ? Math.max(...cargas) : 0,
        };
      }),
    );
  }

  private async planExerciseIds(planId: string): Promise<number[]> {
    const rows = await this.prisma.workoutPlanExercise.findMany({
      where: { planId },
      select: { exerciseId: true },
    });
    return rows.map((row) => row.exerciseId);
  }

  private async weeklyWorkoutsGoal(userId: string): Promise<number> {
    const goals = await this.prisma.userGoals.findUnique({
      where: { userId },
      select: { weeklyWorkouts: true },
    });
    return goals?.weeklyWorkouts ?? DEFAULT_SESSIONS_PER_WEEK;
  }
}

const BLOCK_INCLUDE = {
  weeks: { orderBy: { weekNumber: 'asc' as const } },
  plan: { select: { name: true } },
} as const;

interface BlockRow {
  id: string;
  planId: string | null;
  plan: { name: string } | null;
  kind: string;
  startDate: string;
  weeksTotal: number;
  weeks: Array<{
    weekNumber: number;
    focus: string;
    intensityFactor: number;
    volumeFactor: number;
    weekStart: string;
    sessionsTarget: number;
  }>;
}

function toPlannedWeek(week: BlockRow['weeks'][number]) {
  return { ...week, focus: week.focus as BlockFocus };
}

/**
 * O sinal **antecipa** a semana de deload que já existe; nunca cria uma quinta.
 *
 * A troca é de fatores e foco entre a semana corrente e a de deload ainda à frente
 * — o bloco continua tendo 4 semanas, e a semana empurrada vira a última.
 */
function anticipateDeload(
  weeks: ReconciledWeek[],
  current: ReconciledWeek | undefined,
  deload: DeloadSignal,
): ReconciledWeek[] {
  if (!deload.suggested || !current || current.focus === 'deload') return weeks;

  const alvo = weeks.find((w) => w.focus === 'deload' && w.weekNumber > current.weekNumber);
  if (!alvo) return weeks;

  return weeks.map((week) => {
    if (week.weekNumber === current.weekNumber) {
      return {
        ...week,
        focus: alvo.focus,
        intensityFactor: alvo.intensityFactor,
        volumeFactor: alvo.volumeFactor,
      };
    }
    if (week.weekNumber === alvo.weekNumber) {
      return {
        ...week,
        focus: current.focus,
        intensityFactor: current.intensityFactor,
        volumeFactor: current.volumeFactor,
      };
    }
    return week;
  });
}

function explain(
  status: 'active' | 'completed' | 'abandoned',
  current: ReconciledWeek | null,
  deload: DeloadSignal,
): string {
  if (status === 'completed') return 'Bloco concluído. Dá para começar o próximo.';
  if (status === 'abandoned') {
    return `Bloco encerrado: ${MAX_MISSED_LABEL} sem nenhuma sessão. Comece um novo quando voltar.`;
  }
  if (!current) return 'Bloco sem semana corrente.';

  const partes = [describeWeek(current)];
  if (current.shiftedWeeks > 0) {
    partes.push(
      current.shiftedWeeks === 1
        ? 'Você perdeu uma semana e o bloco esperou: esta continua sendo a semana ' +
            `${current.weekNumber}.`
        : `Você perdeu ${current.shiftedWeeks} semanas e o bloco esperou: esta continua sendo a semana ${current.weekNumber}.`,
    );
  }
  if (deload.suggested) {
    partes.push(
      `O deload veio para cá: seu RPE subiu ${formatDelta(deload.rpeDelta)} ponto(s) com a mesma carga nas últimas ${DELOAD_WINDOW} sessões.`,
    );
  }
  return partes.join(' ');
}

const MAX_MISSED_LABEL = '3 semanas seguidas';

function formatDelta(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
