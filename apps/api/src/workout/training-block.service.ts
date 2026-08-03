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
  DELOAD_CANDIDATE_SESSIONS,
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
   * Cria o bloco de 4 semanas ancorado na segunda-feira em que a semana 1 de fato
   * começa (ver `blockStartDate`), no fuso do usuário. Os fatores do template são
   * **copiados** para as linhas: o bloco que a pessoa aceitou não pode mudar
   * quando `block-template.ts` mudar.
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
    const startDate = blockStartDate(ctx.timezone);

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

    // Resolvido uma vez só: o sinal é medido para mais de uma semana logo abaixo, e
    // cada medição repetiria a mesma consulta de exercícios do plano.
    const exerciseIds = block.planId ? await this.planExerciseIds(block.planId) : null;

    // Janela congelada: só sessões concluídas ANTES da semana corrente entram no
    // sinal. Medir com as sessões da própria semana faria a sugestão piscar a cada
    // série registrada — e "por que a semana mudou de novo?" é exatamente a
    // pergunta que esta issue existe para evitar.
    const deload = current
      ? await this.deloadSignal(ctx, exerciseIds, current.effectiveWeekStart)
      : ({ suggested: false, reason: 'insufficient_history' } as const);

    const antecipada = await this.anticipatedDeloadWeek(
      ctx,
      exerciseIds,
      reconciled.weeks,
      current,
      deload,
    );
    const weeks = swapDeloadInto(reconciled.weeks, antecipada);
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
      explanation: explain(
        reconciled.status,
        currentView,
        deload,
        antecipada !== null && antecipada === reconciled.currentWeekNumber,
      ),
    };
  }

  /**
   * A semana que **ficou** com o deload antecipado — `null` quando nenhuma ficou.
   *
   * Procura desde a semana 1, e não só na corrente, porque a antecipação precisa
   * sobreviver à leitura seguinte. Recalculando só com o sinal de hoje, a semana 2
   * saía como deload numa leitura e voltava a acúmulo na outra (o deload já feito
   * derruba o RPE que produziu o sinal), e a semana 4 voltava a ser deload: dois
   * deloads em quatro semanas, e a linha do tempo reescrevendo o que ela mesma
   * prescreveu. Como a janela de cada semana é congelada no início dela, o sinal de
   * uma semana passada é o mesmo em toda leitura — a antecipação é derivada e ainda
   * assim estável, sem coluna nova e sem gravar durante o `GET` (ADR 019).
   *
   * A primeira semana que sinaliza fica com o deload; as seguintes não repetem a
   * troca, senão o bloco teria mais de uma semana leve.
   */
  private async anticipatedDeloadWeek(
    ctx: BlockUserCtx,
    exerciseIds: number[] | null,
    weeks: ReconciledWeek[],
    current: ReconciledWeek | undefined,
    currentSignal: DeloadSignal,
  ): Promise<number | null> {
    if (!current) return null;

    for (const week of weeks) {
      if (week.weekNumber > current.weekNumber) break;
      if (week.focus === 'deload') continue;

      const sinal =
        week.weekNumber === current.weekNumber
          ? currentSignal
          : await this.deloadSignal(ctx, exerciseIds, week.effectiveWeekStart);
      if (sinal.suggested) return week.weekNumber;
    }
    return null;
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
    exerciseIds: number[] | null,
    before: string,
  ): Promise<DeloadSignal> {
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
      // Mais que `DELOAD_WINDOW`: quem pula sessão sem RPE é o helper, e ele só tem
      // o que pular se sobrar candidata. Buscando exatamente a janela, uma única
      // sessão recente sem RPE preenchido zerava o sinal para sempre.
      take: DELOAD_CANDIDATE_SESSIONS,
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
 * Segunda-feira em que a semana 1 começa, no fuso do usuário.
 *
 * Bloco montado numa quinta **não** pode começar na segunda que já passou: a semana
 * 1 nasceria com a janela quase vencida e, sem nenhuma sessão feita sob o bloco, a
 * primeira leitura da segunda seguinte já a daria por perdida — queimando uma das
 * três faltas que encerram o bloco por ausência, por uma semana que terminou antes
 * de o bloco existir. O simétrico é igualmente errado: contar os treinos de antes
 * da criação entregaria a semana 1 cumprida sem nenhuma sessão feita sob o bloco.
 * Ancorar na próxima segunda faz o combinado valer para o tempo que ainda existe.
 */
function blockStartDate(timezone: string): string {
  const hoje = todayInTz(timezone);
  const segundaDestaSemana = weekStartInTz(new Date(), timezone);
  return hoje === segundaDestaSemana ? hoje : addDaysIso(segundaDestaSemana, 7);
}

/**
 * O sinal **antecipa** a semana de deload que já existe; nunca cria uma quinta.
 *
 * A troca é de fatores e foco entre a semana que sinalizou e a de deload ainda à
 * frente — o bloco continua tendo 4 semanas, e a semana empurrada vira a última.
 */
function swapDeloadInto(weeks: ReconciledWeek[], weekNumber: number | null): ReconciledWeek[] {
  if (weekNumber === null) return weeks;

  const origem = weeks.find((w) => w.weekNumber === weekNumber);
  if (!origem) return weeks;

  const alvo = weeks.find((w) => w.focus === 'deload' && w.weekNumber > origem.weekNumber);
  if (!alvo) return weeks;

  return weeks.map((week) => {
    if (week.weekNumber === origem.weekNumber) {
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
        focus: origem.focus,
        intensityFactor: origem.intensityFactor,
        volumeFactor: origem.volumeFactor,
      };
    }
    return week;
  });
}

function explain(
  status: 'active' | 'completed' | 'abandoned',
  current: ReconciledWeek | null,
  deload: DeloadSignal,
  /** O deload antecipado caiu na semana corrente — só aí a frase dele faz sentido. */
  deloadAntecipadoAqui: boolean,
): string {
  if (status === 'completed') return 'Bloco concluído. Dá para começar o próximo.';
  if (status === 'abandoned') {
    return `Bloco encerrado: ${MAX_MISSED_LABEL} sem nenhuma sessão. Comece um novo quando voltar.`;
  }
  if (!current) return 'Bloco sem semana corrente.';

  const partes = [describeWeek(current)];
  // Bloco montado no meio da semana começa na segunda seguinte: sem dizer a data, o
  // card pareceria afirmar que a semana 1 já está correndo.
  if (current.state === 'upcoming') {
    partes.push(`O bloco começa na segunda, ${diaEMes(current.effectiveWeekStart)}.`);
  }
  if (current.shiftedWeeks > 0) {
    partes.push(
      current.shiftedWeeks === 1
        ? 'Você perdeu uma semana e o bloco esperou: esta continua sendo a semana ' +
            `${current.weekNumber}.`
        : `Você perdeu ${current.shiftedWeeks} semanas e o bloco esperou: esta continua sendo a semana ${current.weekNumber}.`,
    );
  }
  if (deload.suggested && deloadAntecipadoAqui) {
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

/** `2026-01-12` → `12/01`. A data já vem no fuso do usuário. */
function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}
