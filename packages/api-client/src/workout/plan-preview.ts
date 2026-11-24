import { BODYWEIGHT_EQUIPMENT, equipmentLabel } from '../community-exercises';
import type { WorkoutPlan } from '../workout';
import { planCardInfo } from '../workout-session-copy';
import { planExerciseSummary } from './plan-config';

export interface PlanPreview {
  /** "3 exercícios · 10 séries · ~26 min": a duração estimada do cartão do plano. */
  info: string;
  /** Músculos do diagrama (chaves `data-muscle`), na ordem em que aparecem. */
  primaryMuscles: string[];
  /** Só os que não são principais de nenhum exercício. */
  secondaryMuscles: string[];
  /** Rótulos do equipamento, sem repetir; peso corporal não é equipamento. */
  equipment: string[];
  exercises: { id: string; exerciseId: number; name: string; group: string; summary: string }[];
}

/**
 * O que a folha de prévia mostra antes de começar ou adicionar um plano
 * (#484): os exercícios com séries e repetições, os músculos, o equipamento e
 * a duração estimada. Mesma conta no app e na web.
 */
export function planPreview(plan: Pick<WorkoutPlan, 'exercises'>): PlanPreview {
  const ordered = [...(plan.exercises ?? [])].sort((a, b) => a.order - b.order);
  const primary = new Set<string>();
  const secondary = new Set<string>();
  const equipment = new Set<string>();
  for (const pe of ordered) {
    for (const m of pe.exercise?.primaryMuscles ?? []) primary.add(m);
    for (const m of pe.exercise?.secondaryMuscles ?? []) secondary.add(m);
    const eq = pe.exercise?.equipment;
    if (eq && eq !== BODYWEIGHT_EQUIPMENT) equipment.add(equipmentLabel(eq));
  }
  return {
    info: planCardInfo(plan),
    primaryMuscles: [...primary],
    secondaryMuscles: [...secondary].filter((m) => !primary.has(m)),
    equipment: [...equipment],
    exercises: ordered.map((pe) => ({
      id: pe.id,
      exerciseId: pe.exerciseId,
      name: pe.exercise?.name ?? '',
      group: pe.exercise?.muscleGroup ?? 'outro',
      summary: planExerciseSummary(pe),
    })),
  };
}
