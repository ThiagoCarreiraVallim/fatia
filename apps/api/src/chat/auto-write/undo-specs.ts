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

/** O cliente do banco: o Prisma de sempre ou o da transação do Desfazer. */
export type Db = Pick<
  PrismaService,
  | 'meal'
  | 'mealItem'
  | 'waterLog'
  | 'weightLog'
  | 'stepLog'
  | 'workoutSession'
  | 'sessionSet'
  | 'goal'
  | 'userMemory'
  | 'reviewSeen'
>;

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

/**
 * O registro que a gravação tocou, para tirar o retrato dele logo depois de gravar e de novo na
 * hora do Desfazer. Diferente em qualquer coisa (inclusive nos filhos que o Desfazer apagaria),
 * o Desfazer recusa com `AUTO_WRITE_CHANGED`: desfazer por cima apagaria o que a pessoa fez depois.
 */
export type Entidade =
  | 'meal'
  | 'mealRow'
  | 'mealItem'
  | 'water'
  | 'weight'
  | 'steps'
  | 'session'
  | 'set'
  | 'goal'
  | 'memory';

export interface UndoSpec {
  entity: Entidade;
  /** O id do registro: do resultado (criou) ou dos argumentos (mudou). */
  target(record: Pick<AutoWriteRecord, 'input' | 'result'>): string;
  /** O retrato antes de gravar (só na forma "mudou"). */
  before?(db: Db, input: Record<string, unknown>, userId: string): Promise<unknown>;
  /** Desfaz. Linha que já não existe é 409: alguém (a pessoa) mexeu nela depois. */
  revert(db: Db, record: AutoWriteRecord, userId: string): Promise<void>;
}

const doResultado =
  (campo = 'id') =>
  ({ result }: Pick<AutoWriteRecord, 'result'>) =>
    idDoResultado(campo)(result);
const doArgumento =
  (campo: string) =>
  ({ input }: Pick<AutoWriteRecord, 'input'>) =>
    texto(input[campo]);

const ITEM_DA_REFEICAO = {
  id: true,
  seq: true,
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
} as const;

/**
 * O estado atual de cada entidade, só do dono. `null` quando já não existe. Os filhos entram
 * onde o Desfazer os levaria junto: os itens e o "comi isso" do plano na refeição criada; as
 * séries, o check-in e o circuito na sessão começada.
 */
export const ESTADO: Readonly<
  Record<Entidade, (db: Db, id: string, userId: string) => Promise<unknown>>
> = {
  meal: (db, id, userId) =>
    db.meal.findFirst({
      where: { id, userId },
      select: {
        mealType: true,
        eatenAt: true,
        notes: true,
        photoFileId: true,
        items: { select: ITEM_DA_REFEICAO, orderBy: { seq: 'asc' } },
        planLogs: { select: { id: true, planMealId: true, optionId: true, itemLinks: true } },
      },
    }),
  mealRow: (db, id, userId) =>
    db.meal.findFirst({
      where: { id, userId },
      select: { mealType: true, eatenAt: true, notes: true },
    }),
  mealItem: (db, id, userId) =>
    db.mealItem.findFirst({ where: { id, meal: { userId } }, select: ITEM_DA_REFEICAO }),
  water: (db, id, userId) => db.waterLog.findFirst({ where: { id, userId } }),
  weight: (db, id, userId) => db.weightLog.findFirst({ where: { id, userId } }),
  steps: (db, id, userId) => db.stepLog.findFirst({ where: { id, userId } }),
  session: (db, id, userId) =>
    db.workoutSession.findFirst({
      where: { id, userId },
      include: {
        sets: { select: { id: true }, orderBy: { id: 'asc' } },
        checkin: { select: { id: true, updatedAt: true } },
      },
    }),
  set: (db, id, userId) => db.sessionSet.findFirst({ where: { id, session: { userId } } }),
  goal: (db, id, userId) => db.goal.findFirst({ where: { id, userId } }),
  memory: (db, id, userId) => db.userMemory.findFirst({ where: { id, userId } }),
};

/** O retrato do registro desta gravação, em JSON (datas viram texto, como no banco). */
export async function stateOf(
  db: Db,
  spec: UndoSpec,
  record: Pick<AutoWriteRecord, 'input' | 'result'>,
  userId: string,
): Promise<unknown> {
  const atual = await ESTADO[spec.entity](db, spec.target(record), userId);
  return atual === null || atual === undefined ? null : JSON.parse(JSON.stringify(atual));
}

/** JSON com as chaves em ordem: o `jsonb` do Postgres não guarda a ordem das chaves. */
export function stableJson(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(stableJson).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor ?? null);
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
    entity: 'meal',
    target: doResultado(),
    async revert(db, { result }, userId) {
      // Os itens saem em cascata. O "comi isso" do plano também (`NutritionPlanLog`).
      const { count } = await db.meal.deleteMany({
        where: { id: idDoResultado()(result), userId },
      });
      exigirUma(count);
    },
  },
  add_meal_item: {
    entity: 'mealItem',
    target: doResultado(),
    async revert(db, { result }, userId) {
      const { count } = await db.mealItem.deleteMany({
        where: { id: idDoResultado()(result), meal: { userId } },
      });
      exigirUma(count);
    },
  },
  update_meal: {
    entity: 'mealRow',
    target: doArgumento('id'),
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
    entity: 'mealItem',
    target: doArgumento('id'),
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
    entity: 'water',
    target: doResultado('waterLogId'),
    async revert(db, { result }, userId) {
      const { count } = await db.waterLog.deleteMany({
        where: { id: idDoResultado('waterLogId')(result), userId },
      });
      exigirUma(count);
    },
  },
  update_water_log: {
    entity: 'water',
    target: doArgumento('id'),
    before: (db, input, userId) =>
      db.waterLog.findFirst({
        where: { id: texto(input.id), userId },
        select: { date: true, ml: true, loggedAt: true, notes: true, editedAt: true },
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
          // A marca de edição volta junto: o registro desfeito é o de antes (#395 I4).
          editedAt: data(r.editedAt),
        },
      });
      exigirUma(count);
    },
  },
  log_weight: {
    entity: 'weight',
    target: doResultado('weightLogId'),
    async revert(db, { result }, userId) {
      const { count } = await db.weightLog.deleteMany({
        where: { id: idDoResultado('weightLogId')(result), userId },
      });
      exigirUma(count);
    },
  },
  update_weight_log: {
    entity: 'weight',
    target: doArgumento('weightLogId'),
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
    entity: 'steps',
    target: doResultado('stepLogId'),
    async revert(db, { result }, userId) {
      const { count } = await db.stepLog.deleteMany({
        where: { id: idDoResultado('stepLogId')(result), userId },
      });
      exigirUma(count);
    },
  },
  update_step_log: {
    entity: 'steps',
    target: doArgumento('stepLogId'),
    before: (db, input, userId) =>
      db.stepLog.findFirst({
        where: { id: texto(input.stepLogId), userId },
        select: {
          date: true,
          steps: true,
          source: true,
          loggedAt: true,
          notes: true,
          editedAt: true,
        },
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
          editedAt: data(r.editedAt),
        },
      });
      exigirUma(count);
    },
  },

  // ------------------------------------------------------------ Treino
  start_workout_session: {
    entity: 'session',
    target: doResultado(),
    async revert(db, { result }, userId) {
      const id = idDoResultado()(result);
      // Com série gravada depois, apagar a sessão levaria junto o que a pessoa fez à mão.
      const series = await db.sessionSet.count({ where: { sessionId: id, session: { userId } } });
      if (series > 0) {
        throw new ConflictException('O treino já tem séries. Apague pela tela do treino.');
      }
      const { count } = await db.workoutSession.deleteMany({ where: { id, userId } });
      exigirUma(count);
      // O "Visto" da equipe (#399) aponta só pelo id: não pode sobrar órfão.
      await db.reviewSeen.deleteMany({
        where: { kind: 'WORKOUT', refId: id, subjectUserId: userId },
      });
    },
  },
  log_set: {
    entity: 'set',
    target: doResultado(),
    async revert(db, { result }, userId) {
      const { count } = await db.sessionSet.deleteMany({
        where: { id: idDoResultado()(result), session: { userId } },
      });
      exigirUma(count);
    },
  },
  update_set: {
    entity: 'set',
    target: doArgumento('setId'),
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
    entity: 'goal',
    target: doResultado(),
    async revert(db, { result }, userId) {
      const id = idDoResultado()(result);
      const { count } = await db.goal.deleteMany({ where: { id, userId } });
      exigirUma(count);
      await db.reviewSeen.deleteMany({ where: { kind: 'GOAL', refId: id, subjectUserId: userId } });
    },
  },
  update_goal: goalSnapshot(),
  complete_goal: goalSnapshot(),

  // ------------------------------------------------------------ Memórias
  save_memory: {
    entity: 'memory',
    target: doResultado(),
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
    entity: 'goal',
    target: doArgumento('goalId'),
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
