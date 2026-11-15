'use client';

import { useQuery } from '@tanstack/react-query';
import { SIGNED_VIDEO_REFRESH_MS, workoutApi, type Exercise } from '@fatia/api-client';
import { MuscleDiagram } from './muscle-diagram';

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

/**
 * O topo do exercício em foco na sessão (pranchas Al-T3 e Al-T3d): o vídeo,
 * quando há; sem vídeo, o aparelho, a dica da comunidade e o diagrama dos
 * músculos. O "Como fazer" completo fica no botão do título.
 */
export function ExerciseMedia({
  exerciseId,
  exerciseName,
}: {
  exerciseId: number;
  exerciseName: string;
}) {
  const detail = useQuery({
    queryKey: ['workout', 'exercise', exerciseId],
    queryFn: () => workoutApi.getExercise(exerciseId),
    // A URL do vídeo da comunidade vale 10 min: renova antes de vencer.
    refetchInterval: (q) => (q.state.data?.community?.video?.url ? SIGNED_VIDEO_REFRESH_MS : false),
  });
  const exercise = detail.data;
  if (!exercise) return null;

  if (exerciseVideo(exercise)) {
    return <ExerciseVideo exercise={exercise} onExpired={() => void detail.refetch()} />;
  }

  const tips = exercise.community?.tips;
  const hasMuscles = exercise.primaryMuscles.length > 0;
  if (!exercise.equipment && !tips && !hasMuscles) return null;

  return (
    <div
      role="group"
      aria-label={`Sobre ${exerciseName}`}
      className="flex items-center gap-3 rounded-3xl bg-muted/40 p-3"
    >
      {hasMuscles && (
        <div className="shrink-0">
          <MuscleDiagram
            primaryMuscles={exercise.primaryMuscles}
            secondaryMuscles={exercise.secondaryMuscles}
            sizeClassName="w-16"
          />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        {exercise.equipment && (
          <span className="inline-block rounded-full bg-card px-2.5 py-1 text-xs font-bold capitalize text-foreground">
            {exercise.equipment}
          </span>
        )}
        {tips && (
          <div>
            <p className="text-[11px] font-bold text-primary">
              Dica da {exercise.community!.groupName}
            </p>
            <p className="text-[13px] leading-snug text-foreground">{tips}</p>
          </div>
        )}
      </div>
    </div>
  );
}
