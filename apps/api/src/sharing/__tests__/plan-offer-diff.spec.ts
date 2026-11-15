import { diffOfferVersions, diffPlanSnapshots, exerciseKey } from '../plan-offer-diff';
import { PLAN_SNAPSHOT_VERSION, type PlanSnapshot } from '../plan-snapshot';

const snap = (exercises: PlanSnapshot['exercises']): PlanSnapshot => ({
  version: PLAN_SNAPSHOT_VERSION,
  name: 'Inferior',
  exercises,
});

const agach = {
  source: 'catalog' as const,
  catalogExerciseId: 10,
  order: 0,
  targetSets: 4,
  targetReps: '8',
};
const leg = {
  source: 'catalog' as const,
  catalogExerciseId: 11,
  order: 1,
  targetSets: 3,
  targetReps: '10-12',
};
const stiff = {
  source: 'custom' as const,
  exercise: { name: 'Stiff', muscleGroup: 'pernas' as const },
  order: 2,
  targetSets: 3,
  targetReps: '10',
};

describe('diffPlanSnapshots (o que mudou, #379)', () => {
  it('chave por exercício: catálogo e comunidade por id, o do autor pelo nome', () => {
    expect(exerciseKey(agach)).toBe('catalog:10');
    expect(exerciseKey(stiff)).toBe('custom:Stiff');
    expect(
      exerciseKey({ source: 'group', groupExerciseId: 3, order: 0, targetSets: 1, targetReps: '' }),
    ).toBe('group:3');
  });

  it('sem versão aceita, nada é "novo": é o plano inteiro', () => {
    const d = diffPlanSnapshots(null, snap([agach, leg]));
    expect(d).toEqual({ added: [], removed: [], changed: [], version: [], hasChanges: false });
  });

  it('acha o novo, o removido e o alterado (séries, repetições, descanso)', () => {
    const antes = snap([agach, { ...leg, restSeconds: 60 }]);
    const depois = snap([{ ...agach, targetSets: 5 }, { ...leg, restSeconds: 90 }, stiff]);
    const d = diffPlanSnapshots(antes, depois);
    expect(d.added).toEqual(['custom:Stiff']);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([
      { key: 'catalog:10', fields: [{ field: 'sets', before: '4', after: '5' }] },
      { key: 'catalog:11', fields: [{ field: 'rest', before: '60', after: '90' }] },
    ]);
    expect(d.hasChanges).toBe(true);

    const volta = diffPlanSnapshots(depois, snap([agach]));
    expect(volta.removed).toEqual(['catalog:11', 'custom:Stiff']);
  });

  it('mudar só a ordem não marca exercício, mas é mudança do plano', () => {
    const d = diffPlanSnapshots(
      snap([agach, leg]),
      snap([
        { ...leg, order: 0 },
        { ...agach, order: 1 },
      ]),
    );
    expect(d.changed).toEqual([]);
    expect(d.version).toEqual([{ field: 'order', before: null, after: null }]);
    expect(d.hasChanges).toBe(true);
  });

  it('renumerar a ordem sem trocar a sequência não é mudança', () => {
    const d = diffPlanSnapshots(
      snap([agach, leg]),
      snap([
        { ...agach, order: 5 },
        { ...leg, order: 9 },
      ]),
    );
    expect(d.hasChanges).toBe(false);
  });

  it('entrar um exercício no meio não conta como troca de ordem', () => {
    const d = diffPlanSnapshots(
      snap([agach, leg]),
      snap([agach, { ...stiff, order: 1 }, { ...leg, order: 2 }]),
    );
    expect(d.version).toEqual([]);
    expect(d.added).toEqual(['custom:Stiff']);
  });

  it('o nome do plano trocado aparece', () => {
    const d = diffPlanSnapshots(snap([agach]), { ...snap([agach]), name: 'Pernas' });
    expect(d.version).toEqual([{ field: 'title', before: 'Inferior', after: 'Pernas' }]);
    expect(d.hasChanges).toBe(true);
  });

  it('cada campo da configuração do exercício conta (#378)', () => {
    const cases: Array<[Partial<typeof agach> & Record<string, unknown>, unknown]> = [
      [{ startLoadKg: 20 }, { field: 'load', before: null, after: '20' }],
      [{ loadMode: 'BODYWEIGHT' }, { field: 'loadMode', before: 'WEIGHT', after: 'BODYWEIGHT' }],
      [{ repUnit: 'SECONDS' }, { field: 'repUnit', before: 'REPS', after: 'SECONDS' }],
      [{ technique: 'DROP_SET' }, { field: 'technique', before: 'NORMAL', after: 'DROP_SET' }],
      [{ biSetWithNext: true }, { field: 'biSet', before: 'false', after: 'true' }],
      [{ notes: 'Desça devagar' }, { field: 'notes', before: null, after: 'Desça devagar' }],
      [
        {
          sets: [
            { kind: 'WARMUP', reps: 12 },
            { kind: 'NORMAL', reps: 8, loadKg: 40 },
          ],
        },
        { field: 'setTable', before: null, after: '12:WARMUP,8x40' },
      ],
      [{ cardioTarget: 'TIME' }, { field: 'cardioTarget', before: null, after: 'TIME' }],
      [{ cardioDurationSeconds: 1800 }, { field: 'cardioDuration', before: null, after: '1800' }],
      [{ cardioDistanceMeters: 5000 }, { field: 'cardioDistance', before: null, after: '5000' }],
      [
        { cardioIntensity: 'VIGOROUS' },
        { field: 'cardioIntensity', before: null, after: 'VIGOROUS' },
      ],
    ];
    for (const [patch, change] of cases) {
      const d = diffPlanSnapshots(
        snap([agach]),
        snap([{ ...agach, ...patch } as PlanSnapshot['exercises'][number]]),
      );
      expect(d.changed).toEqual([{ key: 'catalog:10', fields: [change] }]);
      expect(d.hasChanges).toBe(true);
    }
  });

  it('o padrão escrito por extenso não é mudança (técnica normal, sem bi-set)', () => {
    const d = diffPlanSnapshots(
      snap([agach]),
      snap([{ ...agach, technique: 'NORMAL', biSetWithNext: false, repUnit: 'REPS' }]),
    );
    expect(d.hasChanges).toBe(false);
  });

  it('a carga de uma série da tabela trocada aparece', () => {
    const antes = snap([{ ...agach, sets: [{ kind: 'NORMAL', reps: 8, loadKg: 40 }] }]);
    const depois = snap([{ ...agach, sets: [{ kind: 'NORMAL', reps: 8, loadKg: 45 }] }]);
    expect(diffPlanSnapshots(antes, depois).changed).toEqual([
      { key: 'catalog:10', fields: [{ field: 'setTable', before: '8x40', after: '8x45' }] },
    ]);
  });

  it('a definição do exercício do autor mudou: configuração', () => {
    const d = diffPlanSnapshots(
      snap([stiff]),
      snap([{ ...stiff, exercise: { ...stiff.exercise, instructions: ['Joelho solto'] } }]),
    );
    expect(d.changed).toEqual([
      { key: 'custom:Stiff', fields: [{ field: 'config', before: null, after: null }] },
    ]);
  });
  it('repetições trocadas aparecem com o antes e o depois', () => {
    const d = diffPlanSnapshots(snap([agach]), snap([{ ...agach, targetReps: '6-8' }]));
    expect(d.changed).toEqual([
      { key: 'catalog:10', fields: [{ field: 'reps', before: '8', after: '6-8' }] },
    ]);
  });

  it('descanso tirado (volta ao padrão) também é mudança', () => {
    const d = diffPlanSnapshots(snap([{ ...agach, restSeconds: 90 }]), snap([agach]));
    expect(d.changed).toEqual([
      { key: 'catalog:10', fields: [{ field: 'rest', before: '90', after: null }] },
    ]);
  });
});

describe('diffOfferVersions (o que mudou, com a agenda)', () => {
  const calendar = {
    snapshot: snap([agach]),
    schedule: 'CALENDAR' as const,
    startDate: '2026-11-16',
    weeks: 4,
    weekdays: [1, 3, 5],
  };

  it('agenda igual e exercícios iguais: nada mudou', () => {
    expect(diffOfferVersions(calendar, { ...calendar }).hasChanges).toBe(false);
  });

  it('só a agenda mudou: início, semanas e dias', () => {
    const d = diffOfferVersions(calendar, {
      ...calendar,
      startDate: '2026-11-23',
      weeks: 6,
      weekdays: [2, 4],
    });
    expect(d.version).toEqual([
      { field: 'startDate', before: '2026-11-16', after: '2026-11-23' },
      { field: 'weeks', before: '4', after: '6' },
      { field: 'weekdays', before: '1,3,5', after: '2,4' },
    ]);
    expect(d.hasChanges).toBe(true);
  });

  it('de calendário para flexível', () => {
    const d = diffOfferVersions(calendar, {
      ...calendar,
      schedule: 'FLEXIBLE',
      startDate: null,
      weeks: null,
      weekdays: [],
    });
    expect(d.version).toEqual([{ field: 'schedule', before: 'CALENDAR', after: 'FLEXIBLE' }]);
    expect(d.hasChanges).toBe(true);
  });

  it('sem versão anterior, nada é mudança', () => {
    expect(diffOfferVersions(null, calendar).hasChanges).toBe(false);
  });
});
