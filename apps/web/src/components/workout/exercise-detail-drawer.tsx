'use client';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { MuscleDiagram } from './muscle-diagram';
import type { Exercise } from '@/lib/api/workout';

interface Props {
  exercise: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

const MECHANIC_LABEL: Record<string, string> = {
  compound: 'Composto',
  isolation: 'Isolado',
};

export function ExerciseDetailDrawer({ exercise, open, onOpenChange }: Props) {
  if (!exercise) return null;

  const videoId = exercise.youtubeVideoIdPt ?? exercise.youtubeVideoId ?? null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>{exercise.name}</DrawerTitle>
          {exercise.muscleGroup && (
            <DrawerDescription className="capitalize">{exercise.muscleGroup}</DrawerDescription>
          )}
        </DrawerHeader>

        <div className="overflow-y-auto max-h-[72vh] space-y-5 py-2">
          {/* Muscle diagram */}
          {exercise.primaryMuscles && exercise.primaryMuscles.length > 0 && (
            <MuscleDiagram
              primaryMuscles={exercise.primaryMuscles}
              secondaryMuscles={exercise.secondaryMuscles ?? []}
            />
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {exercise.level && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                {LEVEL_LABEL[exercise.level] ?? exercise.level}
              </span>
            )}
            {exercise.mechanic && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                {MECHANIC_LABEL[exercise.mechanic] ?? exercise.mechanic}
              </span>
            )}
            {exercise.equipment && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold capitalize">
                {exercise.equipment}
              </span>
            )}
          </div>

          {/* Muscles list */}
          {exercise.primaryMuscles && exercise.primaryMuscles.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Músculos principais
              </p>
              <p className="text-sm capitalize">{exercise.primaryMuscles.join(', ')}</p>
              {exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 && (
                <>
                  <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase mt-2">
                    Músculos secundários
                  </p>
                  <p className="text-sm capitalize">{exercise.secondaryMuscles.join(', ')}</p>
                </>
              )}
            </div>
          )}

          {/* Instructions */}
          {exercise.instructions && exercise.instructions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Instruções
              </p>
              <ol className="space-y-2 list-none">
                {exercise.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-snug">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* YouTube embed */}
          {videoId && (
            <div className="space-y-2">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Vídeo demonstrativo
              </p>
              <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingTop: '56.25%' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title={`Demonstração: ${exercise.name}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
            </div>
          )}
        </div>

        <DrawerClose asChild>
          <Button variant="ghost" className="mt-4 w-full">
            Fechar
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
