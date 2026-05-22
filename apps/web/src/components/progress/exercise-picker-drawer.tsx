'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { workoutApi, type Exercise } from '@/lib/api/workout';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  // Filtra exercícios: cardio = só cardio, strength = tudo exceto cardio
  filter: 'cardio' | 'strength';
}

export function ExercisePickerDrawer({ open, onClose, onPick, filter }: Props) {
  const [q, setQ] = useState('');

  const { data } = useQuery({
    queryKey: ['exercises', 'search', q],
    queryFn: () => workoutApi.searchExercises(q || undefined),
    enabled: open,
  });

  const filtered = (data ?? []).filter((e) =>
    filter === 'cardio' ? e.muscleGroup === 'cardio' : e.muscleGroup !== 'cardio',
  );

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>
            {filter === 'cardio' ? 'Escolher exercício de cardio' : 'Escolher exercício de força'}
          </DrawerTitle>
          <DrawerDescription>
            {filter === 'cardio'
              ? 'Apenas exercícios marcados como cardio.'
              : 'Todos os exercícios exceto cardio.'}
          </DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" autoFocus />
          <div className="max-h-[60vh] -mx-2 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nenhum exercício encontrado.
              </p>
            )}
            {filtered.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => onPick(ex)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="truncate font-medium text-foreground">{ex.name}</span>
                <span className="text-[11px] text-muted-foreground">{ex.muscleGroup}</span>
              </button>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
