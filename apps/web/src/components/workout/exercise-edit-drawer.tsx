'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import { workoutApi, type Exercise } from '@/lib/api/workout';

interface Props {
  /** Exercício custom (ou cópia) a editar. */
  exercise: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (exercise: Exercise) => void;
}

export function ExerciseEditDrawer({ exercise, open, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState('');
  const [instructions, setInstructions] = useState('');

  // Sincroniza os campos quando abre / muda de exercício.
  useEffect(() => {
    if (!exercise) return;
    setName(exercise.name ?? '');
    setEquipment(exercise.equipment ?? '');
    setInstructions((exercise.instructions ?? []).join('\n'));
  }, [exercise]);

  const save = useMutation({
    mutationFn: () => {
      if (!exercise) throw new Error('no exercise');
      return workoutApi.updateExercise(exercise.id, {
        name: name.trim(),
        equipment: equipment.trim(),
        instructions: instructions
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['workout', 'exercise', exercise?.id] });
      onSaved?.(updated);
      onOpenChange(false);
    },
  });

  if (!exercise) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Editar exercício</DrawerTitle>
          <DrawerDescription>
            Sua cópia editável. Os músculos do diagrama são mantidos.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto max-h-[68vh] py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ex-name">Nome</Label>
            <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-equip">Equipamento</Label>
            <Input
              id="ex-equip"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              placeholder="Ex.: barra, halteres, máquina"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-instr">Instruções (uma por linha)</Label>
            <textarea
              id="ex-instr"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            disabled={save.isPending || name.trim().length === 0}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          <DrawerClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
