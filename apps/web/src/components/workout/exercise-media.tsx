'use client';

import type { Exercise } from '@fatia/api-client';

/** O vídeo que vale: o da comunidade da pessoa ganha do YouTube. */
export function exerciseVideo(
  exercise: Exercise,
): { kind: 'community'; url: string } | { kind: 'youtube'; id: string } | null {
  const community = exercise.community?.video?.url;
  if (community) return { kind: 'community', url: community };
  const id = exercise.youtubeVideoIdPt ?? exercise.youtubeVideoId;
  return id ? { kind: 'youtube', id } : null;
}

/** O player: YouTube embutido ou o vídeo da comunidade (URL assinada). */
export function ExerciseVideo({
  exercise,
  onExpired,
}: {
  exercise: Exercise;
  /** A URL assinada venceu (erro no `<video>`): busca outra. */
  onExpired: () => void;
}) {
  const video = exerciseVideo(exercise);
  if (!video) return null;
  const label = `Vídeo: ${exercise.name}`;
  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-muted pt-[56.25%]">
      {video.kind === 'youtube' ? (
        <iframe
          src={`https://www.youtube.com/embed/${encodeURIComponent(video.id)}?rel=0&playsinline=1`}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <video
          src={video.url}
          aria-label={label}
          controls
          playsInline
          muted
          loop
          preload="metadata"
          onError={onExpired}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
