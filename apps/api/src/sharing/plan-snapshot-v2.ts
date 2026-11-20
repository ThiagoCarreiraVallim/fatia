import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { CIRCUIT_LIMITS, MAX_CIRCUIT_EXERCISES } from '../workout/helpers/circuit';
import {
  definicaoCustomSchema,
  describeIssues,
  MAX_EXERCICIOS_NO_SNAPSHOT,
  PLAN_SNAPSHOT_VERSION,
  planSnapshotSchema,
  prescricao,
  type PlanSnapshot,
} from './plan-snapshot';

/**
 * Retrato v2 do plano de treino (#406): o plano da equipe com sessões (A, B,
 * C…), cada uma com exercícios e blocos de circuito, na ordem do editor.
 *
 * A v1 (`plan-snapshot.ts`) continua sendo escrita pelo "a partir do seu plano"
 * e continua legível: `readPlanSnapshot` a devolve como v2 de uma sessão só.
 * Quem lê retrato lê por aqui, e nunca precisa saber de qual versão veio.
 *
 * Na conta da pessoa, cada sessão vira um plano (`WorkoutPlan.sessionIndex`):
 * a sessão de treino, o "previous", PR e volume continuam por plano e por
 * exercício, sem o app mudar.
 */
export const PLAN_SNAPSHOT_V2 = 2;

/** Formatos do bloco de circuito (Pn-09c). ROUNDS é o superset (decisão da #406). */
export const PLAN_CIRCUIT_FORMATS = ['AMRAP', 'EMOM', 'TABATA', 'FOR_TIME', 'ROUNDS'] as const;
export type PlanCircuitFormatValue = (typeof PLAN_CIRCUIT_FORMATS)[number];

export const MAX_PLAN_SESSIONS = 14;
export const MAX_SESSION_NAME = 60;
/** Teto de exercícios no plano inteiro (todas as sessões). */
export const MAX_PLAN_EXERCISES_TOTAL = 200;
export const MAX_PLAN_TAGS = 8;
export const MAX_TAG_LENGTH = 30;
/** For Time: o limite opcional, na mesma faixa da duração. */
export const TIME_CAP_LIMITS = CIRCUIT_LIMITS.durationSeconds;

// A prescrição sem `order`: na v2 a ordem é a posição na lista.
export const { order: _order, ...prescricaoV2 } = prescricao;
void _order;

const exerciseItemSchema = z.discriminatedUnion('source', [
  z.object({
    type: z.literal('exercise'),
    source: z.literal('catalog'),
    catalogExerciseId: z.number().int().positive(),
    ...prescricaoV2,
  }),
  z.object({
    type: z.literal('exercise'),
    source: z.literal('custom'),
    exercise: definicaoCustomSchema,
    ...prescricaoV2,
  }),
  z.object({
    type: z.literal('exercise'),
    source: z.literal('group'),
    groupExerciseId: z.number().int().positive(),
    ...prescricaoV2,
  }),
]);

const campo = (campo: keyof typeof CIRCUIT_LIMITS) =>
  z.number().int().min(CIRCUIT_LIMITS[campo][0]).max(CIRCUIT_LIMITS[campo][1]).optional();

const circuitBlockSchema = z.object({
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
  exercises: z.array(exerciseItemSchema).min(1).max(MAX_CIRCUIT_EXERCISES),
});

const sessionItemSchema = z.union([circuitBlockSchema, exerciseItemSchema]);

const sessionSchema = z.object({
  name: z.string().max(MAX_SESSION_NAME),
  /** Modo Agenda: o dia da semana ISO (1 = segunda … 7 = domingo). */
  weekday: z.number().int().min(1).max(7).optional(),
  items: z.array(sessionItemSchema).min(1).max(MAX_EXERCICIOS_NO_SNAPSHOT),
});

export type PlanExerciseItem = z.infer<typeof exerciseItemSchema>;
export type PlanCircuitBlock = z.infer<typeof circuitBlockSchema>;
export type PlanSessionItem = z.infer<typeof sessionItemSchema>;
export type PlanSession = z.infer<typeof sessionSchema>;

/** A chave do exercício no retrato: catálogo e comunidade pelo id, o do autor pelo nome. */
export function itemKey(item: PlanExerciseItem): string {
  if (item.source === 'catalog') return `catalog:${item.catalogExerciseId}`;
  if (item.source === 'group') return `group:${item.groupExerciseId}`;
  return `custom:${item.exercise.name}`;
}

/** Os exercícios da sessão em ordem, os do circuito no lugar dele. */
export function sessionExercises(session: PlanSession): PlanExerciseItem[] {
  return session.items.flatMap((i) => (i.type === 'circuit' ? i.exercises : [i]));
}

/** Os campos que cada formato usa (o resto é descartado): os de `CircuitConfig` e mais Rounds. */
const CIRCUIT_FIELDS: Record<
  PlanCircuitFormatValue,
  { required: Array<keyof typeof CIRCUIT_LIMITS>; optional: string[] }
> = {
  AMRAP: { required: ['durationSeconds'], optional: [] },
  EMOM: { required: ['durationSeconds'], optional: [] },
  TABATA: { required: ['workSeconds', 'restSeconds', 'intervals'], optional: [] },
  FOR_TIME: { required: ['rounds'], optional: ['restBetweenRoundsSeconds', 'timeCapSeconds'] },
  ROUNDS: { required: ['rounds'], optional: ['restBetweenRoundsSeconds'] },
};

const CIRCUIT_LABELS: Record<string, string> = {
  durationSeconds: 'a duração',
  workSeconds: 'o trabalho',
  restSeconds: 'o descanso',
  intervals: 'os intervalos',
  rounds: 'os rounds',
};

export const planSnapshotV2Schema = z
  .object({
    version: z.literal(PLAN_SNAPSHOT_V2),
    name: z.string().max(100),
    sessions: z.array(sessionSchema).min(1).max(MAX_PLAN_SESSIONS),
  })
  .superRefine((snap, ctx) => {
    let total = 0;
    const dias = new Set<number>();
    snap.sessions.forEach((session, s) => {
      // Na conta da pessoa a sessão vira um plano, e a sessão de treino agrupa
      // as séries por exercício: o mesmo exercício duas vezes na mesma sessão
      // (num circuito e solto, ou repetido) somaria as séries dos dois.
      const vistos = new Set<string>();
      sessionExercises(session).forEach((item) => {
        total += 1;
        const chave = itemKey(item);
        if (vistos.has(chave)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sessions', s],
            message: 'o mesmo exercício aparece duas vezes na sessão',
          });
        }
        vistos.add(chave);
      });
      if (session.weekday !== undefined) {
        if (dias.has(session.weekday)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sessions', s, 'weekday'],
            message: 'duas sessões no mesmo dia da semana',
          });
        }
        dias.add(session.weekday);
      }
      session.items.forEach((item, i) => {
        if (item.type !== 'circuit') return;
        for (const f of CIRCUIT_FIELDS[item.format].required) {
          if (item[f] === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['sessions', s, 'items', i, f],
              message: `o circuito precisa de ${CIRCUIT_LABELS[f] ?? f}`,
            });
          }
        }
        if (item.format === 'EMOM' && item.durationSeconds && item.durationSeconds % 60 !== 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sessions', s, 'items', i, 'durationSeconds'],
            message: 'o EMOM dura minutos inteiros',
          });
        }
      });
    });
    if (total > MAX_PLAN_EXERCISES_TOTAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessions'],
        message: `no máximo ${MAX_PLAN_EXERCISES_TOTAL} exercícios no plano`,
      });
    }
  });

export type PlanSnapshotV2 = z.infer<typeof planSnapshotV2Schema>;

/** Só os campos do formato ficam no bloco (o resto é descartado na escrita). */
export function cleanCircuitBlock(block: PlanCircuitBlock): PlanCircuitBlock {
  const keep = new Set<string>([
    ...CIRCUIT_FIELDS[block.format].required,
    ...CIRCUIT_FIELDS[block.format].optional,
  ]);
  const out: Record<string, unknown> = {
    type: 'circuit',
    format: block.format,
    exercises: block.exercises,
  };
  if (block.name?.trim()) out.name = block.name.trim();
  for (const [k, v] of Object.entries(block)) {
    if (keep.has(k) && v !== undefined) out[k] = v;
  }
  return out as PlanCircuitBlock;
}

/** A v1 como v2 de uma sessão só: o circuito da v1 vira o bloco único da sessão. */
export function upgradeV1(v1: PlanSnapshot): PlanSnapshotV2 {
  const exercises = [...v1.exercises]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _o, ...rest }) => {
      void _o;
      return { type: 'exercise' as const, ...rest } as PlanExerciseItem;
    });
  const items: PlanSessionItem[] = v1.circuit
    ? [{ type: 'circuit', ...v1.circuit, exercises } as PlanCircuitBlock]
    : exercises;
  return { version: PLAN_SNAPSHOT_V2, name: v1.name, sessions: [{ name: '', items }] };
}

export type SnapshotRead = { ok: true; snapshot: PlanSnapshotV2 } | { ok: false; error: string };

/**
 * Lê o retrato de qualquer versão e devolve a v2. Versão desconhecida e
 * retrato inválido saem como erro legível (nunca como exceção do Zod).
 */
export function readPlanSnapshot(raw: unknown): SnapshotRead {
  const versao = (raw as { version?: unknown } | null)?.version;
  if (versao === PLAN_SNAPSHOT_VERSION) {
    const v1 = planSnapshotSchema.safeParse(raw);
    return v1.success
      ? { ok: true, snapshot: upgradeV1(v1.data) }
      : { ok: false, error: describeIssues(v1.error) };
  }
  if (versao === PLAN_SNAPSHOT_V2) {
    const v2 = planSnapshotV2Schema.safeParse(raw);
    return v2.success
      ? { ok: true, snapshot: v2.data }
      : { ok: false, error: describeIssues(v2.error) };
  }
  return {
    ok: false,
    error: `versão ${typeof versao === 'number' ? versao : 'desconhecida'} do retrato`,
  };
}

/** `readPlanSnapshot` que devolve nulo no lugar do erro (leituras de tela). */
export const parsePlanSnapshot = (raw: unknown): PlanSnapshotV2 | null => {
  const r = readPlanSnapshot(raw);
  return r.ok ? r.snapshot : null;
};

/** Valida um retrato v2 montado aqui (editor, cópia): o erro é do autor, 400. */
export function assertPlanSnapshotV2(snapshot: unknown, prefix: string): PlanSnapshotV2 {
  const parsed = planSnapshotV2Schema.safeParse(snapshot);
  if (!parsed.success) {
    throw new BadRequestException(`${prefix} (${describeIssues(parsed.error)}).`);
  }
  return parsed.data;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** "A", "B"… pela posição. */
export const sessionLetter = (index: number) => LETTERS[index] ?? String(index + 1);

/**
 * O nome do plano de cada sessão na conta da pessoa. Uma sessão só: o nome do
 * plano. Várias: "Inferior v2 · A · Legs" (cabendo nos 100 do `WorkoutPlan`).
 */
export function sessionPlanName(snapshot: PlanSnapshotV2, index: number): string {
  if (snapshot.sessions.length === 1) return snapshot.name;
  const s = snapshot.sessions[index]!;
  const label = s.name.trim()
    ? `${sessionLetter(index)} · ${s.name.trim()}`
    : `Sessão ${sessionLetter(index)}`;
  const base = snapshot.name.trim();
  return (base ? `${base} · ${label}` : label).slice(0, 100);
}
