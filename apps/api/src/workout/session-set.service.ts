import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { rpeToFeeling } from './helpers/feeling';
import { isCardioExercise } from './helpers/is-cardio';
import { estimate1RM } from './helpers/estimate-1rm';
import { monthEvolution, pickHighlight, type MonthEvolution } from './helpers/month-evolution';
import { readableExercises } from './helpers/exercise-access';

export interface PersonalRecordEntry {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string;
  type: 'strength' | 'cardio';
  // Força
  maxWeightKg: number | null;
  repsAtMax: number | null;
  estimated1RM: number | null;
  // Cardio
  maxDistanceMeters: number | null;
  bestDurationSeconds: number | null;
  // Comum
  achievedAt: string | null;
  lastPerformedAt: string | null;
  totalSets: number;
  /** Força: o 1RM estimado do começo e do fim dos últimos 30 dias, em % (#382). */
  monthEvolution: MonthEvolution | null;
}

export interface RecordsOverview {
  records: PersonalRecordEntry[];
  /** "Maior evolução do mês": o recorde de maior % positiva, ou `null`. */
  highlight: PersonalRecordEntry | null;
}

interface CreateSetInput {
  sessionId: string;
  exerciseId: number;
  weightKg?: number;
  reps?: number;
  rpe?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  kcalBurned?: number;
  notes?: string;
  clientKey?: string;
}

interface UpdateSetInput {
  weightKg?: number;
  reps?: number;
  rpe?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  kcalBurned?: number;
  notes?: string;
}

@Injectable()
export class SessionSetService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSetInput) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { id: dto.sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const exercise = await this.prisma.exercise.findFirst({
      where: {
        id: dto.exerciseId,
        ...readableExercises(userId),
      },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');

    const isCardio = isCardioExercise(exercise);
    const hasStrengthFields = dto.weightKg !== undefined || dto.reps !== undefined;
    const hasCardioFields = dto.durationSeconds !== undefined;

    if (isCardio && hasStrengthFields) {
      throw new BadRequestException('Exercício de cardio requer durationSeconds');
    }
    if (!isCardio && hasCardioFields) {
      throw new BadRequestException('Exercício de força requer weightKg e reps');
    }
    // Série sem repetições, tempo nem distância não é série: contaria no
    // progresso e no resumo sem nada feito (o "+ Série" sem série para copiar).
    if (dto.reps == null && dto.durationSeconds == null && dto.distanceMeters == null) {
      throw new BadRequestException('A série precisa de repetições, tempo ou distância');
    }

    const agg = await this.prisma.sessionSet.aggregate({
      where: { sessionId: dto.sessionId, exerciseId: dto.exerciseId },
      _max: { setNumber: true },
    });
    const setNumber = (agg._max.setNumber ?? 0) + 1;

    const { sessionId, exerciseId, clientKey, ...fields } = dto;
    // O mesmo "Concluir série" reenviado: devolve a que já existe. A checagem
    // antes é o caminho comum (rede que repete); o P2002 do índice único
    // (sessionId, clientKey) cobre as duas chegando juntas.
    if (clientKey) {
      const existing = await this.findByClientKey(sessionId, clientKey, exerciseId);
      if (existing) return existing;
    }
    try {
      return await this.prisma.sessionSet.create({
        data: { sessionId, exerciseId, setNumber, clientKey: clientKey ?? null, ...fields },
        include: { exercise: true },
      });
    } catch (error) {
      if (
        clientKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByClientKey(sessionId, clientKey, exerciseId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * A série já gravada com esta chave. Chave repetida em outro exercício não é
   * reenvio, é cliente com defeito: devolver a série alheia faria o app mostrar
   * a carga de um exercício no outro.
   */
  private async findByClientKey(sessionId: string, clientKey: string, exerciseId: number) {
    const existing = await this.prisma.sessionSet.findUnique({
      where: { sessionId_clientKey: { sessionId, clientKey } },
      include: { exercise: true },
    });
    if (existing && existing.exerciseId !== exerciseId) {
      throw new ConflictException('clientKey já usada por outra série desta sessão.');
    }
    return existing;
  }

  /**
   * "Seus números" do Como fazer (prancha `Al-T9-Como-fazer`): o recorde, a
   * última vez (do último treino terminado, com a sensação da última série) e
   * o máximo estimado. Tudo pelo `userId`.
   */
  async exerciseStats(userId: string, exerciseId: number) {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: exerciseId, ...readableExercises(userId) },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');
    const cardio = isCardioExercise(exercise);

    const [record, lastSession, strengthSets] = await Promise.all([
      this.getPersonalRecord(userId, exerciseId),
      this.prisma.workoutSession.findFirst({
        where: { userId, completedAt: { not: null }, sets: { some: { exerciseId } } },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          startedAt: true,
          sets: { where: { exerciseId }, orderBy: { setNumber: 'asc' } },
        },
      }),
      cardio
        ? Promise.resolve([])
        : this.prisma.sessionSet.findMany({
            where: { exerciseId, session: { userId }, weightKg: { gt: 0 }, reps: { gt: 0 } },
            select: { weightKg: true, reps: true },
          }),
    ]);

    let last: {
      date: Date;
      sets: number;
      best: {
        weightKg: number | null;
        reps: number | null;
        distanceMeters: number | null;
        durationSeconds: number | null;
      };
      feeling: number | null;
    } | null = null;
    if (lastSession && lastSession.sets.length) {
      const sets = lastSession.sets;
      const best = cardio
        ? {
            weightKg: null,
            reps: null,
            distanceMeters: sets.reduce((a, x) => a + (x.distanceMeters ?? 0), 0) || null,
            durationSeconds: sets.reduce((a, x) => a + (x.durationSeconds ?? 0), 0) || null,
          }
        : (() => {
            const top = [...sets].sort(
              (a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
            )[0]!;
            return {
              weightKg: top.weightKg,
              reps: top.reps,
              distanceMeters: null,
              durationSeconds: null,
            };
          })();
      last = {
        date: lastSession.startedAt,
        sets: sets.length,
        best,
        feeling: rpeToFeeling(sets.at(-1)?.rpe),
      };
    }

    let estimated1RM: number | null = null;
    for (const s of strengthSets) {
      const e = estimate1RM(s.weightKg!, s.reps!);
      if (estimated1RM === null || e > estimated1RM) estimated1RM = e;
    }

    return {
      exerciseId,
      isCardio: cardio,
      record: record
        ? 'weightKg' in record
          ? {
              weightKg: record.weightKg,
              reps: record.reps,
              distanceMeters: null,
              durationSeconds: null,
              date: record.sessionDate,
            }
          : {
              weightKg: null,
              reps: null,
              distanceMeters: record.distanceMeters,
              durationSeconds: record.durationSeconds,
              date: record.sessionDate,
            }
        : null,
      last,
      estimated1RM: estimated1RM === null ? null : Math.round(estimated1RM * 10) / 10,
    };
  }

  async update(userId: string, id: string, dto: UpdateSetInput, sessionId?: string) {
    const set = await this.assertOwnerSet(userId, id, sessionId);

    const exercise = await this.prisma.exercise.findUnique({ where: { id: set.exerciseId } });
    if (!exercise) throw new NotFoundException('Exercise not found');
    const isCardio = isCardioExercise(exercise);
    const hasStrengthFields = dto.weightKg !== undefined || dto.reps !== undefined;
    const hasCardioFields = dto.durationSeconds !== undefined;

    if (isCardio && hasStrengthFields) {
      throw new BadRequestException('Exercício de cardio requer durationSeconds');
    }
    if (!isCardio && hasCardioFields) {
      throw new BadRequestException('Exercício de força requer weightKg e reps');
    }

    return this.prisma.sessionSet.update({
      where: { id },
      data: dto,
      include: { exercise: true },
    });
  }

  async delete(userId: string, id: string, sessionId?: string): Promise<void> {
    await this.assertOwnerSet(userId, id, sessionId);
    await this.prisma.sessionSet.delete({ where: { id } });
  }

  /** Quais destes exercícios a pessoa já treinou — uma consulta, em vez de uma por exercício. */
  async trainedAmong(userId: string, exerciseIds: number[]): Promise<Set<number>> {
    if (exerciseIds.length === 0) return new Set();
    const linhas = await this.prisma.sessionSet.findMany({
      where: { exerciseId: { in: exerciseIds }, session: { userId } },
      distinct: ['exerciseId'],
      select: { exerciseId: true },
    });
    return new Set(linhas.map((l) => l.exerciseId));
  }

  async getLastForExercise(userId: string, exerciseId: number, before?: string) {
    return this.prisma.sessionSet.findFirst({
      where: {
        exerciseId,
        session: {
          userId,
          ...(before ? { startedAt: { lt: new Date(before) } } : {}),
        },
      },
      orderBy: [{ session: { startedAt: 'desc' } }, { setNumber: 'desc' }],
      include: { exercise: true, session: { select: { startedAt: true } } },
    });
  }

  async getPersonalRecord(userId: string, exerciseId: number) {
    const exercise = await this.prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        ...readableExercises(userId),
      },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');

    if (isCardioExercise(exercise)) {
      const groups = await this.prisma.sessionSet.groupBy({
        by: ['sessionId'],
        where: { exerciseId, session: { userId }, distanceMeters: { not: null } },
        _sum: { distanceMeters: true, durationSeconds: true },
        orderBy: { _sum: { distanceMeters: 'desc' } },
        take: 1,
      });
      if (groups.length === 0) return null;
      const group = groups[0];
      const session = await this.prisma.workoutSession.findUnique({
        where: { id: group.sessionId },
        select: { startedAt: true },
      });
      return {
        distanceMeters: group._sum.distanceMeters,
        durationSeconds: group._sum.durationSeconds,
        sessionDate: session?.startedAt ?? null,
      };
    }

    const top = await this.prisma.sessionSet.findFirst({
      where: { exerciseId, session: { userId }, weightKg: { not: null } },
      orderBy: [{ weightKg: 'desc' }, { reps: 'desc' }],
      select: { weightKg: true, reps: true, session: { select: { startedAt: true } } },
    });
    if (!top) return null;
    return {
      weightKg: top.weightKg,
      reps: top.reps,
      sessionDate: top.session.startedAt,
    };
  }

  /**
   * Lista o recorde pessoal de cada exercício que o usuário já treinou.
   * Força: maior carga (desempate por reps) + 1RM estimado.
   * Cardio: maior distância (com a duração daquela sessão).
   * Agrega em memória — escala pessoal (poucos milhares de séries) torna isso suficiente.
   */
  async listPersonalRecords(userId: string): Promise<PersonalRecordEntry[]> {
    const sets = await this.prisma.sessionSet.findMany({
      where: { session: { userId } },
      select: {
        exerciseId: true,
        weightKg: true,
        reps: true,
        distanceMeters: true,
        durationSeconds: true,
        exercise: { select: { id: true, name: true, muscleGroup: true } },
        session: { select: { id: true, startedAt: true, completedAt: true } },
      },
    });

    const byExercise = new Map<number, PersonalRecordEntry>();
    const e1rmPoints = new Map<number, Array<{ sessionId: string; at: Date; e1rm: number }>>();
    for (const s of sets) {
      const ex = s.exercise;
      const date = s.session.startedAt.toISOString();
      let entry = byExercise.get(ex.id);
      if (!entry) {
        entry = {
          exerciseId: ex.id,
          exerciseName: ex.name,
          muscleGroup: ex.muscleGroup,
          type: isCardioExercise(ex) ? 'cardio' : 'strength',
          maxWeightKg: null,
          repsAtMax: null,
          estimated1RM: null,
          maxDistanceMeters: null,
          bestDurationSeconds: null,
          achievedAt: null,
          lastPerformedAt: null,
          totalSets: 0,
          monthEvolution: null,
        };
        byExercise.set(ex.id, entry);
      }

      entry.totalSets += 1;
      if (!entry.lastPerformedAt || date > entry.lastPerformedAt) entry.lastPerformedAt = date;

      if (entry.type === 'cardio') {
        if (
          s.distanceMeters != null &&
          (entry.maxDistanceMeters == null || s.distanceMeters > entry.maxDistanceMeters)
        ) {
          entry.maxDistanceMeters = s.distanceMeters;
          entry.bestDurationSeconds = s.durationSeconds ?? null;
          entry.achievedAt = date;
        }
      } else if (s.weightKg != null) {
        const better =
          entry.maxWeightKg == null ||
          s.weightKg > entry.maxWeightKg ||
          (s.weightKg === entry.maxWeightKg && (s.reps ?? 0) > (entry.repsAtMax ?? 0));
        if (better) {
          entry.maxWeightKg = s.weightKg;
          entry.repsAtMax = s.reps ?? null;
          entry.achievedAt = date;
        }
        if (s.reps != null) {
          const e1rm = estimate1RM(s.weightKg, s.reps);
          if (entry.estimated1RM == null || e1rm > entry.estimated1RM) entry.estimated1RM = e1rm;
          // Carga 0 é peso do corpo (#377): sem 1RM estimado que compare. A sessão ainda aberta
          // fica fora: a evolução do mês compara treinos concluídos, não a série de agora.
          if (s.weightKg > 0 && s.session.completedAt != null) {
            const points = e1rmPoints.get(ex.id) ?? [];
            points.push({ sessionId: s.session.id, at: s.session.startedAt, e1rm });
            e1rmPoints.set(ex.id, points);
          }
        }
      }
    }

    const now = new Date();
    for (const [exerciseId, points] of e1rmPoints) {
      byExercise.get(exerciseId)!.monthEvolution = monthEvolution(points, now);
    }

    // Mais recentes primeiro.
    return [...byExercise.values()].sort((a, b) =>
      (b.lastPerformedAt ?? '').localeCompare(a.lastPerformedAt ?? ''),
    );
  }

  /** `GET /workout/records` e `list_personal_records`: os recordes e o destaque do mês (Al-G5). */
  async recordsOverview(userId: string): Promise<RecordsOverview> {
    const records = await this.listPersonalRecords(userId);
    return { records, highlight: pickHighlight(records) };
  }

  /**
   * A série é da pessoa e, quando a rota traz a sessão
   * (`/sessions/:sessionId/sets/:id`), é daquela sessão: o id da URL filha
   * fica preso ao pai. O MCP não manda sessão e confere só o dono.
   */
  private async assertOwnerSet(userId: string, id: string, sessionId?: string) {
    const set = await this.prisma.sessionSet.findFirst({
      where: { id, ...(sessionId ? { sessionId } : {}) },
      include: { session: { select: { userId: true } } },
    });
    // Mesma resposta para "não existe" e "não é sua" (§IDs de docs/MCP.md).
    if (!set || set.session.userId !== userId) throw new NotFoundException('Set not found');
    return set;
  }
}
