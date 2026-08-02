import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SessionSetService } from './session-set.service';
import { isCardioExercise } from './helpers/is-cardio';
import {
  HISTORY_WINDOW,
  prescribeLoad,
  type PrescriptionOutcome,
  type PrescriptionSession,
} from './helpers/prescribe-load';

/**
 * Busca o histórico e delega a regra ao helper puro (#144).
 *
 * Não escreve nada, e é de propósito: "registrar sempre o que foi executado,
 * nunca o sugerido" sai de graça se a prescrição é um `GET` puro. `SessionSet`
 * não ganhou coluna nenhuma — medir aderência à sugestão é outra issue.
 */
@Injectable()
export class PrescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sets: SessionSetService,
  ) {}

  async forExercise(
    userId: string,
    exerciseId: number,
    targetReps?: string,
  ): Promise<PrescriptionOutcome> {
    const exercise = await this.prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');

    if (isCardioExercise(exercise)) return { status: 'cardio_exercise' };

    // Clonar um exercício para editar o nome cria um `id` novo (`clonedFromId`)
    // e a base some das listagens. Filtrar só pelo id pedido faria o histórico
    // — e com ele a prescrição — desaparecer no dia em que a pessoa renomeia o
    // exercício. O id da base vem do registro já autorizado acima, nunca de
    // input: é o próprio `clonedFromId` que amarra o filho ao pai (#204).
    const exerciseIds = exercise.clonedFromId
      ? [exercise.id, exercise.clonedFromId]
      : [exercise.id];

    const validStrengthSet = {
      exerciseId: { in: exerciseIds },
      weightKg: { not: null },
      reps: { not: null },
    };

    // Janela por **sessão** e não por dias: uma sessão antiga registrada
    // retroativamente hoje entraria numa janela por data e viraria a base.
    const sessions = await this.prisma.workoutSession.findMany({
      where: { userId, sets: { some: validStrengthSet } },
      orderBy: { startedAt: 'desc' },
      take: HISTORY_WINDOW,
      select: {
        startedAt: true,
        sets: { where: validStrengthSet, select: { weightKg: true, reps: true, rpe: true } },
      },
    });

    const record = await this.sets.getPersonalRecord(userId, exerciseId);
    // `getPersonalRecord` devolve uma união força × cardio; o ramo de cardio
    // não tem `weightKg`, e um teto `undefined` não seria teto nenhum.
    const personalRecordKg = record && 'weightKg' in record ? (record.weightKg ?? null) : null;

    return prescribeLoad({
      sessions: sessions.map(toPrescriptionSession),
      mechanic: exercise.mechanic,
      targetReps,
      personalRecordKg,
    });
  }
}

interface HistorySession {
  startedAt: Date;
  sets: Array<{ weightKg: number | null; reps: number | null; rpe: number | null }>;
}

/** O `where` já exclui nulo; o `filter` é o que convence o TypeScript disso. */
function toPrescriptionSession(session: HistorySession): PrescriptionSession {
  return {
    startedAt: session.startedAt,
    sets: session.sets
      .filter(
        (set): set is { weightKg: number; reps: number; rpe: number | null } =>
          set.weightKg !== null && set.reps !== null,
      )
      .map((set) => ({ weightKg: set.weightKg, reps: set.reps, rpe: set.rpe })),
  };
}
