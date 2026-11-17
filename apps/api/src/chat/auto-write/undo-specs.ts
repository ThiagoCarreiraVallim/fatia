import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  type GoalKind,
  type GoalStatus,
  type MealItemSource,
  type MealType,
  type StepSource,
} from '@prisma/client';
import type { PrismaService } from '../../common/prisma.service';

/**
 * A operação inversa de cada tool que pode gravar sozinha (ADR 039, item 3; #385).
 *
 * **Só é automática a tool que está aqui.** Uma tool com categoria e sem inversa continua
 * pedindo o OK, mesmo com a categoria em Automático: sem Desfazer exato, o automático deixaria
 * de ser reversível, que é a condição da ADR. O `auto-write.spec.ts` reprova entrada aqui que
 * apague, que seja restrita ou que não tenha categoria.
 *
 * Duas formas, e só duas:
 *
 * - **criou**: o Desfazer apaga o que foi criado, pelo id que o resultado da tool trouxe;
 * - **mudou**: o retrato guarda as colunas da linha antes de gravar, e o Desfazer as escreve de
 *   volta, inclusive as que a tool não tocou — "restaura o estado exato".
 *
 * Toda leitura e escrita aqui casa o id **e** o dono: o id vem do modelo (argumento) ou do
 * resultado, e nenhum dos dois prova de quem é a linha.
 */

export interface AutoWriteRecord {
  input: Record<string, unknown>;
  result: unknown;
  before: unknown;
}

export interface UndoSpec {
  /** O retrato antes de gravar (só na forma "mudou"). */
  before?(db: PrismaService, input: Record<string, unknown>, userId: string): Promise<unknown>;
  /** Desfaz. Linha que já não existe é 409: alguém (a pessoa) mexeu nela depois. */
  revert(db: PrismaService, record: AutoWriteRecord, userId: string): Promise<void>;
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');

/** O id que o resultado trouxe, no campo que a tool usa. */
const idDoResultado =
  (campo = 'id') =>
  (result: unknown): string => {
    const valor =
      result && typeof result === 'object' ? (result as Record<string, unknown>)[campo] : null;
    if (typeof valor !== 'string' || !valor) {
      throw new ConflictException('A gravação não trouxe o id do que foi criado.');
    }
    return valor;
  };

function exigirUma(count: number): void {
  if (count !== 1) {
    throw new ConflictException('O registro mudou ou foi apagado depois. Nada foi desfeito.');
  }
}

/** JSON do banco de volta para o Prisma: `null` em coluna Json precisa do marcador. */
function json(valor: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return valor === null || valor === undefined ? Prisma.DbNull : (valor as Prisma.InputJsonValue);
}

const data = (valor: unknown): Date | null => (valor ? new Date(String(valor)) : null);

/** As colunas de um retrato, do jeito que ele foi gravado em JSON. */
type Retrato = Record<string, unknown>;

const retrato = (before: unknown): Retrato => {
  if (!before || typeof before !== 'object') {
    throw new ConflictException('Não há retrato de antes para restaurar.');
  }
  return before as Retrato;
};

export const AUTO_UNDO: Readonly<Record<string, UndoSpec>> = {
  // ------------------------------------------------------------ Registros do dia
  log_meal: {
    async revert(db, { result }, userId) {
      // Os itens saem em cascata. O "comi isso" do plano também (`NutritionPlanLog`).
      const { count } = await db.meal.deleteMany({
        where: { id: idDoResultado()(result), userId },
      });
      exigirUma(count);
    },
  },
  add_meal_item: {
    async revert(db, { result }, userId) {
      const { count } = await db.mealItem.deleteMany({
        where: { id: idDoResultado()(result), meal: { userId } },
      });
      exigirUma(count);
    },
  },
  update_meal: {
    before: (db, input, userId) =>
      db.meal.findFirst({
        where: { id: texto(input.id), userId },
        select: { mealType: true, eatenAt: true, notes: true },
      }),
    async revert(db, { input, before }, userId) {
      const r = retrato(before);
      const { count } = await db.meal.updateMany({
        where: { id: texto(input.id), userId },
        data: {
          mealType: r.mealType as MealType,
          eatenAt: data(r.eatenAt) ?? undefined,
          notes: (r.notes as string | null) ?? null,
        },
      });
      exigirUma(count);
    },
  },
  update_meal_item: {
    before: (db, input, userId) =>
      db.mealItem.findFirst({
        where: { id: texto(input.id), meal: { userId } },
        select: {
          foodId: true,
          groupId: true,
          foodName: true,
          grams: true,
          kcal: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
          nutrients: true,
          portionLabel: true,
          portionQuantity: true,
          source: true,
        },
      }),
    async revert(db, { input, before }, userId) {
      const r = retrato(before);
      const { count } = await db.mealItem.updateMany({
        where: { id: texto(input.id), meal: { userId } },
        data: {
          foodId: (r.foodId as number | null) ?? null,
          groupId: (r.groupId as number | null) ?? null,
          foodName: String(r.foodName),
          grams: Number(r.grams),
          kcal: Number(r.kcal),
          proteinG: Number(r.proteinG),
          carbsG: Number(r.carbsG),
          fatG: Number(r.fatG),
          nutrients: json(r.nutrients),
          portionLabel: (r.portionLabel as string | null) ?? null,
          portionQuantity: (r.portionQuantity as number | null) ?? null,
          source: r.source as MealItemSource,
        },
      });
      exigirUma(count);
    },
  },
  log_water: {
    async revert(db, { result }, userId) {
      const { count } = await db.waterLog.deleteMany({
        where: { id: idDoResultado('waterLogId')(result), userId },
      });
      exigirUma(count);
    },
  },
  update_water_log: {
    before: (db, input, userId) =>
      db.waterLog.findFirst({
        where: { id: texto(input.id), userId },
        select: { date: true, ml: true, loggedAt: true, notes: true },
      }),
    async revert(db, { input, before }, userId) {
      const r = retrato(before);
      const { count } = await db.waterLog.updateMany({
        where: { id: texto(input.id), userId },
        data: {
          date: String(r.date),
          ml: Number(r.ml),
          loggedAt: data(r.loggedAt) ?? undefined,
          notes: (r.notes as string | null) ?? null,
        },
      });
      exigirUma(count);
    },
  },
  log_weight: {
    async revert(db, { result }, userId) {
      const { count } = await db.weightLog.deleteMany({
        where: { id: idDoResultado('weightLogId')(result), userId },
      });
      exigirUma(count);
    },
  },
  update_weight_log: {
    before: (db, input, userId) =>
      db.weightLog.findFirst({
        where: { id: texto(input.weightLogId), userId },
        select: { weightKg: true, loggedAt: true, notes: true },
      }),
    async revert(db, { input, before }, userId) {
      const r = retrato(before);
      const { count } = await db.weightLog.updateMany({
        where: { id: texto(input.weightLogId), userId },
        data: {
          weightKg: Number(r.weightKg),
          loggedAt: data(r.loggedAt) ?? undefined,
          notes: (r.notes as string | null) ?? null,
        },
      });
      exigirUma(count);
    },
  },
  log_steps: {
    async revert(db, { result }, userId) {
      const { count } = await db.stepLog.deleteMany({
        where: { id: idDoResultado('stepLogId')(result), userId },
      });
      exigirUma(count);
    },
  },
  update_step_log: {
    before: (db, input, userId) =>
      db.stepLog.findFirst({
        where: { id: texto(input.stepLogId), userId },
        select: { date: true, steps: true, source: true, loggedAt: true, notes: true },
      }),
    async revert(db, { input, before }, userId) {
      const r = retrato(before);
      const { count } = await db.stepLog.updateMany({
        where: { id: texto(input.stepLogId), userId },
        data: {
          date: String(r.date),
          steps: Number(r.steps),
          source: r.source as StepSource,
          loggedAt: data(r.loggedAt) ?? undefined,
          notes: (r.notes as string | null) ?? null,
        },
      });
      exigirUma(count);
    },
  },

  // ------------------------------------------------------------ Treino
  start_workout_session: {
    async revert(db, { result }, userId) {
      const id = idDoResultado()(result);
      // Com série gravada depois, apagar a sessão levaria junto o que a pessoa fez à mão.
      const series = await db.sessionSet.count({ where: { sessionId: id, session: { userId } } });
      if (series > 0) {
        throw new ConflictException('O treino já tem séries. Apague pela tela do treino.');
      }
      const { count } = await db.workoutSession.deleteMany({ where: { id, userId } });
      exigirUma(count);
    },
  },
  log_set: {
    async revert(db, { result }, userId) {
      const { count } = await db.sessionSet.deleteMany({
        where: { id: idDoResultado()(result), session: { userId } },
      });
      exigirUma(count);
    },
  },
  update_set: {
    before: (db, input, userId) =>
      db.sessionSet.findFirst({
        where: { id: texto(input.setId), session: { userId } },
        select: {
          weightKg: true,
          reps: true,
          rpe: true,
          durationSeconds: true,
          distanceMeters: true,
          avgHeartRate: true,
          kcalBurned: true,
          notes: true,
        },
      }),
    async revert(db, { input, before }, userId) {
      const r = retrato(before);
      const n = (campo: string) => (r[campo] as number | null) ?? null;
      const { count } = await db.sessionSet.updateMany({
        where: { id: texto(input.setId), session: { userId } },
        data: {
          weightKg: n('weightKg'),
          reps: n('reps'),
          rpe: n('rpe'),
          durationSeconds: n('durationSeconds'),
          distanceMeters: n('distanceMeters'),
          avgHeartRate: n('avgHeartRate'),
          kcalBurned: n('kcalBurned'),
          notes: (r.notes as string | null) ?? null,
        },
      });
      exigirUma(count);
    },
  },

  // ------------------------------------------------------------ Metas
  create_goal: {
    async revert(db, { result }, userId) {
      const { count } = await db.goal.deleteMany({
        where: { id: idDoResultado()(result), userId },
      });
      exigirUma(count);
    },
  },
  update_goal: goalSnapshot(),
  complete_goal: goalSnapshot(),

  // ------------------------------------------------------------ Memórias
  save_memory: {
    async revert(db, { result }, userId) {
      const { count } = await db.userMemory.deleteMany({
        where: { id: idDoResultado()(result), userId },
      });
      exigirUma(count);
    },
  },
};

/** Meta mudada (editar ou concluir): o retrato é a linha inteira, menos id, dono e criação. */
function goalSnapshot(): UndoSpec {
  return {
    before: (db, input, userId) =>
      db.goal.findFirst({
        where: { id: texto(input.goalId), userId },
        select: {
          kind: true,
          title: true,
          description: true,
          startValue: true,
          targetValue: true,
          unit: true,
          lastReportedValue: true,
          deadline: true,
          status: true,
          completedAt: true,
        },
      }),
    async revert(db, { input, before }, userId) {
      const r = retrato(before);
      const { count } = await db.goal.updateMany({
        where: { id: texto(input.goalId), userId },
        data: {
          kind: r.kind as GoalKind,
          title: String(r.title),
          description: (r.description as string | null) ?? null,
          startValue: Number(r.startValue),
          targetValue: Number(r.targetValue),
          unit: String(r.unit),
          lastReportedValue: (r.lastReportedValue as number | null) ?? null,
          deadline: data(r.deadline),
          status: r.status as GoalStatus,
          completedAt: data(r.completedAt),
        },
      });
      exigirUma(count);
    },
  };
}

/**
 * Quantos itens a ação mexe de uma vez: o maior array dos argumentos (os itens da refeição, os
 * exercícios da nova ordem). Acima de `AUTO_WRITE_MAX_ITEMS`, volta a pedir OK (ADR 039, item 4).
 * O agente conta igual (`auto_write.py`), para não pedir à API o que ela vai recusar.
 */
export function itemsTouched(input: Record<string, unknown>): number {
  let maior = 1;
  for (const valor of Object.values(input)) {
    if (Array.isArray(valor)) maior = Math.max(maior, valor.length);
  }
  return maior;
}
