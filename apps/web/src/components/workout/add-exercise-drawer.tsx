'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { workoutApi, type Exercise } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingExerciseIds: Set<number>;
  /** When provided, persists via API to the given plan. Otherwise calls onAdd locally. */
  planId?: string;
  nextOrder?: number;
  onAdd?: (exercise: Exercise) => void;
}

export function AddExerciseDrawer({
  open,
  onOpenChange,
  existingExerciseIds,
  planId,
  nextOrder,
  onAdd,
}: Props) {
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

  const add = useMutation({
    mutationFn: (exercise: Exercise) => {
      if (!planId) throw new Error('planId required for API mode');
      return workoutApi.addPlanExercise(planId, {
        exerciseId: exercise.id,
        order: nextOrder ?? 1,
        targetSets: 3,
        targetReps: '8-12',
      });
    },
    onSuccess: () => {
      if (planId) qc.invalidateQueries({ queryKey: ['workout', 'plan', planId] });
      onOpenChange(false);
    },
  });

  function handleSelect(exercise: Exercise) {
    if (planId) {
      add.mutate(exercise);
    } else {
      onAdd?.(exercise);
      onOpenChange(false);
    }
  }

  const filtered = search.data?.filter((e) => !existingExerciseIds.has(e.id));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Adicionar exercício</DrawerTitle>
          <DrawerDescription>Busque e selecione um exercício para o plano.</DrawerDescription>
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
                onClick={() => handleSelect(exercise)}
                disabled={add.isPending}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent disabled:opacity-50"
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
