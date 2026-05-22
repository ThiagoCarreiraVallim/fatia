import type { MuscleGroup } from '@/lib/api/workout';

export interface QuickTemplateExercise {
  nameQuery: string;
  muscleGroup: MuscleGroup;
  targetSets: number;
  targetReps: string;
}

export interface QuickTemplate {
  id: string;
  title: string;
  level: string;
  duration: string;
  location: string;
  gradient: string;
  exercises: QuickTemplateExercise[];
}

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'full-body',
    title: 'Full Body Express',
    level: 'Iniciante',
    duration: '40 min',
    location: 'Academia',
    gradient: 'from-emerald-900/70 via-stone-800/80 to-stone-900',
    exercises: [
      { nameQuery: 'agachamento', muscleGroup: 'pernas', targetSets: 3, targetReps: '10-12' },
      { nameQuery: 'supino', muscleGroup: 'peito', targetSets: 3, targetReps: '8-10' },
      { nameQuery: 'remada', muscleGroup: 'costas', targetSets: 3, targetReps: '8-10' },
      { nameQuery: 'desenvolvimento', muscleGroup: 'ombro', targetSets: 3, targetReps: '10-12' },
    ],
  },
  {
    id: 'push',
    title: 'Push: Peito, Ombro e Tríceps',
    level: 'Intermediário',
    duration: '50 min',
    location: 'Academia',
    gradient: 'from-rose-900/70 via-stone-800/80 to-stone-900',
    exercises: [
      { nameQuery: 'supino reto', muscleGroup: 'peito', targetSets: 4, targetReps: '8-10' },
      { nameQuery: 'supino inclinado', muscleGroup: 'peito', targetSets: 3, targetReps: '10' },
      { nameQuery: 'desenvolvimento', muscleGroup: 'ombro', targetSets: 3, targetReps: '10' },
      { nameQuery: 'tríceps', muscleGroup: 'braço', targetSets: 3, targetReps: '12' },
    ],
  },
  {
    id: 'pull',
    title: 'Pull: Costas e Bíceps',
    level: 'Intermediário',
    duration: '55 min',
    location: 'Academia',
    gradient: 'from-slate-800/70 via-stone-800/80 to-stone-900',
    exercises: [
      { nameQuery: 'puxada', muscleGroup: 'costas', targetSets: 4, targetReps: '8-10' },
      { nameQuery: 'remada', muscleGroup: 'costas', targetSets: 4, targetReps: '10' },
      { nameQuery: 'rosca direta', muscleGroup: 'braço', targetSets: 3, targetReps: '12' },
      { nameQuery: 'rosca martelo', muscleGroup: 'braço', targetSets: 3, targetReps: '12' },
    ],
  },
  {
    id: 'legs',
    title: 'Pernas Pesado',
    level: 'Avançado',
    duration: '60 min',
    location: 'Academia',
    gradient: 'from-amber-900/70 via-stone-800/80 to-stone-900',
    exercises: [
      { nameQuery: 'agachamento', muscleGroup: 'pernas', targetSets: 4, targetReps: '6-8' },
      { nameQuery: 'leg press', muscleGroup: 'pernas', targetSets: 3, targetReps: '10' },
      { nameQuery: 'cadeira extensora', muscleGroup: 'pernas', targetSets: 3, targetReps: '12' },
      { nameQuery: 'panturrilha', muscleGroup: 'pernas', targetSets: 4, targetReps: '15' },
    ],
  },
];

export function findQuickTemplate(id: string): QuickTemplate | undefined {
  return QUICK_TEMPLATES.find((t) => t.id === id);
}
