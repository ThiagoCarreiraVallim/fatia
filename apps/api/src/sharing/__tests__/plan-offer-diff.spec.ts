import { diffPlanSnapshots, exerciseKey } from '../plan-offer-diff';
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
    expect(d).toEqual({ added: [], removed: [], changed: [], hasChanges: false });
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

  it('mudar só a ordem não é mudança de exercício', () => {
    const d = diffPlanSnapshots(
      snap([agach, leg]),
      snap([
        { ...leg, order: 0 },
        { ...agach, order: 1 },
      ]),
    );
    expect(d.hasChanges).toBe(false);
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
