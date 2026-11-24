import { describe, expect, it } from 'vitest';
import { planPreview } from '../workout/plan-preview';
import type { WorkoutPlan, WorkoutPlanExercise } from '../workout';

/** A prévia antes de começar ou adicionar um plano (#484). */
const line = (
  order: number,
  name: string,
  extra: Partial<WorkoutPlanExercise['exercise']>,
  sets = 3,
  reps = '8-12',
): WorkoutPlanExercise =>
  ({
    id: `pe${order}`,
    planId: 'p',
    exerciseId: order,
    order,
    targetSets: sets,
    targetReps: reps,
    sets: [],
    exercise: {
      id: order,
      name,
      muscleGroup: 'peito',
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: null,
      ...extra,
    },
  }) as unknown as WorkoutPlanExercise;

const plan = {
  id: 'p',
  userId: 'u',
  name: 'Push',
  exercises: [
    line(2, 'Tríceps corda', {
      muscleGroup: 'braço',
      primaryMuscles: ['triceps'],
      equipment: 'polia',
    }),
    line(1, 'Supino reto', {
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps', 'shoulders'],
      equipment: 'barra',
    }),
    line(3, 'Flexão', { primaryMuscles: ['chest'], equipment: 'peso corporal' }, 4, '15'),
  ],
} as unknown as WorkoutPlan;

describe('prévia do plano (#484)', () => {
  it('os exercícios na ordem do plano, com séries e repetições', () => {
    expect(planPreview(plan).exercises.map((e) => `${e.name} ${e.summary}`)).toEqual([
      'Supino reto 3 × 8–12',
      'Tríceps corda 3 × 8–12',
      'Flexão 4 × 15',
    ]);
  });

  it('os músculos: secundário que é principal de outro exercício conta como principal', () => {
    const p = planPreview(plan);
    expect(p.primaryMuscles).toEqual(['chest', 'triceps']);
    expect(p.secondaryMuscles).toEqual(['shoulders']);
  });

  it('o equipamento sem repetir e sem "peso corporal"', () => {
    expect(planPreview(plan).equipment).toEqual(['Barra', 'Polia']);
  });

  it('o resumo com a duração estimada', () => {
    expect(planPreview(plan).info).toBe('3 exercícios · 10 séries · ~26 min');
  });
});
