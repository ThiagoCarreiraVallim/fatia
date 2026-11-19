import type { Exercise } from './workout';
import { SIGNED_VIDEO_REFRESH_MS } from './workout-session-copy';

/**
 * O vídeo do exercício dentro do app (pranchas `Al-T3-Sessao` e
 * `Al-T9-Como-fazer`) e a rota do "Como fazer".
 *
 * O ID do YouTube vem do banco, mas acaba numa URL carregada por uma WebView:
 * por isso só passa o formato que o YouTube usa (11 caracteres de base64url).
 * Qualquer outra coisa vira "sem vídeo", em vez de virar uma página arbitrária.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export type ExerciseVideoSource =
  { kind: 'community'; url: string } | { kind: 'youtube'; id: string } | null;

/** O vídeo que vale: o da comunidade substitui o do YouTube (Fase 7b). */
export function exerciseVideoSource(exercise: Exercise | null | undefined): ExerciseVideoSource {
  if (!exercise) return null;
  const url = exercise.community?.video?.url;
  if (url) return { kind: 'community', url };
  const id = exercise.youtubeVideoIdPt ?? exercise.youtubeVideoId;
  return id && YOUTUBE_ID.test(id) ? { kind: 'youtube', id } : null;
}

/**
 * O player embutido: `youtube-nocookie` (sem cookie de rastreio até o play),
 * tocando na linha (`playsinline`, senão o iOS abre em tela cheia) e sem
 * recomendações de outros canais no fim (`rel=0`).
 */
export function youtubeEmbedUrl(id: string): string | null {
  if (!YOUTUBE_ID.test(id)) return null;
  const params = new URLSearchParams({
    autoplay: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** Para o fallback no navegador do sistema, quando não dá para embutir. */
export function youtubeWatchUrl(id: string): string | null {
  return YOUTUBE_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

/**
 * A URL assinada do vídeo da comunidade vence em 10 min: buscada há mais de
 * `SIGNED_VIDEO_REFRESH_MS`, a tela busca de novo antes de tocar.
 */
export function signedVideoIsStale(fetchedAt: number, now: number): boolean {
  return now - fetchedAt > SIGNED_VIDEO_REFRESH_MS;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'iniciante',
  intermediate: 'intermediário',
  advanced: 'avançado',
};

const MECHANIC_LABEL: Record<string, string> = {
  compound: 'composto',
  isolation: 'isolado',
};

/** "barra · intermediário · composto", ao lado do grupo (prancha `Al-T9`). */
export function howToMeta(exercise: Pick<Exercise, 'equipment' | 'level' | 'mechanic'>): string {
  return [
    exercise.equipment,
    exercise.level ? (LEVEL_LABEL[exercise.level] ?? exercise.level) : null,
    exercise.mechanic ? (MECHANIC_LABEL[exercise.mechanic] ?? exercise.mechanic) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A tela "Como fazer" (Al-T9). */
export function exerciseDetailPath(exerciseId: number): string {
  return `/workout/exercise/${exerciseId}`;
}
