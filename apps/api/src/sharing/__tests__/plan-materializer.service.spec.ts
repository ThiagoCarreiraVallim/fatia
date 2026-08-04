import { BadRequestException } from '@nestjs/common';
import { PlanMaterializerService } from '../plan-materializer.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION } from '../plan-snapshot';
import type { PrismaService } from '../../common/prisma.service';
import type { ExerciseService } from '../../workout/exercise.service';

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
    exercise: { findFirst: jest.Mock };
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

  it('reaproveita o exercício que o adotante já tem com o mesmo nome, em vez de estourar o unique', async () => {
    const jaTinha = exercicio({
      id: 900,
      name: 'Crucifixo na polia alta',
      muscleGroup: 'costas',
      createdByUserId: ADOTANTE,
    });
    tabela.push(jaTinha);

    await service.materialize(ADOTANTE, snapshotDoAutor());

    expect(exercises.createCustom).not.toHaveBeenCalled();
    expect(dadosDoPlanoCriado().data.exercises.create.map((e) => e.exerciseId)).toEqual([
      SUPINO.id,
      900,
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
          exercise: { name: 'remada ', muscleGroup: 'costas' },
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

  it('recusa músculo fora das chaves do diagrama', () => {
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
    ).toThrow();
  });
});
