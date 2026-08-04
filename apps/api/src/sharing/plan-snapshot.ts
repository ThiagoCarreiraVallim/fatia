import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { muscleGroupSchema, muscleListSchema } from '../workout/helpers/muscle-group';

/**
 * Formato congelado de um plano de treino para atravessar contas (ADR 014).
 *
 * É o **mesmo** formato nas duas direções previstas pela épica B2B: a oferta do
 * profissional ao aluno (#157) e o plano pronto publicado no grupo (#162). Dois
 * formatos significariam dois materializadores, e um deles ficaria para trás no
 * primeiro campo novo de `WorkoutPlan`.
 *
 * **Autocontido de propósito.** O snapshot carrega a *definição* do exercício
 * custom do autor, não o id dele. Referenciar o id seria compartilhar por
 * referência — a alternativa que a ADR 014 rejeita — e teria dois defeitos
 * concretos:
 *
 * 1. `ExerciseService` esconde o exercício custom de terceiro atrás do mesmo
 *    `NOT_FOUND` de inexistente (#92), então quem adota não conseguiria nem
 *    lê-lo para copiar. Afrouxar esse filtro para o materializador transformaria
 *    o id sequencial de `Exercise` em oráculo de existência.
 * 2. O autor apagar o exercício meses depois quebraria uma adoção futura. O
 *    plano pronto fica na biblioteca por tempo indeterminado — congelar o
 *    conteúdo na publicação é o que faz a adoção tardia continuar válida.
 *
 * Exercício do catálogo público continua por **id**: ele não é de ninguém,
 * é o mesmo para todo mundo, e copiá-lo criaria lixo duplicado no catálogo.
 */
export const PLAN_SNAPSHOT_VERSION = 1;

/** Teto por plano. Existe para o snapshot ser um payload, não um dump. */
export const MAX_EXERCICIOS_NO_SNAPSHOT = 50;

/** O que o autor prescreveu para o exercício dentro do plano. */
const prescricao = {
  order: z.number().int().min(1),
  targetSets: z.number().int().min(1).max(50),
  targetReps: z.string().min(1).max(20),
} as const;

/**
 * Definição de exercício custom do autor, viajando por valor.
 *
 * Os campos são os mesmos que `CreateCustomExerciseDto` + `UpdateCustomExerciseDto`
 * aceitam, e a validação de músculo reusa os schemas do próprio domínio: um
 * snapshot com `primaryMuscles: ["peitoral"]` materializaria um exercício que o
 * diagrama muscular não sabe colorir.
 */
const definicaoCustomSchema = z.object({
  name: z.string().min(1).max(200),
  muscleGroup: muscleGroupSchema,
  equipment: z.string().max(100).optional(),
  level: z.string().max(50).optional(),
  mechanic: z.string().max(50).optional(),
  primaryMuscles: muscleListSchema().optional(),
  secondaryMuscles: muscleListSchema().optional(),
  instructions: z.array(z.string().max(2000)).max(50).optional(),
  youtubeVideoId: z.string().max(40).optional(),
  youtubeVideoIdPt: z.string().max(40).optional(),
});

export type DefinicaoCustom = z.infer<typeof definicaoCustomSchema>;

const itemSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('catalog'),
    catalogExerciseId: z.number().int().positive(),
    ...prescricao,
  }),
  z.object({
    source: z.literal('custom'),
    exercise: definicaoCustomSchema,
    ...prescricao,
  }),
]);

export const planSnapshotSchema = z
  .object({
    version: z.literal(PLAN_SNAPSHOT_VERSION),
    name: z.string().min(1).max(100),
    exercises: z.array(itemSchema).min(1).max(MAX_EXERCICIOS_NO_SNAPSHOT),
  })
  .superRefine((snap, ctx) => {
    // `WorkoutPlanExercise` tem `@@unique([planId, exerciseId])`. Sem esta
    // conferência, snapshot com o exercício repetido só falharia no `create`,
    // depois de já ter criado o exercício custom do adotante — sobra sujeira e
    // a mensagem sai como erro de banco.
    //
    // A chave do custom é o nome **cru**, exatamente o que `copiarCustom` usa no
    // `findFirst` e o que o `@@unique([name, createdByUserId])` do Postgres
    // compara — e o Postgres é case-sensitive. Normalizar aqui
    // (`trim().toLowerCase()`) reprovava um plano legítimo: "Prancha" e
    // "prancha" são duas linhas que o autor pode ter, viram dois ids diferentes
    // na adoção e não colidem em `@@unique([planId, exerciseId])`.
    const vistos = new Set<string>();
    snap.exercises.forEach((item, i) => {
      const chave =
        item.source === 'catalog'
          ? `catalog:${item.catalogExerciseId}`
          : `custom:${item.exercise.name}`;
      if (vistos.has(chave)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exercises', i],
          message: 'o mesmo exercício aparece duas vezes no plano',
        });
      }
      vistos.add(chave);
    });
  });

export type PlanSnapshot = z.infer<typeof planSnapshotSchema>;

/** `caminho: motivo; caminho: motivo` — o que o Zod reprovou, em uma linha. */
export const descreverProblemas = (erro: z.ZodError): string =>
  erro.issues.map((i) => `${i.path.join('.') || 'snapshot'}: ${i.message}`).join('; ');

/** A forma mínima de `WorkoutPlan` + exercícios que o snapshot sabe congelar. */
export type PlanoParaCongelar = {
  name: string;
  exercises: ReadonlyArray<{
    order: number;
    targetSets: number;
    targetReps: string;
    exercise: {
      id: number;
      name: string;
      muscleGroup: string;
      createdByUserId: string | null;
      equipment: string | null;
      level: string | null;
      mechanic: string | null;
      primaryMuscles: string[];
      secondaryMuscles: string[];
      instructions: string[];
      youtubeVideoId: string | null;
      youtubeVideoIdPt: string | null;
    };
  }>;
};

/** Omite as chaves cujo valor é nulo ou lista vazia — o snapshot fica menor e o Zod não vê `null`. */
const semVazios = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;

/**
 * Congela um plano do autor no formato que atravessa contas.
 *
 * Roda sobre um plano **já lido com o `userId` do autor** — esta função não
 * consulta banco e não tem noção de posse, então quem a chama continua sendo o
 * responsável por só congelar o que é dele.
 *
 * O resultado passa pelo próprio schema antes de sair: snapshot inválido tem
 * que estourar na publicação, com o autor na frente da tela, e não meses depois
 * na adoção de um membro que não pode fazer nada a respeito.
 *
 * E estoura como `BadRequestException`, não como `ZodError` cru: o que chega
 * aqui é um plano que o autor montou (51 exercícios, nome longo demais), então
 * o erro é dele para corrigir. `ZodError` escapando pela rota vira 500
 * "Internal server error", que não diz o que arrumar.
 */
export function buildPlanSnapshot(plano: PlanoParaCongelar): PlanSnapshot {
  const exercises = plano.exercises.map((item) => {
    const base = {
      order: item.order,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
    };
    if (item.exercise.createdByUserId === null) {
      return { source: 'catalog' as const, catalogExerciseId: item.exercise.id, ...base };
    }
    const { id: _id, createdByUserId: _dono, ...definicao } = item.exercise;
    void _id;
    void _dono;
    return { source: 'custom' as const, exercise: semVazios(definicao), ...base };
  });

  const parsed = planSnapshotSchema.safeParse({
    version: PLAN_SNAPSHOT_VERSION,
    name: plano.name,
    exercises,
  });
  if (!parsed.success) {
    throw new BadRequestException(
      `Este plano não pode ser publicado (${descreverProblemas(parsed.error)}).`,
    );
  }
  return parsed.data;
}
