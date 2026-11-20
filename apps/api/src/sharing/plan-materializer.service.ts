import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ExerciseService } from '../workout/exercise.service';
import { CATALOG_EXERCISE } from '../workout/helpers/exercise-access';
import { isCardioExercise } from '../workout/helpers/is-cardio';
import { normalizeCircuitConfig, type CircuitFormatValue } from '../workout/helpers/circuit';
import { type DefinicaoCustom } from './plan-snapshot';
import {
  readPlanSnapshot,
  sessionExercises,
  sessionPlanName,
  type PlanCircuitBlock,
  type PlanExerciseItem,
  type PlanSnapshotV2,
} from './plan-snapshot-v2';

const PLAN_INCLUDE = {
  circuit: true,
  circuits: true,
  exercises: {
    include: { exercise: true, sets: { orderBy: { order: 'asc' as const } } },
    orderBy: { order: 'asc' as const },
  },
} as const;

type SnapshotItem = PlanExerciseItem;

/**
 * Os campos de configuração do item (#378, #406), sem a origem do exercício.
 * Meta de cardio só em exercício de cardio: a escrita direta recusa com 400
 * (`assertConfig`); aqui o retrato pode vir forjado ou de um exercício que mudou
 * de grupo, e a adoção descarta os campos em vez de reprovar o plano.
 */
function configOf(item: SnapshotItem, cardio: boolean) {
  const {
    repUnit,
    loadMode,
    startLoadKg,
    loadPercent,
    restSeconds,
    technique,
    biSetWithNext,
    warmupBefore,
    notes,
    cardioTarget,
    cardioDurationSeconds,
    cardioDistanceMeters,
    cardioIntensity,
    cardioCalories,
    cardioInclinePercent,
    cardioZone,
    cardioPaceSecondsPerKm,
    cardioRpe,
    sets,
  } = item;
  return {
    repUnit,
    loadMode,
    startLoadKg,
    loadPercent: loadMode === 'PERCENT_1RM' ? loadPercent : undefined,
    restSeconds,
    technique,
    biSetWithNext,
    warmupBefore,
    notes,
    ...(cardio
      ? {
          cardioTarget,
          cardioDurationSeconds,
          cardioDistanceMeters,
          cardioIntensity,
          cardioCalories,
          cardioInclinePercent,
          cardioZone,
          cardioPaceSecondsPerKm,
          cardioRpe,
        }
      : {}),
    sets,
  };
}

type ExerciseCreate = Prisma.WorkoutPlanExerciseUncheckedCreateWithoutPlanInput;

/** O plano de uma sessão da oferta na conta da pessoa (#406). */
export interface OfferSessionPlan {
  id: string;
  sessionIndex: number;
  /** Modo Agenda: o dia da semana da sessão. */
  weekday: number | null;
}

/** Uma sessão do retrato pronta para virar plano. */
interface SessionPlanData {
  index: number;
  name: string;
  weekday: number | null;
  /** Circuito com relógio (#380): a sessão é um bloco só. */
  circuitConfig:
    (ReturnType<typeof normalizeCircuitConfig> & { format: CircuitFormatValue }) | null;
  /** Circuitos no meio da sessão de séries, com os exercícios deles. */
  circuits: Array<{
    data: Omit<Prisma.WorkoutPlanCircuitUncheckedCreateWithoutPlanInput, 'exercises'>;
    exercises: ExerciseCreate[];
  }>;
  exercises: ExerciseCreate[];
}

/**
 * A **única** máquina de materialização de plano entre contas (ADR 014).
 *
 * Recebe um snapshot congelado e cria o plano como dado de quem adota. Roda com
 * o `userId` de **quem recebe** — o autor não aparece em nenhum `where` daqui
 * para baixo. Depois disto não há vínculo: o plano é dele, e edição posterior do
 * autor não retroage.
 *
 * **Duas entradas, uma máquina.** O aceite de oferta do profissional (#157) e a
 * adoção de plano pronto do grupo (#162) são o mesmo ato com portas diferentes.
 * Se cada issue escrever a sua cópia, as duas divergem no primeiro campo novo de
 * `WorkoutPlan` e o defeito aparece só em uma das entradas. Por isso este service
 * mora em `sharing/` e não em `workout/`: quem materializa é a camada que sabe
 * que existe outra conta do outro lado; os services de domínio seguem sem saber.
 *
 * `grep -rln "prisma\.workoutPlan\.create" apps/api/src --exclude-dir=__tests__`
 * tem que continuar devolvendo dois arquivos só: `workout-plan.service.ts` (o
 * dono cria o próprio plano) e este. Um terceiro é um segundo caminho de cópia.
 *
 * O comando anterior (`grep -rn "workoutPlanExercise" apps/api/src`) prometia
 * isso e não cumpria: casava também `training-block.service.ts`, que só lê, e os
 * specs. Invariante que o comando escrito não confere apodrece calada.
 *
 * **Proveniência:** o plano pronto da comunidade (Fase 7) grava
 * `fromTemplateId`, e é o `ContentService` que confere a cópia já existente
 * (`workoutPlan.findFirst({ where: { userId, fromTemplateId } })`) antes de
 * chamar esta máquina, que continua sem saber de onde o retrato veio. A oferta
 * do profissional (#379) grava `fromOfferId` (`offerPlanWrites`).
 */
@Injectable()
export class PlanMaterializerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExerciseService,
  ) {}

  /**
   * Cria o plano do snapshot sob `userId` — um plano por sessão (#406), com o
   * mesmo `fromTemplateId`. Devolve o da primeira sessão.
   *
   * **Snapshot reprovado não deixa rastro**: toda validação — versão, schema,
   * dedupe e os ids de catálogo — roda antes da primeira escrita, e é só nesses
   * erros que a mensagem diz "Nada foi criado". Depois que a cópia de exercício
   * começa, a garantia acaba: `createCustom`/`updateCustom` são escritas do
   * `ExerciseService`, fora da transação do `workoutPlan.create`, então uma
   * falha no meio (indisponibilidade, `@@unique` numa corrida) pode deixar
   * exercícios custom já copiados na biblioteca de quem adota, sem plano. Eles
   * são exercícios **dele**, editáveis e apagáveis por ele — o que a adoção
   * nunca pode fazer é escrever ali por causa de um snapshot que ela mesma vai
   * recusar.
   *
   * O snapshot chega como `unknown` de propósito: ele vem de coluna `Json`,
   * escrita possivelmente por uma versão anterior do produto, e o `as` que o
   * TypeScript aceitaria de graça não olharia o conteúdo.
   *
   * `groupId` é a comunidade do plano pronto. Sem ela (oferta do profissional),
   * item `source: 'group'` é recusado.
   */
  async materialize(userId: string, snapshot: unknown, fromTemplateId?: string, groupId?: string) {
    const snap = this.validate(snapshot);
    const sessions = await this.buildSessions(userId, snap, groupId);
    const multi = sessions.length > 1;
    const creates = sessions.map((s) => {
      // Id daqui só quando há bloco de circuito: o exercício dele aponta para o plano.
      const id = s.circuits.length ? randomUUID() : undefined;
      return this.prisma.workoutPlan.create({
        data: {
          ...(id ? { id } : {}),
          userId,
          name: s.name,
          fromTemplateId,
          ...(multi ? { sessionIndex: s.index } : {}),
          ...this.planContent(s, id ?? ''),
        },
        include: PLAN_INCLUDE,
      });
    });
    // Um `create` aninhado por sessão, não `$transaction` interativa: cada plano
    // sai numa escrita só do lado do Prisma, sem segurar conexão entre
    // roundtrips — pgbouncer em transaction pooling (ADR 010). Várias sessões
    // vão num lote só: ou entram todas, ou nenhuma.
    const planos = multi ? await this.prisma.$transaction(creates) : [await creates[0]!];
    return planos[0]!;
  }

  /**
   * As escritas dos planos no aceite de uma oferta da equipe (#379, #406),
   * para o aceite pôr na **mesma** transação de lote que a troca de versão e a
   * agenda: ou entra tudo, ou nada. Devolve as escritas sem rodar.
   *
   * Cada sessão do retrato é um plano na conta da pessoa (`sessionIndex`). O
   * plano que a versão aceita já criou para a mesma sessão troca de
   * exercícios no lugar (as sessões feitas continuam ligadas a ele); sessão
   * nova cria plano com o id gerado aqui, para a agenda apontar para ele na
   * mesma transação. A sessão que saiu do plano não apaga o que a pessoa fez:
   * sem treino registrado nem agenda que já passou, o plano sai; com, ele fica
   * com a pessoa, solto da oferta.
   *
   * Exercício da comunidade não viaja por id numa oferta (ver
   * `plan-snapshot.ts`), então não há `groupId`. Os planos existentes são
   * conferidos com o `userId`: plano de outra pessoa responde como inexistente.
   *
   * A cópia dos exercícios do autor roda antes, fora da transação, como em
   * `materialize`.
   */
  async offerPlanWrites(
    userId: string,
    snapshot: unknown,
    fromOfferId: string,
    existing: ReadonlyArray<{ id: string; sessionIndex: number | null }>,
    today?: string,
  ): Promise<{
    plans: OfferSessionPlan[];
    writes: Prisma.PrismaPromise<unknown>[];
  }> {
    const snap = this.validate(snapshot);
    if (existing.length) {
      const owned = await this.prisma.workoutPlan.findMany({
        where: { id: { in: existing.map((e) => e.id) }, userId },
        select: { id: true },
      });
      if (owned.length !== new Set(existing.map((e) => e.id)).size) {
        throw new NotFoundException('Plan not found');
      }
    }
    const sessions = await this.buildSessions(userId, snap);
    const bySession = new Map<number, string>();
    for (const e of existing) {
      const idx = e.sessionIndex ?? 0;
      if (!bySession.has(idx)) bySession.set(idx, e.id);
    }
    const multi = sessions.length > 1;
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    const plans: OfferSessionPlan[] = [];
    for (const s of sessions) {
      const planId = bySession.get(s.index);
      if (!planId) {
        const id = randomUUID();
        plans.push({ id, sessionIndex: s.index, weekday: s.weekday });
        writes.push(
          this.prisma.workoutPlan.create({
            data: {
              id,
              userId,
              name: s.name,
              fromOfferId,
              sessionIndex: multi ? s.index : null,
              ...this.planContent(s, id),
            },
          }),
        );
        continue;
      }
      plans.push({ id: planId, sessionIndex: s.index, weekday: s.weekday });
      writes.push(
        this.prisma.workoutPlanExercise.deleteMany({ where: { planId } }),
        // A versão nova pode trocar o tipo (séries ↔ circuito): a configuração acompanha.
        this.prisma.circuitConfig.deleteMany({ where: { planId } }),
        this.prisma.workoutPlanCircuit.deleteMany({ where: { planId } }),
        this.prisma.workoutPlan.update({
          where: { id: planId },
          data: {
            name: s.name,
            sessionIndex: multi ? s.index : null,
            ...this.planContent(s, planId),
          },
        }),
      );
    }

    // As sessões que a versão nova tirou.
    const kept = new Set(plans.map((p) => p.id));
    const gone = existing.filter((e) => !kept.has(e.id)).map((e) => e.id);
    if (gone.length) {
      const [feitos, passados] = await Promise.all([
        this.prisma.workoutSession.findMany({
          where: { userId, planId: { in: gone } },
          select: { planId: true },
          distinct: ['planId'],
        }),
        this.prisma.plannedSession.findMany({
          where: { userId, planId: { in: gone }, ...(today ? { date: { lt: today } } : {}) },
          select: { planId: true },
          distinct: ['planId'],
        }),
      ]);
      const comHistorico = new Set([...feitos, ...passados].map((r) => r.planId));
      for (const id of gone) {
        writes.push(
          comHistorico.has(id)
            ? this.prisma.workoutPlan.updateMany({
                where: { id, userId },
                data: { fromOfferId: null, sessionIndex: null },
              })
            : this.prisma.workoutPlan.deleteMany({ where: { id, userId } }),
        );
      }
    }
    return { plans, writes };
  }

  /** O conteúdo de um plano de sessão: tipo, circuito, blocos e exercícios. */
  private planContent(s: SessionPlanData, planId: string) {
    if (s.circuitConfig) {
      return {
        kind: 'CIRCUIT' as const,
        circuit: { create: s.circuitConfig },
        exercises: { create: s.exercises },
      };
    }
    return {
      kind: 'STRENGTH' as const,
      ...(s.circuits.length
        ? {
            circuits: {
              create: s.circuits.map((c) => ({
                ...c.data,
                exercises: { create: c.exercises.map((e) => ({ ...e, planId })) },
              })),
            },
          }
        : {}),
      exercises: { create: s.exercises },
    };
  }

  /**
   * As sessões do retrato prontas para virar planos. Toda validação de id
   * roda antes da primeira escrita (a cópia do exercício custom).
   *
   * - Sessão que é um circuito só vira plano `CIRCUIT`, com o relógio da #380
   *   (Rounds vira For Time: rounds e descanso entre eles).
   * - Circuito no meio de uma sessão de séries vira `WorkoutPlanCircuit`, e os
   *   exercícios dele apontam para lá, na ordem da sessão.
   */
  private async buildSessions(
    userId: string,
    snap: PlanSnapshotV2,
    groupId?: string,
  ): Promise<SessionPlanData[]> {
    const all = snap.sessions.flatMap(sessionExercises);
    const groups = new Map([
      ...(await this.assertCatalogExercises(all)),
      ...(await this.assertGroupExercises(all, groupId)),
    ]);
    const out: SessionPlanData[] = [];
    for (const [index, session] of snap.sessions.entries()) {
      const only = session.items.length === 1 ? session.items[0]! : null;
      const name = sessionPlanName(snap, index);
      const weekday = session.weekday ?? null;
      if (only?.type === 'circuit') {
        out.push({
          index,
          name,
          weekday,
          circuitConfig: this.circuitConfigOf(only),
          circuits: [],
          exercises: await this.buildExercises(userId, only.exercises, groups, 0, 1),
        });
        continue;
      }
      const exercises: ExerciseCreate[] = [];
      const circuits: SessionPlanData['circuits'] = [];
      let order = 1;
      for (const item of session.items) {
        if (item.type === 'exercise') {
          exercises.push(...(await this.buildExercises(userId, [item], groups, order)));
          order += 1;
          continue;
        }
        const { exercises: itens, type: _type, ...fields } = item;
        void _type;
        const rows = await this.buildExercises(userId, itens, groups, order, item.rounds ?? 1);
        // O exercício do circuito entra aninhado no bloco, com o plano pelo id:
        // o bloco nasce antes dele na mesma escrita.
        circuits.push({ data: { ...fields, name: fields.name ?? null }, exercises: rows });
        order += itens.length;
      }
      out.push({ index, name, weekday, circuitConfig: null, circuits, exercises });
    }
    return out;
  }

  /**
   * A configuração do circuito com relógio, conferida pelo formato antes de
   * qualquer escrita (o retrato pode vir forjado).
   */
  private circuitConfigOf(block: PlanCircuitBlock) {
    const format: CircuitFormatValue = block.format === 'ROUNDS' ? 'FOR_TIME' : block.format;
    try {
      return { format, ...normalizeCircuitConfig(format, block) };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : 'circuito inválido';
      throw new BadRequestException(`Circuito do plano inválido (${motivo}). Nada foi criado.`);
    }
  }

  /**
   * Os exercícios, já com a origem resolvida, a partir da posição `from`. No
   * circuito, `rounds` faz as vezes de séries.
   */
  private async buildExercises(
    userId: string,
    items: ReadonlyArray<SnapshotItem>,
    groups: Map<number, string>,
    from: number,
    rounds?: number,
  ): Promise<ExerciseCreate[]> {
    const exercises: ExerciseCreate[] = [];
    for (const [i, item] of items.entries()) {
      const exerciseId =
        item.source === 'catalog'
          ? item.catalogExerciseId
          : item.source === 'group'
            ? item.groupExerciseId
            : await this.copyCustomExercise(userId, item.exercise);
      // A configuração do exercício (#378) viaja junto; a série por série
      // entra aninhada, na mesma escrita do plano.
      const muscleGroup =
        item.source === 'custom' ? item.exercise.muscleGroup : groups.get(exerciseId);
      const { sets, ...config } = configOf(
        item,
        isCardioExercise({ muscleGroup: muscleGroup ?? '' }),
      );
      exercises.push({
        exerciseId,
        order: from + i,
        targetSets: rounds ?? item.targetSets,
        targetReps: item.targetReps,
        ...config,
        ...(sets?.length && rounds === undefined
          ? {
              sets: {
                create: sets.map((st, n) => ({
                  order: n + 1,
                  kind: st.kind,
                  reps: st.reps,
                  loadKg: st.loadKg ?? null,
                })),
              },
            }
          : {}),
      });
    }
    return exercises;
  }

  private validate(snapshot: unknown): PlanSnapshotV2 {
    // A versão é conferida antes do schema para a mensagem dizer o que houve:
    // o snapshot de um plano guardado meses atrás merece erro melhor do que o
    // "invalid literal value" do Zod.
    const lido = readPlanSnapshot(snapshot);
    if (!lido.ok) {
      const versao = (snapshot as { version?: unknown } | null)?.version;
      if (versao !== 1 && versao !== 2) {
        throw new BadRequestException(
          `Snapshot de plano na versão ${typeof versao === 'number' ? versao : 'desconhecida'}: ` +
            'esta versão do produto materializa apenas a v1 e a v2. Nada foi criado.',
        );
      }
      throw new BadRequestException(`Snapshot de plano inválido (${lido.error}). Nada foi criado.`);
    }
    return lido.snapshot;
  }

  /**
   * Exercício do catálogo público entra por referência — ele não é de ninguém.
   *
   * O `createdByUserId: null` no `where` **não** é redundância defensiva: sem
   * ele, um snapshot forjado com o id de um exercício custom de terceiro poria
   * a linha dessa pessoa dentro do plano de quem adota, e o nome dela sairia na
   * leitura do plano. Id de `Exercise` é inteiro sequencial (#92).
   *
   * **Pré-passada, e não uma resolução por item dentro do laço de cópia**: o id
   * reprovado costuma vir depois de um item `custom` no mesmo snapshot, e
   * resolver na hora estourava com o `createCustom` do item anterior já
   * commitado. Uma query só para todos os ids, antes de qualquer escrita.
   *
   * Devolve o grupo muscular de cada id, para a adoção saber o que é cardio.
   */
  private async assertCatalogExercises(
    items: ReadonlyArray<SnapshotItem>,
  ): Promise<Map<number, string>> {
    const ids = [
      ...new Set(
        items.flatMap((item) => (item.source === 'catalog' ? [item.catalogExerciseId] : [])),
      ),
    ];
    if (ids.length === 0) return new Map();

    const publicos = await this.prisma.exercise.findMany({
      where: { id: { in: ids }, ...CATALOG_EXERCISE },
      select: { id: true, muscleGroup: true },
    });

    const encontrados = new Set(publicos.map((ex) => ex.id));
    const forasteiro = ids.find((id) => !encontrados.has(id));
    if (forasteiro !== undefined) {
      throw new BadRequestException(
        `O exercício ${forasteiro} não está no catálogo público e por isso não pode vir de um plano ` +
          'de outra pessoa. Nada foi criado.',
      );
    }
    return new Map(publicos.map((ex) => [ex.id, ex.muscleGroup]));
  }

  /**
   * Exercício da comunidade entra por referência, e só o da comunidade do
   * plano pronto: um snapshot forjado com o id do exercício de outra academia
   * poria no plano de quem adota uma linha que ele não enxerga. Pré-passada
   * pelo mesmo motivo de `assertCatalogExercises`.
   */
  private async assertGroupExercises(
    items: ReadonlyArray<SnapshotItem>,
    groupId?: string,
  ): Promise<Map<number, string>> {
    const ids = [
      ...new Set(items.flatMap((item) => (item.source === 'group' ? [item.groupExerciseId] : []))),
    ];
    if (ids.length === 0) return new Map();
    const daComunidade = groupId
      ? await this.prisma.exercise.findMany({
          where: { id: { in: ids }, groupOwned: true, groupId },
          select: { id: true, muscleGroup: true },
        })
      : [];
    const encontrados = new Set(daComunidade.map((ex) => ex.id));
    const forasteiro = ids.find((id) => !encontrados.has(id));
    if (forasteiro !== undefined) {
      throw new BadRequestException(
        `O exercício ${forasteiro} não é do catálogo desta comunidade. Nada foi criado.`,
      );
    }
    return new Map(daComunidade.map((ex) => [ex.id, ex.muscleGroup]));
  }

  /**
   * Exercício custom do autor vira exercício custom **de quem adota**, criado a
   * partir da definição que viajou no snapshot — nunca a partir da linha do
   * autor (ver `plan-snapshot.ts`).
   *
   * Se quem adota já tem um exercício com aquele nome, reaproveita: o
   * `@@unique([name, createdByUserId])` não deixa existir um segundo, e falhar a
   * adoção inteira porque a pessoa já treinava "Supino reto" seria pior do que
   * apontar para o que ela já tem. É a mesma escolha que `cloneForEdit` faz ao
   * devolver a cópia existente em vez de criar outra.
   */
  private async copyCustomExercise(userId: string, definicao: DefinicaoCustom): Promise<number> {
    const { name, muscleGroup, ...enriquecimento } = definicao;

    const existente = await this.prisma.exercise.findFirst({
      where: { name, createdByUserId: userId },
    });
    if (existente) return existente.id;

    const criado = await this.exercises.createCustom(userId, { name, muscleGroup });
    // Instrução, vídeo e músculos são conteúdo que o autor escreveu, e é boa
    // parte do valor do plano pronto. `createCustom` só aceita o par
    // obrigatório, então o resto entra pelo caminho de edição que já existe.
    if (Object.keys(enriquecimento).length > 0) {
      await this.exercises.updateCustom(userId, criado.id, enriquecimento);
    }
    return criado.id;
  }
}
