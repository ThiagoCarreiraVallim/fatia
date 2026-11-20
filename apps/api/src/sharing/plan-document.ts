import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { PrismaService } from '../common/prisma.service';
import { CATALOG_EXERCISE } from '../workout/helpers/exercise-access';
import { isCardioExercise } from '../workout/helpers/is-cardio';
import { definicaoCustomSchema, describeIssues, type DefinicaoCustom } from './plan-snapshot';
import {
  assertPlanSnapshotV2,
  cleanCircuitBlock,
  MAX_PLAN_SESSIONS,
  MAX_SESSION_NAME,
  PLAN_CIRCUIT_FORMATS,
  PLAN_SNAPSHOT_V2,
  prescricaoV2,
  sessionExercises,
  TIME_CAP_LIMITS,
  type PlanCircuitBlock,
  type PlanExerciseItem,
  type PlanSessionItem,
  type PlanSnapshotV2,
} from './plan-snapshot-v2';
import { MAX_EXERCICIOS_NO_SNAPSHOT } from './plan-snapshot';
import { CIRCUIT_LIMITS, MAX_CIRCUIT_EXERCISES } from '../workout/helpers/circuit';

/**
 * O documento do editor de plano de treino (#406, Pn-09): o que a tela manda
 * e recebe. É o retrato v2 com o exercício pelo id (o da biblioteca: catálogo,
 * comunidade ou da conta de quem edita) em vez da origem; o servidor resolve a
 * origem e congela o retrato. O exercício que já viajou por valor (`custom`)
 * volta e vai como veio.
 */
const exerciseRef = {
  type: z.literal('exercise'),
  // Nulo no que viaja por valor: é como a tela recebe e devolve.
  exerciseId: z.number().int().positive().nullable().optional(),
  custom: definicaoCustomSchema.optional(),
};

// Objeto puro (sem refine) para a união discriminada por `type` dizer o campo
// que está errado; "id ou definição" é conferido no documento inteiro.
const docExerciseSchema = z.object({ ...exerciseRef, ...prescricaoV2 });

const campo = (c: keyof typeof CIRCUIT_LIMITS) =>
  z.number().int().min(CIRCUIT_LIMITS[c][0]).max(CIRCUIT_LIMITS[c][1]).optional();

const docCircuitSchema = z.object({
  type: z.literal('circuit'),
  name: z.string().max(MAX_SESSION_NAME).optional(),
  format: z.enum(PLAN_CIRCUIT_FORMATS),
  durationSeconds: campo('durationSeconds'),
  workSeconds: campo('workSeconds'),
  restSeconds: campo('restSeconds'),
  intervals: campo('intervals'),
  rounds: campo('rounds'),
  restBetweenRoundsSeconds: campo('restBetweenRoundsSeconds'),
  timeCapSeconds: z.number().int().min(TIME_CAP_LIMITS[0]).max(TIME_CAP_LIMITS[1]).optional(),
  exercises: z.array(docExerciseSchema).min(1).max(MAX_CIRCUIT_EXERCISES),
});

export const planDocumentSchema = z
  .object({
    sessions: z
      .array(
        z.object({
          name: z.string().max(MAX_SESSION_NAME),
          weekday: z.number().int().min(1).max(7).nullable().optional(),
          items: z
            .array(z.discriminatedUnion('type', [docCircuitSchema, docExerciseSchema]))
            .max(MAX_EXERCICIOS_NO_SNAPSHOT),
        }),
      )
      .min(1)
      .max(MAX_PLAN_SESSIONS),
  })
  .superRefine((doc, ctx) => {
    doc.sessions.forEach((s, si) =>
      s.items.forEach((item, ii) => {
        const list = item.type === 'circuit' ? item.exercises : [item];
        list.forEach((e, ei) => {
          if ((e.exerciseId == null) === (e.custom === undefined)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path:
                item.type === 'circuit'
                  ? ['sessions', si, 'items', ii, 'exercises', ei]
                  : ['sessions', si, 'items', ii],
              message: 'cada exercício vem pelo id da biblioteca ou pela definição, um dos dois',
            });
          }
        });
      }),
    );
  });

export type PlanDocumentInput = z.infer<typeof planDocumentSchema>;
type DocExercise = z.infer<typeof docExerciseSchema>;

/** Exercício do documento, como a tela mostra. */
export type DocumentExerciseView = Omit<PlanExerciseItem, 'source'> & {
  type: 'exercise';
  /** O da biblioteca (catálogo ou comunidade); nulo no que viaja por valor. */
  exerciseId: number | null;
  /** A definição do exercício que viaja por valor. */
  custom?: DefinicaoCustom;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  isCardio: boolean;
  /** A comunidade tem guia (vídeo, fotos) deste exercício. */
  hasGuide: boolean;
};

export type DocumentCircuitView = Omit<PlanCircuitBlock, 'exercises'> & {
  exercises: DocumentExerciseView[];
};

export interface PlanDocumentView {
  sessions: Array<{
    name: string;
    weekday: number | null;
    items: Array<DocumentExerciseView | DocumentCircuitView>;
  }>;
}

const NOT_AVAILABLE = (id: number) =>
  `O exercício ${id} não está disponível para este plano (não é do catálogo, desta comunidade nem seu).`;

/** Lê o documento do corpo (já passou pelo DTO como objeto); erro vira 400 legível. */
export function parsePlanDocument(raw: unknown): PlanDocumentInput {
  const parsed = planDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException(`Plano inválido (${describeIssues(parsed.error)}).`);
  }
  for (const [i, s] of parsed.data.sessions.entries()) {
    if (s.items.length === 0) {
      throw new BadRequestException(
        `A sessão ${s.name.trim() || i + 1} está vazia: adicione um exercício ou tire a sessão.`,
      );
    }
  }
  return parsed.data;
}

/**
 * Congela o documento num retrato v2. O exercício pelo id é procurado com a
 * comunidade e quem edita: catálogo público por referência; o da comunidade
 * por referência no modelo da biblioteca (`groupByValue: false`) e por valor
 * na cópia de um aluno; o da conta de quem edita, sempre por valor. Qualquer
 * outro id (de outra pessoa, de outra academia) é 400, antes de gravar.
 */
export async function documentToSnapshot(
  prisma: PrismaService,
  doc: PlanDocumentInput,
  name: string,
  ctx: { editorId: string; groupId: string; groupByValue: boolean },
): Promise<PlanSnapshotV2> {
  const all: DocExercise[] = doc.sessions.flatMap((s) =>
    s.items.flatMap((i) => (i.type === 'circuit' ? i.exercises : [i])),
  );
  const ids = [...new Set(all.flatMap((e) => (e.exerciseId ? [e.exerciseId] : [])))];
  const rows = ids.length
    ? await prisma.exercise.findMany({
        where: {
          id: { in: ids },
          OR: [
            CATALOG_EXERCISE,
            { groupOwned: true, groupId: ctx.groupId },
            { createdByUserId: ctx.editorId, groupOwned: false },
          ],
        },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = ids.find((id) => !byId.has(id));
  if (missing !== undefined) throw new BadRequestException(NOT_AVAILABLE(missing));

  const toItem = (e: DocExercise): PlanExerciseItem => {
    const { type: _t, exerciseId, custom, ...prescription } = e;
    void _t;
    let source:
      | { source: 'catalog'; catalogExerciseId: number }
      | { source: 'group'; groupExerciseId: number }
      | { source: 'custom'; exercise: DefinicaoCustom };
    let cardio: boolean;
    if (custom) {
      source = { source: 'custom', exercise: custom };
      cardio = isCardioExercise(custom);
    } else {
      const row = byId.get(exerciseId!)!;
      cardio = isCardioExercise(row);
      if (!row.groupOwned && row.createdByUserId === null) {
        source = { source: 'catalog', catalogExerciseId: row.id };
      } else if (row.groupOwned && !ctx.groupByValue) {
        source = { source: 'group', groupExerciseId: row.id };
      } else {
        source = { source: 'custom', exercise: definitionOf(row) };
      }
    }
    return { type: 'exercise', ...source, ...cleanPrescription(prescription, cardio) };
  };

  const sessions = doc.sessions.map((s) => ({
    name: s.name.trim(),
    ...(s.weekday ? { weekday: s.weekday } : {}),
    items: s.items.map((i): PlanSessionItem => {
      if (i.type === 'circuit') {
        return cleanCircuitBlock({ ...i, exercises: i.exercises.map(toItem) });
      }
      return toItem(i);
    }),
  }));
  return assertPlanSnapshotV2(
    { version: PLAN_SNAPSHOT_V2, name: name.slice(0, 100), sessions },
    'Este plano não pode ser salvo',
  );
}

/** Só o que vale para o tipo de exercício e de carga; o padrão não viaja. */
function cleanPrescription(
  p: Omit<DocExercise, 'type' | 'exerciseId' | 'custom'>,
  cardio: boolean,
): Omit<
  PlanExerciseItem,
  'type' | 'source' | 'catalogExerciseId' | 'groupExerciseId' | 'exercise'
> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null) continue;
    if (!cardio && k.startsWith('cardio')) continue;
    if (k === 'loadPercent' && p.loadMode !== 'PERCENT_1RM') continue;
    if (k === 'warmupBefore' && v === false) continue;
    if (k === 'biSetWithNext' && v === false) continue;
    if (k === 'notes' && typeof v === 'string' && !v.trim()) continue;
    out[k] = v;
  }
  return out as ReturnType<typeof cleanPrescription>;
}

/** A definição de um exercício para viajar por valor (sem id, sem dono). */
function definitionOf(row: {
  name: string;
  muscleGroup: string;
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  youtubeVideoId: string | null;
  youtubeVideoIdPt: string | null;
}): DefinicaoCustom {
  return Object.fromEntries(
    Object.entries({
      name: row.name,
      muscleGroup: row.muscleGroup,
      equipment: row.equipment,
      level: row.level,
      mechanic: row.mechanic,
      primaryMuscles: row.primaryMuscles,
      secondaryMuscles: row.secondaryMuscles,
      instructions: row.instructions,
      youtubeVideoId: row.youtubeVideoId,
      youtubeVideoIdPt: row.youtubeVideoIdPt,
    }).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)),
  ) as DefinicaoCustom;
}

/**
 * O retrato como a tela do editor lê: nome, grupo e equipamento de cada
 * exercício, e se a comunidade tem guia dele. Exercício do catálogo e da
 * comunidade (desta) pelo id; o que viaja por valor, pela definição.
 */
export async function snapshotToDocument(
  prisma: PrismaService,
  snap: PlanSnapshotV2,
  groupId: string,
): Promise<PlanDocumentView> {
  const all = snap.sessions.flatMap(sessionExercises);
  const catalog = all.flatMap((e) => (e.source === 'catalog' ? [e.catalogExerciseId] : []));
  const group = all.flatMap((e) => (e.source === 'group' ? [e.groupExerciseId] : []));
  const rows =
    catalog.length || group.length
      ? await prisma.exercise.findMany({
          where: {
            OR: [
              { id: { in: catalog }, ...CATALOG_EXERCISE },
              { id: { in: group }, groupOwned: true, groupId },
            ],
          },
          select: { id: true, name: true, muscleGroup: true, equipment: true },
        })
      : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const guides = new Set(
    rows.length
      ? (
          await prisma.groupExerciseGuide.findMany({
            where: { groupId, exerciseId: { in: rows.map((r) => r.id) } },
            select: { exerciseId: true },
          })
        ).map((g) => g.exerciseId)
      : [],
  );
  const view = (item: PlanExerciseItem): DocumentExerciseView => {
    const { source: _s, ...rest } = item;
    void _s;
    const prescription = Object.fromEntries(
      Object.entries(rest).filter(
        ([k]) => k !== 'catalogExerciseId' && k !== 'groupExerciseId' && k !== 'exercise',
      ),
    ) as Omit<PlanExerciseItem, 'source'>;
    if (item.source === 'custom') {
      return {
        ...prescription,
        type: 'exercise',
        exerciseId: null,
        custom: item.exercise,
        name: item.exercise.name,
        muscleGroup: item.exercise.muscleGroup,
        equipment: item.exercise.equipment ?? null,
        isCardio: isCardioExercise(item.exercise),
        hasGuide: false,
      };
    }
    const id = item.source === 'catalog' ? item.catalogExerciseId : item.groupExerciseId;
    const row = byId.get(id);
    return {
      ...prescription,
      type: 'exercise',
      exerciseId: id,
      name: row?.name ?? 'Exercício',
      muscleGroup: row?.muscleGroup ?? null,
      equipment: row?.equipment ?? null,
      isCardio: row ? isCardioExercise(row) : false,
      hasGuide: guides.has(id),
    };
  };
  return {
    sessions: snap.sessions.map((s) => ({
      name: s.name,
      weekday: s.weekday ?? null,
      items: s.items.map((i) =>
        i.type === 'circuit' ? { ...i, exercises: i.exercises.map(view) } : view(i),
      ),
    })),
  };
}
