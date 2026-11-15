import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type {
  AddPlanExerciseDto,
  AddPlanExercisesDto,
  CreatePlanDto,
  PlanSetDto,
  ReorderExercisesDto,
  UpdatePlanDto,
  UpdatePlanExerciseDto,
} from './dto/plan.dto';
import { readableExercises } from './helpers/exercise-access';
import { isCardioExercise } from './helpers/is-cardio';
import {
  DEFAULT_STRENGTH_REPS,
  DEFAULT_STRENGTH_SETS,
  assertCardioTarget,
  assertRepRange,
  hasCardioInput,
  summarizeSets,
} from './helpers/plan-exercise-config';

/** A linha do plano com o exercício e a tabela série por série, na ordem. */
const PLAN_EXERCISE_INCLUDE = {
  exercise: true,
  sets: { orderBy: { order: 'asc' as const } },
} as const;

const PLAN_INCLUDE = {
  exercises: {
    include: PLAN_EXERCISE_INCLUDE,
    orderBy: { order: 'asc' as const },
  },
} as const;

type PlanRow = Prisma.WorkoutPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

/** O plano com quantas vezes foi feito e quando foi o último (Al-T6, Al-T7). */
export type PlanView = PlanRow & { timesDone: number; lastDoneAt: Date | null };

const isPrismaCode = (err: unknown, code: string) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const setRows = (sets: ReadonlyArray<PlanSetDto>) =>
  sets.map((s, i) => ({
    order: i + 1,
    kind: s.kind ?? 'NORMAL',
    reps: s.reps,
    loadKg: s.loadKg ?? null,
  }));

@Injectable()
export class WorkoutPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreatePlanDto) {
    return this.prisma.workoutPlan.create({
      data: { userId, name: dto.name },
      include: PLAN_INCLUDE,
    });
  }

  async findById(userId: string, id: string): Promise<PlanView> {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { id, userId },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw new NotFoundException('Plan not found');
    const [withStats] = await this.withStats(userId, [plan]);
    return withStats;
  }

  async list(userId: string): Promise<PlanView[]> {
    const plans = await this.prisma.workoutPlan.findMany({
      where: { userId },
      include: PLAN_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return this.withStats(userId, plans);
  }

  /**
   * "Feito 12 vezes · último há 4 dias": só sessões encerradas, e só as da
   * pessoa — o `userId` no filtro é o mesmo do plano lido.
   */
  private async withStats(userId: string, plans: PlanRow[]): Promise<PlanView[]> {
    if (plans.length === 0) return [];
    const stats = await this.prisma.workoutSession.groupBy({
      by: ['planId'],
      where: { userId, planId: { in: plans.map((p) => p.id) }, completedAt: { not: null } },
      _count: { _all: true },
      _max: { startedAt: true },
    });
    const byPlan = new Map(stats.map((s) => [s.planId, s]));
    return plans.map((p) => ({
      ...p,
      timesDone: byPlan.get(p.id)?._count._all ?? 0,
      lastDoneAt: byPlan.get(p.id)?._max.startedAt ?? null,
    }));
  }

  async update(userId: string, id: string, dto: UpdatePlanDto) {
    await this.assertOwner(userId, id);
    return this.prisma.workoutPlan.update({
      where: { id },
      data: dto,
      include: PLAN_INCLUDE,
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    // `deleteMany` com o dono no filtro: o segundo toque do "Excluir" (ou uma
    // exclusão em outra aba entre a conferência e o delete) é 404, não o P2025
    // que virava 500.
    const { count } = await this.prisma.workoutPlan.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Plan not found');
  }

  async addExercise(userId: string, planId: string, dto: AddPlanExerciseDto) {
    await this.assertOwner(userId, planId);
    // O id de `Exercise` é inteiro sequencial: sem esta conferência, o
    // exercício pessoal de outra pessoa (ou o de uma comunidade de que ela não
    // faz parte) entrava no plano, e o `include` devolvia o nome dele (#92).
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: dto.exerciseId, ...readableExercises(userId) },
      select: { id: true, muscleGroup: true },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');

    const { exerciseId, order, sets, ...config } = dto;
    const cardio = isCardioExercise(exercise);
    this.assertConfig(config, cardio, {});

    const summary = sets?.length ? summarizeSets(sets) : null;
    // Um exercício por plano (`@@unique([planId, exerciseId])`): a sessão ainda
    // agrupa as séries por exercício, e duas linhas iguais dividiriam as séries
    // e sairiam juntas ao remover uma. Repetir fica para outra issue.
    try {
      return await this.prisma.workoutPlanExercise.create({
        data: {
          ...config,
          planId,
          exerciseId,
          order: order ?? (await this.nextOrder(planId)),
          targetSets:
            summary?.targetSets ?? config.targetSets ?? (cardio ? 1 : DEFAULT_STRENGTH_SETS),
          targetReps:
            summary?.targetReps ?? config.targetReps ?? (cardio ? '' : DEFAULT_STRENGTH_REPS),
          ...(sets?.length ? { sets: { create: setRows(sets) } } : {}),
        },
        include: PLAN_EXERCISE_INCLUDE,
      });
    } catch (err) {
      if (isPrismaCode(err, 'P2002')) {
        throw new ConflictException('Esse exercício já está no plano');
      }
      throw err;
    }
  }

  /**
   * Seleção múltipla do "Adicionar exercício" (Al-T8): entram no fim, na ordem
   * da seleção, com o padrão de cada tipo. Um id que a pessoa não enxerga recusa
   * o lote inteiro antes de qualquer escrita.
   *
   * Idempotente: o que já está no plano (ou se repete no lote) fica de fora, sem
   * erro. Repetir o pedido depois de perder a resposta devolve o mesmo plano, e
   * dois lotes ao mesmo tempo esbarram no único e o `skipDuplicates` descarta.
   */
  async addExercises(userId: string, planId: string, dto: AddPlanExercisesDto): Promise<PlanView> {
    await this.assertOwner(userId, planId);
    const ids = [...new Set(dto.exercises.map((e) => e.exerciseId))];
    const visible = await this.prisma.exercise.findMany({
      where: { id: { in: ids }, ...readableExercises(userId) },
      select: { id: true, muscleGroup: true },
    });
    if (visible.length !== ids.length) throw new NotFoundException('Exercise not found');
    const byId = new Map(visible.map((e) => [e.id, e]));

    const already = await this.prisma.workoutPlanExercise.findMany({
      where: { planId, exerciseId: { in: ids } },
      select: { exerciseId: true },
    });
    const inPlan = new Set(already.map((e) => e.exerciseId));
    const fresh = ids.filter((id) => !inPlan.has(id));
    if (fresh.length > 0) {
      const start = await this.nextOrder(planId);
      await this.prisma.workoutPlanExercise.createMany({
        data: fresh.map((exerciseId, i) => {
          const cardio = isCardioExercise(byId.get(exerciseId)!);
          return {
            planId,
            exerciseId,
            order: start + i,
            targetSets: cardio ? 1 : DEFAULT_STRENGTH_SETS,
            targetReps: cardio ? '' : DEFAULT_STRENGTH_REPS,
          };
        }),
        skipDuplicates: true,
      });
    }
    return this.findById(userId, planId);
  }

  async updatePlanExercise(
    userId: string,
    planId: string,
    planExerciseId: string,
    dto: UpdatePlanExerciseDto,
  ) {
    await this.assertOwner(userId, planId);
    const pe = await this.prisma.workoutPlanExercise.findFirst({
      where: { id: planExerciseId, planId },
      include: { exercise: { select: { muscleGroup: true } } },
    });
    if (!pe) throw new NotFoundException('Plan exercise not found');

    const { sets, ...config } = dto;
    this.assertConfig(config, isCardioExercise(pe.exercise), pe);

    const data: Prisma.WorkoutPlanExerciseUpdateInput = { ...config };
    if (sets !== undefined) {
      // A tabela é substituída inteira, no mesmo `update` (uma transação).
      // Séries e faixa saem dela, para a sessão e o MCP lerem o mesmo número.
      data.sets = sets?.length ? { deleteMany: {}, create: setRows(sets) } : { deleteMany: {} };
      if (sets?.length) Object.assign(data, summarizeSets(sets));
    } else if (config.targetSets !== undefined || config.targetReps !== undefined) {
      // Séries e faixa digitadas no modo simples valem sobre a tabela: ela sai,
      // senão a tela mostraria uma coisa e a sessão faria outra.
      data.sets = { deleteMany: {} };
    }

    try {
      return await this.prisma.workoutPlanExercise.update({
        where: { id: planExerciseId },
        data,
        include: PLAN_EXERCISE_INCLUDE,
      });
    } catch (err) {
      // Removido em outra aba entre a conferência e a escrita.
      if (isPrismaCode(err, 'P2025')) throw new NotFoundException('Plan exercise not found');
      throw err;
    }
  }

  async removeExercise(userId: string, planId: string, planExerciseId: string): Promise<void> {
    await this.assertOwner(userId, planId);
    // `deleteMany` amarrado ao plano: o segundo toque de "Remover" é 404, não 500.
    const { count } = await this.prisma.workoutPlanExercise.deleteMany({
      where: { id: planExerciseId, planId },
    });
    if (count === 0) throw new NotFoundException('Plan exercise not found');
  }

  async reorderExercises(userId: string, planId: string, dto: ReorderExercisesDto) {
    await this.assertOwner(userId, planId);

    // Ser dono do plano da URL não autoriza escrever em qualquer `WorkoutPlanExercise`: os ids
    // vêm do corpo da requisição, e sem amarrá-los a este plano dava para reordenar o plano de
    // outra pessoa mandando o id dela aqui. É o que `updatePlanExercise` e `removeExercise` já
    // fazem logo acima, e o que faltava só aqui.
    const ids = dto.exercises.map((e) => e.id);
    const owned = await this.prisma.workoutPlanExercise.count({
      where: { id: { in: ids }, planId },
    });
    // Mesma resposta para "não existe" e "não é deste plano" (§IDs de docs/MCP.md).
    if (owned !== new Set(ids).size) throw new NotFoundException('Plan exercise not found');

    await this.prisma.$transaction(
      dto.exercises.map(({ id, order }) =>
        // `updateMany` com o `planId` no filtro: mesmo que a verificação acima passe a mentir um
        // dia, a escrita continua sem alcançar linha de outro plano.
        this.prisma.workoutPlanExercise.updateMany({
          where: { id, planId },
          data: { order },
        }),
      ),
    );
    return this.findById(userId, planId);
  }

  /**
   * Faixa de repetições coerente e meta de cardio só em exercício de cardio.
   * `current` é a linha que já existe (vazio na criação): a meta é conferida
   * com o que fica gravado depois da escrita, não só com o que chegou.
   */
  private assertConfig(
    config: Omit<UpdatePlanExerciseDto, 'sets'>,
    cardio: boolean,
    current: {
      cardioTarget?: string | null;
      cardioDurationSeconds?: number | null;
      cardioDistanceMeters?: number | null;
      cardioIntensity?: string | null;
    },
  ): void {
    assertRepRange(config.targetReps);
    if (!cardio) {
      if (hasCardioInput(config)) {
        throw new BadRequestException('Meta de cardio só vale para exercício de cardio.');
      }
      return;
    }
    const pick = <K extends keyof typeof config & keyof typeof current>(k: K) =>
      config[k] !== undefined ? config[k] : current[k];
    assertCardioTarget({
      cardioTarget: pick('cardioTarget') as 'TIME' | 'DISTANCE' | null | undefined,
      cardioDurationSeconds: pick('cardioDurationSeconds') as number | null | undefined,
      cardioDistanceMeters: pick('cardioDistanceMeters') as number | null | undefined,
    });
  }

  /** Depois do último. `order` tem buracos (remover não renumera), então é máximo + 1. */
  private async nextOrder(planId: string): Promise<number> {
    const { _max } = await this.prisma.workoutPlanExercise.aggregate({
      where: { planId },
      _max: { order: true },
    });
    return (_max.order ?? 0) + 1;
  }

  private async assertOwner(userId: string, planId: string) {
    const plan = await this.prisma.workoutPlan.findUnique({ where: { id: planId } });
    // Mesma resposta para "não existe" e "não é seu" (§IDs de docs/MCP.md).
    if (!plan || plan.userId !== userId) throw new NotFoundException('Plan not found');
    return plan;
  }
}
