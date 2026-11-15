'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import {
  muscleGroupLabel,
  SIGNED_VIDEO_REFRESH_MS,
  workoutApi,
  type StrengthMuscleGroup,
} from '@fatia/api-client';
import { ExerciseDetailDrawer } from './exercise-detail-drawer';
import { ExerciseVideo, exerciseVideo } from './exercise-media';
import { groupTone } from './group-tone';
import { MuscleDiagram } from './muscle-diagram';

/**
 * O topo do exercício em foco (pranchas `Al-T3-Sessao` e `Al-T3d-Sessao-sem-video`),
 * o `ExerciseHeading` do app: o grupo com a cor e o equipamento, o nome grande,
 * a dica da comunidade e o "Como fazer". Com vídeo, ele vem antes; sem vídeo,
 * os músculos no boneco à direita — o que ajuda diante de um aparelho que a
 * pessoa não conhece.
 */
export function ExerciseHeading({
  exerciseId,
  exerciseName,
}: {
  exerciseId: number;
  exerciseName: string;
}) {
  const [open, setOpen] = useState(false);
  // A mesma chave do `ExerciseDetailCard`: quem já abriu por lá não espera.
  const detail = useQuery({
    queryKey: ['workout', 'exercise', exerciseId],
    queryFn: () => workoutApi.getExercise(exerciseId),
    // A URL do vídeo da comunidade vale 10 min: renova antes de vencer.
    refetchInterval: (q) => (q.state.data?.community?.video?.url ? SIGNED_VIDEO_REFRESH_MS : false),
  });
  const exercise = detail.data;
  const hasVideo = exercise ? exerciseVideo(exercise) != null : false;
  const group = exercise?.muscleGroup;
  const groupLabel = group
    ? group === 'cardio'
      ? 'Cardio'
      : muscleGroupLabel(group as StrengthMuscleGroup)
    : null;
  const tip = exercise?.community?.tips?.trim();

  return (
    <div className="space-y-3">
      {exercise && hasVideo && (
        <ExerciseVideo exercise={exercise} onExpired={() => void detail.refetch()} />
      )}
      <div className="flex items-center gap-3 px-1">
        <div className="min-w-0 flex-1 space-y-2">
          {(groupLabel || exercise?.equipment) && (
            <p className="flex flex-wrap items-center gap-2 text-xs">
              {groupLabel && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground">
                  <span
                    aria-hidden
                    className="h-[7px] w-[7px] rounded-[2px]"
                    style={{ background: groupTone(group ?? '') }}
                  />
                  {groupLabel}
                </span>
              )}
              {exercise?.equipment && <span className="text-faint">{exercise.equipment}</span>}
            </p>
          )}
          <h2 className="font-display text-[26px] font-semibold leading-[1.1] text-foreground">
            {exerciseName}
          </h2>
          {tip && (
            <p className="line-clamp-4 text-[13px] leading-[18px] text-foreground">
              {exercise?.community?.groupName ? `Dica da ${exercise.community.groupName}: ` : ''}
              {tip}
            </p>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Como fazer ${exerciseName}`}
            className="anim-press inline-flex h-[34px] items-center gap-1.5 rounded-full bg-muted px-3 text-[13px] font-bold text-foreground"
          >
            <Info size={16} aria-hidden />
            {open && !exercise ? 'Carregando...' : 'Como fazer'}
          </button>
        </div>
        {exercise && !hasVideo && exercise.primaryMuscles.length > 0 && (
          <MuscleDiagram
            primaryMuscles={exercise.primaryMuscles}
            secondaryMuscles={exercise.secondaryMuscles}
            view="front"
            sizeClassName="w-[84px] shrink-0"
          />
        )}
      </div>
      <ExerciseDetailDrawer
        exercise={exercise ?? null}
        open={open && !!exercise}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      />
    </div>
  );
}
