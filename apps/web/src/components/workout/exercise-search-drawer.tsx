'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { workoutApi, type Exercise } from '@/lib/api/workout';
import { isCardioExercise } from '@/lib/workout/is-cardio';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
}

export function ExerciseSearchDrawer({ open, onOpenChange, sessionId }: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    if (!open) {
      setQ('');
      setDebounced('');
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['workout', 'exercises', debounced],
    queryFn: () => workoutApi.searchExercises(debounced || undefined),
    enabled: open,
  });

  const logSet = useMutation({
    mutationFn: (exercise: Exercise) =>
      workoutApi.logSet(sessionId, {
        exerciseId: exercise.id,
        ...(isCardioExercise(exercise) ? { durationSeconds: 60 } : { reps: 1 }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      onOpenChange(false);
    },
  });

  const filtered =
    debounced.trim().length < 2
      ? search.data
      : search.data?.filter((e) => e.name.toLowerCase().includes(debounced.toLowerCase()));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Adicionar exercício</DrawerTitle>
          <DrawerDescription>Busque um exercício para registrar.</DrawerDescription>
        </DrawerHeader>

        <div className="relative my-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex.: supino, corrida, agachamento..."
            className="pl-9"
          />
        </div>

        <ul className="-mx-4 max-h-[55vh] divide-y overflow-y-auto">
          {search.isFetching && (
            <li className="px-4 py-3 text-sm text-muted-foreground">Buscando...</li>
          )}
          {!search.isFetching && (!filtered || filtered.length === 0) && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              {debounced.trim().length > 0
                ? 'Nenhum resultado.'
                : 'Todos os exercícios carregados.'}
            </li>
          )}
          {filtered?.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => logSet.mutate(exercise)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-medium">{exercise.name}</p>
                  <p className="text-xs text-muted-foreground">{exercise.muscleGroup}</p>
                </div>
                {exercise.source === 'CUSTOM' && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">custom</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <DrawerClose asChild>
          <Button variant="ghost" className="mt-2 w-full">
            Cancelar
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
