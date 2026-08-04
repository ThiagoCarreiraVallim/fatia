import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ExerciseService } from '../workout/exercise.service';
import {
  descreverProblemas,
  PLAN_SNAPSHOT_VERSION,
  planSnapshotSchema,
  type DefinicaoCustom,
  type PlanSnapshot,
} from './plan-snapshot';

const PLAN_INCLUDE = {
  exercises: { include: { exercise: true }, orderBy: { order: 'asc' as const } },
} as const;

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
 * **Proveniência ainda não é gravada.** `fromOfferId`/`fromTemplateId` em
 * `WorkoutPlan` dependem de model novo, que esta fatia não abre (ver a proposta
 * de schema na PR). Enquanto a coluna não existe, a adoção **não é idempotente**:
 * é o chamador que precisa evitar materializar duas vezes. A consulta que resolve
 * isso — `workoutPlan.findFirst({ where: { userId, fromTemplateId } })` — entra
 * aqui junto com a coluna, e não antes.
 */
@Injectable()
export class PlanMaterializerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExerciseService,
  ) {}

  /**
   * Cria o plano do snapshot sob `userId`.
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
   */
  async materialize(userId: string, snapshot: unknown) {
    const snap = this.validar(snapshot);
    await this.conferirCatalogo(snap);

    const exercises: Array<{
      exerciseId: number;
      order: number;
      targetSets: number;
      targetReps: string;
    }> = [];
    for (const item of snap.exercises) {
      exercises.push({
        exerciseId:
          item.source === 'catalog'
            ? item.catalogExerciseId
            : await this.copiarCustom(userId, item.exercise),
        order: item.order,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
      });
    }

    // Um `create` aninhado, não `$transaction` interativa: plano e exercícios
    // saem numa transação só do lado do Prisma, sem segurar conexão entre
    // roundtrips — pgbouncer em transaction pooling (ADR 010).
    return this.prisma.workoutPlan.create({
      data: { userId, name: snap.name, exercises: { create: exercises } },
      include: PLAN_INCLUDE,
    });
  }

  private validar(snapshot: unknown): PlanSnapshot {
    // A versão é conferida antes do schema para a mensagem dizer o que houve.
    // O `z.literal` sozinho reprovaria com "invalid literal value", e o
    // snapshot de um plano guardado meses atrás merece erro melhor do que isso.
    const versao = (snapshot as { version?: unknown } | null)?.version;
    if (versao !== PLAN_SNAPSHOT_VERSION) {
      throw new BadRequestException(
        `Snapshot de plano na versão ${typeof versao === 'number' ? versao : 'desconhecida'}: ` +
          `esta versão do produto materializa apenas a v${PLAN_SNAPSHOT_VERSION}. Nada foi criado.`,
      );
    }

    const parsed = planSnapshotSchema.safeParse(snapshot);
    if (!parsed.success) {
      throw new BadRequestException(
        `Snapshot de plano inválido (${descreverProblemas(parsed.error)}). Nada foi criado.`,
      );
    }
    return parsed.data;
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
   * commitado. O snapshot forjado era recusado, a mensagem dizia "Nada foi
   * criado", e mesmo assim quem forjou escrevia um exercício de nome à escolha
   * na biblioteca de quem adota. Uma query só para todos os ids, antes de
   * qualquer escrita.
   */
  private async conferirCatalogo(snap: PlanSnapshot): Promise<void> {
    const ids = [
      ...new Set(
        snap.exercises.flatMap((item) =>
          item.source === 'catalog' ? [item.catalogExerciseId] : [],
        ),
      ),
    ];
    if (ids.length === 0) return;

    const publicos = await this.prisma.exercise.findMany({
      where: { id: { in: ids }, createdByUserId: null },
      select: { id: true },
    });

    const encontrados = new Set(publicos.map((ex) => ex.id));
    const forasteiro = ids.find((id) => !encontrados.has(id));
    if (forasteiro !== undefined) {
      throw new BadRequestException(
        `O exercício ${forasteiro} não está no catálogo público e por isso não pode vir de um plano ` +
          'de outra pessoa. Nada foi criado.',
      );
    }
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
  private async copiarCustom(userId: string, definicao: DefinicaoCustom): Promise<number> {
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
