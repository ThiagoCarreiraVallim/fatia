import { apiFetch } from './http';
import type { Goal } from './goals';
import type { WeightProgress } from './progress';

/**
 * Categorias de dado que o titular consente separadamente (ADR 014).
 *
 * Escritas à mão e não importadas do Prisma: o pacote é compartilhado com o app
 * nativo e não depende do `@fatia/db`. `permission-matrix.spec.ts` confere o
 * enum do schema contra `docs/PERMISSIONS.md`, e é de lá que esta lista sai.
 */
export type ShareScope = 'WORKOUT' | 'NUTRITION' | 'BODY' | 'HABITS' | 'GOALS';

export const SHARE_SCOPE_LABEL: Record<ShareScope, string> = {
  WORKOUT: 'Treino',
  NUTRITION: 'Alimentação',
  BODY: 'Peso e medidas',
  HABITS: 'Água e passos',
  GOALS: 'Metas',
};

/** Um aluno na lista do profissional. Metadado de associação, nunca dado de saúde. */
export interface Student {
  membershipId: string;
  name: string;
  groupId: string;
  groupName: string;
  joinedAt: string | null;
  /** `[]` = ainda não autorizou nada. É o estado normal de quem acabou de entrar. */
  scopesGrantedToMe: ShareScope[];
}

/**
 * O conteúdo de uma leitura, discriminado pelo escopo — a mesma união que a API
 * devolve. Nenhum ramo carrega o `userId` do aluno: o painel referencia o aluno
 * pela associação, e o identificador de usuário dele não sai da API.
 */
export type StudentReading =
  | { scope: 'WORKOUT'; plans: StudentPlan[]; sessions: StudentSession[]; volume: StudentVolume }
  | { scope: 'NUTRITION'; history: StudentNutritionHistory }
  | { scope: 'BODY'; weight: WeightProgress }
  | { scope: 'HABITS'; steps: StudentStepsProgress; water: StudentWaterProgress }
  | { scope: 'GOALS'; goals: Array<Omit<Goal, 'userId'>> };

export interface StudentPlan {
  id: string;
  name: string;
  createdAt: string;
  exercises: Array<{
    id: string;
    order: number;
    targetSets: number | null;
    targetReps: string | null;
    exercise: { id: number; name: string; muscleGroup: string };
  }>;
}

export interface StudentSession {
  id: string;
  startedAt: string;
  /** O schema fecha a sessão em `completedAt`; não existe `finishedAt`. */
  completedAt: string | null;
  notes: string | null;
}

export interface StudentVolume {
  weeks: Array<{ weekStart: string; totalVolumeKg: number; sessionCount: number }>;
  averageWeeklyVolumeKg: number;
}

export interface StudentNutritionHistory {
  /** A **janela** em dias, não a série. O array é o `series` abaixo. */
  days: number;
  series: Array<{
    date: string;
    meals: number;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }>;
  averages: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}

/**
 * Passos e água são séries **distintas** — o valor diário chama-se `steps` de um
 * lado e `totalMl` do outro. Um `StudentSeries` genérico com `value` já existiu
 * aqui e não correspondia a campo nenhum da API: a tela renderizava `undefined`
 * em toda linha, sem quebrar nada.
 */
export interface StudentStepsProgress {
  points: Array<{ date: string; steps: number; goalReached: boolean | null }>;
  weeklyAverages: Array<{ weekStart: string; avgSteps: number }>;
  totalSteps: number;
  averageDaily: number;
  bestDay: { date: string; steps: number } | null;
  goalTarget: number | null;
  daysWithGoalReached: number;
}

export interface StudentWaterProgress {
  points: Array<{ date: string; totalMl: number; goalReached: boolean | null }>;
  totalMl: number;
  averageDailyMl: number;
  bestDay: { date: string; totalMl: number } | null;
  goalTargetMl: number | null;
  daysWithGoalReached: number;
}

export interface StudentReadResult {
  membershipId: string;
  /** Fuso do **aluno** — é nele que os dias acima foram cortados. */
  timezone: string;
  reading: StudentReading;
}

/**
 * Painel do personal trainer e do nutricionista (#157). **Só leitura.**
 *
 * Não há `create`/`update`/`delete` aqui e não é omissão: pela ADR 014 o
 * profissional nunca opera na conta do aluno. Ele monta o plano na conta dele,
 * oferece, e o aceite do aluno materializa a cópia sob o `userId` do aluno.
 */
export const professionalApi = {
  listStudents: () => apiFetch<Student[]>('/api/professional/students'),

  /**
   * Uma categoria por chamada. A API confere exatamente a categoria pedida e
   * grava uma linha na trilha do aluno — inclusive quando recusa.
   */
  readStudent: (membershipId: string, scope: ShareScope, days?: number) => {
    const qs = new URLSearchParams({ scope });
    if (days !== undefined) qs.set('days', String(days));
    return apiFetch<StudentReadResult>(
      `/api/professional/students/${encodeURIComponent(membershipId)}/progress?${qs.toString()}`,
    );
  },
};
