'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
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
import { CommunityGuideSection } from './community-guide';
import { ExerciseEditDrawer } from './exercise-edit-drawer';
import { workoutApi, type Exercise } from '@fatia/api-client';

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
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Exercise | null>(null);

  // Editar um exercício base cria uma cópia editável (a base some das listagens
  // do usuário e aparece a cópia). Exercício custom é editado direto.
  const clone = useMutation({
    mutationFn: (id: number) => workoutApi.cloneExercise(id),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      if (exercise) qc.invalidateQueries({ queryKey: ['workout', 'exercise', exercise.id] });
      onOpenChange(false);
      setEditing(copy);
    },
  });

  const guia = exercise?.community ?? null;
  // O vídeo da comunidade substitui o do YouTube: é o tutorial que a academia
  // (ou quem a pessoa segue) gravou para este exercício.
  const videoId =
    exercise && !guia?.video?.url
      ? (exercise.youtubeVideoIdPt ?? exercise.youtubeVideoId ?? null)
      : null;

  const handleEdit = () => {
    if (!exercise) return;
    if (exercise.source === 'CUSTOM') {
      onOpenChange(false);
      setEditing(exercise);
    } else {
      clone.mutate(exercise.id);
    }
  };

  return (
    <>
      {exercise && (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="px-4 pb-6">
            <DrawerHeader className="px-0">
              <DrawerTitle>{exercise.name}</DrawerTitle>
              {exercise.muscleGroup && (
                <DrawerDescription className="capitalize">{exercise.muscleGroup}</DrawerDescription>
              )}
            </DrawerHeader>

            <Button
              variant="outline"
              className="mb-3 w-full gap-2"
              disabled={clone.isPending}
              onClick={handleEdit}
            >
              <Pencil size={16} />
              {clone.isPending
                ? 'Criando cópia...'
                : exercise.source === 'CUSTOM'
                  ? 'Editar'
                  : 'Editar (cria uma cópia sua)'}
            </Button>

            {/* Rolável e focável: sem vídeo, nada aqui dentro recebe foco, e quem
                usa só o teclado não conseguiria rolar até as instruções. */}
            <div
              role="region"
              aria-label={`Detalhes de ${exercise.name}`}
              tabIndex={0}
              className="max-h-[68vh] space-y-5 overflow-y-auto rounded-md py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {guia && <CommunityGuideSection guide={guia} exerciseName={exercise.name} />}

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
                  <div
                    className="relative w-full overflow-hidden rounded-xl"
                    style={{ paddingTop: '56.25%' }}
                  >
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
      )}

      <ExerciseEditDrawer
        exercise={editing}
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
    </>
  );
}
