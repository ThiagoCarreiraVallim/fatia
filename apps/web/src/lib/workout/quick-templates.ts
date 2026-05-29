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
  /** Imagem de capa (SVG em /public/quick). */
  image: string;
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
    image: '/quick/full-body.svg',
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
    image: '/quick/push.svg',
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
    image: '/quick/pull.svg',
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
    image: '/quick/legs.svg',
    exercises: [
      { nameQuery: 'agachamento', muscleGroup: 'pernas', targetSets: 4, targetReps: '6-8' },
      { nameQuery: 'leg press', muscleGroup: 'pernas', targetSets: 3, targetReps: '10' },
      { nameQuery: 'cadeira extensora', muscleGroup: 'pernas', targetSets: 3, targetReps: '12' },
      { nameQuery: 'panturrilha', muscleGroup: 'pernas', targetSets: 4, targetReps: '15' },
    ],
  },
  {
    id: 'upper',
    title: 'Upper Body Completo',
    level: 'Intermediário',
    duration: '50 min',
    location: 'Academia',
    gradient: 'from-violet-900/70 via-stone-800/80 to-stone-900',
    image: '/quick/upper.svg',
    exercises: [
      { nameQuery: 'supino', muscleGroup: 'peito', targetSets: 3, targetReps: '8-10' },
      { nameQuery: 'puxada', muscleGroup: 'costas', targetSets: 3, targetReps: '10' },
      { nameQuery: 'desenvolvimento', muscleGroup: 'ombro', targetSets: 3, targetReps: '10-12' },
      { nameQuery: 'rosca direta', muscleGroup: 'braço', targetSets: 3, targetReps: '12' },
    ],
  },
  {
    id: 'lower',
    title: 'Lower Body Força',
    level: 'Intermediário',
    duration: '45 min',
    location: 'Academia',
    gradient: 'from-teal-900/70 via-stone-800/80 to-stone-900',
    image: '/quick/lower.svg',
    exercises: [
      { nameQuery: 'agachamento', muscleGroup: 'pernas', targetSets: 4, targetReps: '8' },
      { nameQuery: 'cadeira flexora', muscleGroup: 'pernas', targetSets: 3, targetReps: '12' },
      { nameQuery: 'cadeira extensora', muscleGroup: 'pernas', targetSets: 3, targetReps: '12' },
      { nameQuery: 'panturrilha', muscleGroup: 'pernas', targetSets: 4, targetReps: '15' },
    ],
  },
  {
    id: 'core',
    title: 'Core & Abdômen',
    level: 'Todos os níveis',
    duration: '25 min',
    location: 'Casa',
    gradient: 'from-orange-900/70 via-stone-800/80 to-stone-900',
    image: '/quick/core.svg',
    exercises: [
      { nameQuery: 'abdominal supra', muscleGroup: 'core', targetSets: 3, targetReps: '15-20' },
      { nameQuery: 'abdominal infra', muscleGroup: 'core', targetSets: 3, targetReps: '15' },
      { nameQuery: 'abdominal oblíquo', muscleGroup: 'core', targetSets: 3, targetReps: '15' },
      { nameQuery: 'prancha', muscleGroup: 'core', targetSets: 3, targetReps: '40s' },
    ],
  },
  {
    id: 'hiit',
    title: 'HIIT Cardio',
    level: 'Avançado',
    duration: '20 min',
    location: 'Casa',
    gradient: 'from-cyan-900/70 via-stone-800/80 to-stone-900',
    image: '/quick/hiit.svg',
    exercises: [
      { nameQuery: 'corrida', muscleGroup: 'cardio', targetSets: 1, targetReps: '20min' },
      { nameQuery: 'burpee', muscleGroup: 'core', targetSets: 4, targetReps: '12' },
      { nameQuery: 'agachamento livre', muscleGroup: 'pernas', targetSets: 4, targetReps: '20' },
    ],
  },
  {
    id: 'gluteos',
    title: 'Glúteos & Posterior',
    level: 'Intermediário',
    duration: '40 min',
    location: 'Academia',
    gradient: 'from-pink-900/70 via-stone-800/80 to-stone-900',
    image: '/quick/gluteos.svg',
    exercises: [
      { nameQuery: 'agachamento', muscleGroup: 'pernas', targetSets: 4, targetReps: '10-12' },
      { nameQuery: 'cadeira flexora', muscleGroup: 'pernas', targetSets: 3, targetReps: '12' },
      { nameQuery: 'panturrilha', muscleGroup: 'pernas', targetSets: 3, targetReps: '15' },
    ],
  },
  {
    id: 'mobilidade',
    title: 'Mobilidade & Alongamento',
    level: 'Iniciante',
    duration: '20 min',
    location: 'Casa',
    gradient: 'from-lime-900/70 via-stone-800/80 to-stone-900',
    image: '/quick/mobilidade.svg',
    exercises: [
      { nameQuery: 'alongamento', muscleGroup: 'core', targetSets: 1, targetReps: '10min' },
      { nameQuery: 'prancha', muscleGroup: 'core', targetSets: 3, targetReps: '30s' },
    ],
  },
];

export function findQuickTemplate(id: string): QuickTemplate | undefined {
  return QUICK_TEMPLATES.find((t) => t.id === id);
}
