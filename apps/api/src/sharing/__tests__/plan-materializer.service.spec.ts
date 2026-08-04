import { BadRequestException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PlanMaterializerService } from '../plan-materializer.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION } from '../plan-snapshot';
import type { PrismaService } from '../../common/prisma.service';
import type { ExerciseService } from '../../workout/exercise.service';
import { AddPlanExerciseDto, CreatePlanDto, ReorderExercisesDto } from '../../workout/dto/plan.dto';

const AUTOR = 'autor-1';
const ADOTANTE = 'adotante-1';

/** Linha de `Exercise` como o Prisma devolve — inclusive os campos nulos. */
type LinhaExercise = {
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

const exercicio = (over: Partial<LinhaExercise> & { id: number; name: string }): LinhaExercise => ({
  muscleGroup: 'peito',
  createdByUserId: null,
  equipment: null,
  level: null,
  mechanic: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  youtubeVideoId: null,
  youtubeVideoIdPt: null,
  ...over,
});

/** Catálogo público. */
const SUPINO = exercicio({ id: 10, name: 'Supino reto', muscleGroup: 'peito' });
/** Custom DO AUTOR — invisível para o adotante, como qualquer custom de terceiro. */
const CRUCIFIXO_DO_AUTOR = exercicio({
  id: 77,
  name: 'Crucifixo na polia alta',
  muscleGroup: 'peito',
  createdByUserId: AUTOR,
  equipment: 'polia',
  instructions: ['Desça devagar', 'Não tranque o cotovelo'],
  primaryMuscles: ['chest'],
});

describe('PlanMaterializerService.materialize', () => {
  /**
   * Fake de `Exercise` que responde ao `where` de verdade, em vez de devolver
   * sempre a mesma linha. É o ponto do arquivo: um mock que ignorasse
   * `createdByUserId` daria verde com o filtro de isolamento removido.
   */
  let tabela: LinhaExercise[];
  let proximoId: number;
  let prisma: {
    exercise: { findFirst: jest.Mock; findMany: jest.Mock };
    workoutPlan: { create: jest.Mock };
  };
  let exercises: { createCustom: jest.Mock; updateCustom: jest.Mock };
  let service: PlanMaterializerService;

  beforeEach(() => {
    tabela = [SUPINO, CRUCIFIXO_DO_AUTOR];
    proximoId = 500;

    prisma = {
      exercise: {
        findFirst: jest.fn(
          ({ where }: { where: { id?: number; name?: string; createdByUserId?: string | null } }) =>
            Promise.resolve(
              tabela.find(
                (ex) =>
                  (where.id === undefined || ex.id === where.id) &&
                  (where.name === undefined || ex.name === where.name) &&
                  (where.createdByUserId === undefined ||
                    ex.createdByUserId === where.createdByUserId),
              ) ?? null,
            ),
        ),
        // Mesma regra do `findFirst`, na forma que a pré-passada usa: um fake
        // que devolvesse `tabela` inteira daria verde com o `createdByUserId:
        // null` removido do `where`.
        findMany: jest.fn(
          ({ where }: { where: { id?: { in: number[] }; createdByUserId?: string | null } }) =>
            Promise.resolve(
              tabela.filter(
                (ex) =>
                  (where.id === undefined || where.id.in.includes(ex.id)) &&
                  (where.createdByUserId === undefined ||
                    ex.createdByUserId === where.createdByUserId),
              ),
            ),
        ),
      },
      workoutPlan: { create: jest.fn((args: unknown) => Promise.resolve(args)) },
    };

    exercises = {
      createCustom: jest.fn((userId: string, dto: { name: string; muscleGroup: string }) => {
        const criado = exercicio({ id: proximoId++, ...dto, createdByUserId: userId });
        tabela.push(criado);
        return Promise.resolve(criado);
      }),
      updateCustom: jest.fn((_userId: string, id: number, dto: Partial<LinhaExercise>) => {
        const alvo = tabela.find((ex) => ex.id === id)!;
        Object.assign(alvo, dto);
        return Promise.resolve(alvo);
      }),
    };

    service = new PlanMaterializerService(
      prisma as unknown as PrismaService,
      exercises as unknown as ExerciseService,
    );
  });

  /** Plano do autor: um do catálogo e um custom dele. */
  const snapshotDoAutor = () =>
    buildPlanSnapshot({
      name: 'Push do autor',
      exercises: [
        { order: 1, targetSets: 4, targetReps: '8-12', exercise: SUPINO },
        { order: 2, targetSets: 3, targetReps: '12', exercise: CRUCIFIXO_DO_AUTOR },
      ],
    });

  const dadosDoPlanoCriado = () =>
    prisma.workoutPlan.create.mock.calls[0][0] as {
      data: {
        userId: string;
        name: string;
        exercises: { create: Array<{ exerciseId: number; order: number; targetSets: number }> };
      };
    };

  it('cria o plano sob o userId de quem adota, e nunca sob o do autor', async () => {
    await service.materialize(ADOTANTE, snapshotDoAutor());

    expect(dadosDoPlanoCriado().data.userId).toBe(ADOTANTE);
    // O autor não pode aparecer em nenhum `where` da materialização.
    const todosOsWheres = JSON.stringify([
      ...prisma.exercise.findFirst.mock.calls,
      ...prisma.workoutPlan.create.mock.calls,
      ...exercises.createCustom.mock.calls,
    ]);
    expect(todosOsWheres).not.toContain(AUTOR);
  });

  it('copia o exercício custom do autor como exercício DO ADOTANTE, com o conteúdo escrito pelo autor', async () => {
    await service.materialize(ADOTANTE, snapshotDoAutor());

    expect(exercises.createCustom).toHaveBeenCalledWith(ADOTANTE, {
      name: 'Crucifixo na polia alta',
      muscleGroup: 'peito',
    });
    expect(exercises.updateCustom).toHaveBeenCalledWith(ADOTANTE, 500, {
      equipment: 'polia',
      instructions: ['Desça devagar', 'Não tranque o cotovelo'],
      primaryMuscles: ['chest'],
    });

    const criados = dadosDoPlanoCriado().data.exercises.create;
    // O catálogo entra por referência; o custom entra como a cópia nova (500),
    // e o id 77 — a linha do autor — não pode encostar no plano de ninguém.
    expect(criados.map((e) => e.exerciseId)).toEqual([SUPINO.id, 500]);
  });

  it('recusa snapshot que aponta um exercício custom de terceiro como se fosse catálogo', async () => {
    const forjado = {
      version: PLAN_SNAPSHOT_VERSION,
      name: 'Plano forjado',
      exercises: [
        {
          source: 'catalog',
          catalogExerciseId: CRUCIFIXO_DO_AUTOR.id,
          order: 1,
          targetSets: 3,
          targetReps: '10',
        },
      ],
    };

    await expect(service.materialize(ADOTANTE, forjado)).rejects.toThrow(BadRequestException);
    expect(prisma.workoutPlan.create).not.toHaveBeenCalled();
  });

  it('não escreve exercício nenhum na biblioteca de quem adota quando o id de catálogo é reprovado', async () => {
    // O item custom vem ANTES do id forjado de propósito: é a ordem que fazia a
    // recusa dizer "Nada foi criado" com um exercício de nome à escolha de quem
    // forjou já commitado na conta de quem adota.
    const forjado = {
      version: PLAN_SNAPSHOT_VERSION,
      name: 'Plano forjado',
      exercises: [
        {
          source: 'custom',
          exercise: { name: 'X-orfao', muscleGroup: 'peito' },
          order: 1,
          targetSets: 3,
          targetReps: '10',
        },
        {
          source: 'catalog',
          catalogExerciseId: CRUCIFIXO_DO_AUTOR.id,
          order: 2,
          targetSets: 3,
          targetReps: '10',
        },
      ],
    };

    await expect(service.materialize(ADOTANTE, forjado)).rejects.toThrow(/Nada foi criado/);
    expect(exercises.createCustom).not.toHaveBeenCalled();
    expect(exercises.updateCustom).not.toHaveBeenCalled();
    expect(tabela.some((ex) => ex.name === 'X-orfao')).toBe(false);
    expect(prisma.workoutPlan.create).not.toHaveBeenCalled();
  });

  it('confere todos os ids de catálogo numa passada só, antes da primeira cópia', async () => {
    // Não é performance: é a ordem. Se a conferência voltasse para dentro do
    // laço, a cópia do item 1 sairia antes de o item 3 ser recusado.
    await service.materialize(ADOTANTE, snapshotDoAutor());

    expect(prisma.exercise.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.exercise.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      exercises.createCustom.mock.invocationCallOrder[0],
    );
  });

  it('reaproveita o exercício que o adotante já tem com o mesmo nome, em vez de estourar o unique', async () => {
    const jaTinha = exercicio({
      id: 900,
      name: 'Crucifixo na polia alta',
      muscleGroup: 'costas',
      createdByUserId: ADOTANTE,
      equipment: 'elástico',
      instructions: ['pegada supinada, minha lombar'],
    });
    tabela.push(jaTinha);

    await service.materialize(ADOTANTE, snapshotDoAutor());

    expect(exercises.createCustom).not.toHaveBeenCalled();
    expect(dadosDoPlanoCriado().data.exercises.create.map((e) => e.exerciseId)).toEqual([
      SUPINO.id,
      900,
    ]);
    // Reaproveitar é apontar, não regravar. Aplicar o `enriquecimento` do autor
    // no exercício reaproveitado trocaria o equipamento e as anotações que quem
    // adota escreveu — conteúdo de outra conta por cima de dado dele, calado.
    expect(exercises.updateCustom).not.toHaveBeenCalled();
    expect([jaTinha.equipment, jaTinha.instructions]).toEqual([
      'elástico',
      ['pegada supinada, minha lombar'],
    ]);
  });

  it('recusa snapshot de versão desconhecida sem criar plano meio montado', async () => {
    const doFuturo = { ...snapshotDoAutor(), version: 2 };

    await expect(service.materialize(ADOTANTE, doFuturo)).rejects.toThrow(/versão 2.*apenas a v1/s);
    expect(exercises.createCustom).not.toHaveBeenCalled();
    expect(prisma.workoutPlan.create).not.toHaveBeenCalled();
  });

  it('recusa snapshot sem versão nenhuma', async () => {
    const semVersao = { name: 'Plano', exercises: [] };

    await expect(service.materialize(ADOTANTE, semVersao)).rejects.toThrow(BadRequestException);
    expect(prisma.workoutPlan.create).not.toHaveBeenCalled();
  });

  it('recusa o exercício repetido antes de criar qualquer coisa', async () => {
    const repetido = {
      version: PLAN_SNAPSHOT_VERSION,
      name: 'Plano repetido',
      exercises: [
        {
          source: 'custom',
          exercise: { name: 'Remada', muscleGroup: 'costas' },
          order: 1,
          targetSets: 3,
          targetReps: '10',
        },
        {
          source: 'custom',
          exercise: { name: 'Remada', muscleGroup: 'costas' },
          order: 2,
          targetSets: 3,
          targetReps: '10',
        },
      ],
    };

    await expect(service.materialize(ADOTANTE, repetido)).rejects.toThrow(/duas vezes/);
    // Sem esta checagem, a primeira cópia já teria sido criada quando o
    // `create` do plano falhasse com P2002.
    expect(exercises.createCustom).not.toHaveBeenCalled();
  });

  it('recusa o exercício de CATÁLOGO repetido, em vez de deixar o P2002 virar 500', async () => {
    // O ramo `catalog:` do dedupe não tinha teste: `conferirCatalogo` faz
    // `new Set(ids)` antes da query, então um id repetido atravessa a
    // pré-passada inteira e só morre no `create`, em
    // `@@unique([planId, exerciseId])` — P2002 sobe como "Internal server
    // error" em vez do `BadRequestException` nomeado que o resto do arquivo
    // se dá ao trabalho de produzir.
    const repetido = {
      version: PLAN_SNAPSHOT_VERSION,
      name: 'Plano repetido',
      exercises: [
        {
          source: 'catalog',
          catalogExerciseId: SUPINO.id,
          order: 1,
          targetSets: 3,
          targetReps: '10',
        },
        {
          source: 'catalog',
          catalogExerciseId: SUPINO.id,
          order: 2,
          targetSets: 3,
          targetReps: '10',
        },
      ],
    };

    await expect(service.materialize(ADOTANTE, repetido)).rejects.toThrow(/duas vezes/);
    expect(prisma.workoutPlan.create).not.toHaveBeenCalled();
  });

  it('aceita dois customs que só diferem por caixa — o `@@unique` do Postgres é case-sensitive', async () => {
    // "Prancha" e "prancha" são DUAS linhas que o autor pode legitimamente ter,
    // e viram dois ids diferentes na conta de quem adota: não colidem em
    // `@@unique([planId, exerciseId])`. Reprovar era transformar plano válido em
    // erro na publicação.
    const duasCaixas = {
      version: PLAN_SNAPSHOT_VERSION,
      name: 'Core',
      exercises: [
        {
          source: 'custom',
          exercise: { name: 'Prancha', muscleGroup: 'core' },
          order: 1,
          targetSets: 3,
          targetReps: '30s',
        },
        {
          source: 'custom',
          exercise: { name: 'prancha', muscleGroup: 'core' },
          order: 2,
          targetSets: 3,
          targetReps: '30s',
        },
      ],
    };

    await service.materialize(ADOTANTE, duasCaixas);

    const nomesCriados = (
      exercises.createCustom.mock.calls as Array<[string, { name: string }]>
    ).map(([, dto]) => dto.name);
    expect(nomesCriados).toEqual(['Prancha', 'prancha']);
    const criados = dadosDoPlanoCriado().data.exercises.create.map((e) => e.exerciseId);
    expect(new Set(criados).size).toBe(2);
  });

  it('preserva ordem, séries e repetições prescritas pelo autor', async () => {
    await service.materialize(ADOTANTE, snapshotDoAutor());

    expect(dadosDoPlanoCriado().data.exercises.create).toEqual([
      { exerciseId: SUPINO.id, order: 1, targetSets: 4, targetReps: '8-12' },
      { exerciseId: 500, order: 2, targetSets: 3, targetReps: '12' },
    ]);
    expect(dadosDoPlanoCriado().data.name).toBe('Push do autor');
  });
});

describe('buildPlanSnapshot', () => {
  it('congela o exercício custom por valor e o de catálogo por id', () => {
    const snap = buildPlanSnapshot({
      name: 'Push',
      exercises: [
        { order: 1, targetSets: 4, targetReps: '8-12', exercise: SUPINO },
        { order: 2, targetSets: 3, targetReps: '12', exercise: CRUCIFIXO_DO_AUTOR },
      ],
    });

    expect(snap.exercises[0]).toEqual({
      source: 'catalog',
      catalogExerciseId: SUPINO.id,
      order: 1,
      targetSets: 4,
      targetReps: '8-12',
    });
    const custom = snap.exercises[1];
    if (custom.source !== 'custom') throw new Error('esperava item custom');
    // O id do autor não pode viajar: o snapshot é autocontido de propósito.
    expect(JSON.stringify(custom)).not.toContain(String(CRUCIFIXO_DO_AUTOR.id));
    expect(custom.exercise).toEqual({
      name: 'Crucifixo na polia alta',
      muscleGroup: 'peito',
      equipment: 'polia',
      instructions: ['Desça devagar', 'Não tranque o cotovelo'],
      primaryMuscles: ['chest'],
    });
  });

  it('congela dois customs que só diferem por caixa, porque o Postgres os guarda separados', () => {
    const prancha = (name: string, id: number) =>
      exercicio({ id, name, muscleGroup: 'core', createdByUserId: AUTOR });

    const snap = buildPlanSnapshot({
      name: 'Core',
      exercises: [
        { order: 1, targetSets: 3, targetReps: '30s', exercise: prancha('Prancha', 1) },
        { order: 2, targetSets: 3, targetReps: '30s', exercise: prancha('prancha', 2) },
      ],
    });

    expect(snap.exercises).toHaveLength(2);
  });

  /**
   * v1 é **formato congelado**: um plano que as rotas já aceitaram e gravaram
   * precisa caber nele. Reprovar aqui não é "validação extra" — é deixar esse
   * plano impublicável para sempre, porque afrouxar `plan-snapshot.ts` depois
   * da primeira `PlanTemplate.snapshot` gravada é bump de versão e migração de
   * coluna `Json`.
   *
   * Cada caso amarra os dois lados: o DTO que grava **aceita** o valor (é o que
   * `validateSync` prova, e não a minha leitura do decorator), e
   * `buildPlanSnapshot` **congela** o mesmo valor sem normalizar por baixo do
   * pano. Apertar um dos dois lados sozinho fica vermelho aqui.
   */
  describe('congela o que as rotas de plano de fato gravam', () => {
    const problemasDoDto = (cls: ClassConstructor<object>, payload: object): string[] =>
      validateSync(plainToInstance(cls, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }).map((e) => e.toString());

    /** Um plano de um exercício só, com a prescrição sob teste. */
    const planoCom = (
      over: Partial<{ name: string; order: number; targetSets: number; targetReps: string }>,
    ) => ({
      name: over.name ?? 'Plano',
      exercises: [
        {
          order: over.order ?? 1,
          targetSets: over.targetSets ?? 3,
          targetReps: over.targetReps ?? '10',
          exercise: SUPINO,
        },
      ],
    });

    it('`order: 0`, que é o que `reorder_plan_exercises` documenta como "0 = primeiro"', () => {
      // `ReorderItemDto.order` é `@Min(0)`, e o exemplo da própria tool manda
      // `"order":0`. Com `min(1)` no snapshot, pedir ao Claude para reordenar o
      // treino tornava aquele plano impublicável — e o autor não tem como saber.
      expect(
        problemasDoDto(ReorderExercisesDto, {
          exercises: [{ id: '66666666-7777-4888-8999-aaaaaaaaaaaa', order: 0 }],
        }),
      ).toEqual([]);

      expect(buildPlanSnapshot(planoCom({ order: 0 })).exercises[0].order).toBe(0);
    });

    it('`targetReps` vazia, que `AddPlanExerciseDto` aceita por não ter mínimo', () => {
      expect(
        problemasDoDto(AddPlanExerciseDto, {
          exerciseId: 1,
          order: 1,
          targetSets: 3,
          targetReps: '',
        }),
      ).toEqual([]);

      expect(buildPlanSnapshot(planoCom({ targetReps: '' })).exercises[0].targetReps).toBe('');
    });

    it('`targetSets` acima de 50, que o REST aceita por não ter teto', () => {
      // A tool MCP corta em 20, o `AddPlanExerciseDto` é `@Min(1)` sem `@Max`.
      // O teto do snapshot é o da coluna (`Int` = int4), não um número redondo.
      expect(
        problemasDoDto(AddPlanExerciseDto, {
          exerciseId: 1,
          order: 1,
          targetSets: 60,
          targetReps: '10',
        }),
      ).toEqual([]);

      expect(buildPlanSnapshot(planoCom({ targetSets: 60 })).exercises[0].targetSets).toBe(60);
    });

    it('nome de plano vazio, que `CreatePlanDto` aceita por não ter mínimo', () => {
      expect(problemasDoDto(CreatePlanDto, { name: '' })).toEqual([]);

      expect(buildPlanSnapshot(planoCom({ name: '' })).name).toBe('');
    });

    it('mas segue recusando o que estoura a coluna `Int`, para o erro não virar 500 no `create`', () => {
      // O outro lado da moeda: o snapshot também chega como `Json` forjado. Sem
      // teto nenhum, `targetSets: 1e12` passaria a validação e morreria dentro
      // do `workoutPlan.create` como "Internal server error".
      expect(() => buildPlanSnapshot(planoCom({ targetSets: 2_147_483_648 }))).toThrow(
        BadRequestException,
      );
      expect(() => buildPlanSnapshot(planoCom({ order: 2_147_483_648 }))).toThrow(
        BadRequestException,
      );
    });
  });

  it('recusa músculo fora das chaves do diagrama como BadRequest, não como ZodError cru', () => {
    // `ZodError` escapando pela rota de publicação vira 500 "Internal server
    // error", e o autor fica sem saber o que arrumar no plano dele.
    expect(() =>
      buildPlanSnapshot({
        name: 'Push',
        exercises: [
          {
            order: 1,
            targetSets: 3,
            targetReps: '10',
            exercise: exercicio({
              id: 5,
              name: 'Peitoral errado',
              createdByUserId: AUTOR,
              primaryMuscles: ['peitoral'],
            }),
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
