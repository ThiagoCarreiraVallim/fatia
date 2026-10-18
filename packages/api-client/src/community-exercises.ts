import { apiFetch } from './http';
import type { MediaView } from './community-content';

/**
 * O catálogo de exercícios da comunidade (Fase 7b, ADR 030). A equipe cria os
 * exercícios da casa e grava o tutorial (vídeo, fotos, dicas) por cima de
 * qualquer exercício; quem treina vê esse tutorial no detalhe do exercício, e a
 * busca põe o que a comunidade destaca primeiro.
 */

/** Os equipamentos que a academia marca. "Peso corporal" vale sempre. */
export const GYM_EQUIPMENT = [
  'barra',
  'barra W',
  'halteres',
  'polia',
  'máquina',
  'kettlebell',
  'elástico',
  'bola medicinal',
  'bola suíça',
  'rolo de espuma',
] as const;
export type GymEquipment = (typeof GYM_EQUIPMENT)[number];

export const EQUIPMENT_LABEL: Record<GymEquipment, string> = {
  barra: 'Barra',
  'barra W': 'Barra W',
  halteres: 'Halteres',
  polia: 'Polia',
  máquina: 'Máquina',
  kettlebell: 'Kettlebell',
  elástico: 'Elástico',
  'bola medicinal': 'Bola medicinal',
  'bola suíça': 'Bola suíça',
  'rolo de espuma': 'Rolo de espuma',
};

/** O equipamento de um exercício da casa: o da academia, peso corporal ou outro. */
export const EXERCISE_EQUIPMENT = [...GYM_EQUIPMENT, 'peso corporal', 'outro'] as const;

/** Os grupos musculares do catálogo, na ordem do editor (os mesmos da API). */
export const MUSCLE_GROUPS = [
  'peito',
  'costas',
  'pernas',
  'ombro',
  'braço',
  'core',
  'cardio',
] as const;

export const MUSCLE_GROUP_LABEL: Record<(typeof MUSCLE_GROUPS)[number], string> = {
  peito: 'Peito',
  costas: 'Costas',
  pernas: 'Pernas',
  ombro: 'Ombro',
  braço: 'Braço',
  core: 'Core',
  cardio: 'Cardio',
};

export const MAX_GUIDE_PHOTOS = 4;
export const MAX_GUIDE_TIPS = 2000;

export interface GroupExercise {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** Criado pela comunidade; `false` = exercício do catálogo geral com o tutorial dela. */
  ownedByCommunity: boolean;
  video: MediaView | null;
  photos: MediaView[];
  tips: string | null;
  authorName: string;
  updatedAt: string;
  /** Só na bancada da equipe. */
  canEdit?: boolean;
}

export interface GroupExerciseInput {
  name: string;
  muscleGroup: string;
  equipment?: string | null;
  level?: string | null;
  mechanic?: string | null;
  instructions?: string[];
}

export interface GuideInput {
  videoFileId?: string | null;
  photoFileIds?: string[];
  tips?: string | null;
}

const base = '/api/groups';
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const groupExerciseApi = {
  /** Bancada da equipe: o catálogo e o equipamento marcado. */
  list: (groupId: string) =>
    apiFetch<{ equipment: string[]; items: GroupExercise[] }>(
      `${base}/${groupId}/content/exercises`,
    ),
  get: (groupId: string, exerciseId: number) =>
    apiFetch<GroupExercise>(`${base}/${groupId}/content/exercises/${exerciseId}`),
  create: (groupId: string, input: GroupExerciseInput & GuideInput) =>
    apiFetch<GroupExercise>(`${base}/${groupId}/content/exercises`, json('POST', input)),
  update: (groupId: string, exerciseId: number, input: Partial<GroupExerciseInput>) =>
    apiFetch<GroupExercise>(
      `${base}/${groupId}/content/exercises/${exerciseId}`,
      json('PATCH', input),
    ),
  setGuide: (groupId: string, exerciseId: number, input: GuideInput) =>
    apiFetch<GroupExercise>(
      `${base}/${groupId}/content/exercises/${exerciseId}/guide`,
      json('PUT', input),
    ),
  remove: (groupId: string, exerciseId: number) =>
    apiFetch<{ id: number }>(`${base}/${groupId}/content/exercises/${exerciseId}`, json('DELETE')),
  setEquipment: (groupId: string, equipment: string[]) =>
    apiFetch<{ equipment: string[] }>(`${base}/${groupId}/equipment`, json('PUT', { equipment })),

  /** Vitrine do membro. */
  forMember: (groupId: string) => apiFetch<GroupExercise[]>(`${base}/${groupId}/exercises`),
};

export const VIDEO_MIMES = ['video/mp4', 'video/quicktime'] as const;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/** Mensagem para a pessoa antes de pedir a URL, ou `null` se o vídeo serve. */
export function videoProblem(file: { type: string; size: number }): string | null {
  if (!(VIDEO_MIMES as readonly string[]).includes(file.type)) {
    return 'Escolha um vídeo MP4 ou MOV.';
  }
  if (file.size > VIDEO_MAX_BYTES) return 'O vídeo passa de 200 MB. Grave um trecho menor.';
  if (file.size <= 0) return 'O vídeo está vazio.';
  return null;
}

/** "45 MB", "800 KB": para a pessoa saber o que está enviando. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** As instruções do editor: uma por linha, sem linhas vazias. */
export function instructionsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim())
    .filter(Boolean);
}

/** O que o editor da equipe pode salvar, ou o recado do que falta. */
export function groupExerciseProblem(input: { name: string; muscleGroup: string }): string | null {
  if (!input.name.trim()) return 'Dê um nome ao exercício.';
  if (!input.muscleGroup.trim()) return 'Escolha o grupo muscular.';
  return null;
}
