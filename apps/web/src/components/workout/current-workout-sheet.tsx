'use client';

import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { newSetClientKey, workoutApi, type ExerciseGroup } from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { SetChips } from './set-chips';

/**
 * "Treino atual" (prancha Al-T17): o treino inteiro numa folha, para arrumar
 * sem sair da sessão. Cada exercício mostra as séries (tocar edita), ganha
 * "+ Série" (copia a última) e "Tirar do treino" — que a página confirma.
 */
export function CurrentWorkoutSheet({
  open,
  onOpenChange,
  sessionId,
  groups,
  onAddExercise,
  onRemove,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  groups: ExerciseGroup[];
  onAddExercise: () => void;
  onRemove: (group: ExerciseGroup) => void;
  onFinish: () => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Treino atual</DrawerTitle>
          <DrawerDescription>
            Mude séries, tire ou ponha exercícios. O plano não muda.
          </DrawerDescription>
        </DrawerHeader>

        <ul className="max-h-[60vh] space-y-3 overflow-y-auto py-2">
          {groups.map((g) => (
            <CurrentExercise
              key={g.exerciseId}
              sessionId={sessionId}
              group={g}
              onRemove={() => onRemove(g)}
            />
          ))}
        </ul>

        <button
          type="button"
          onClick={onAddExercise}
          className="anim-press mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-subtle text-sm font-bold text-muted-foreground"
        >
          + Exercício
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="anim-press h-12 rounded-full bg-muted text-sm font-extrabold text-foreground"
          >
            Voltar ao treino
          </button>
          <button
            type="button"
            onClick={onFinish}
            className="anim-press h-12 rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
          >
            Finalizar
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function CurrentExercise({
  sessionId,
  group,
  onRemove,
}: {
  sessionId: string;
  group: ExerciseGroup;
  onRemove: () => void;
}) {
  const qc = useQueryClient();
  const clientKey = useRef<string | null>(null);
  const last = group.sets[group.sets.length - 1];

  // "+ Série": a mesma carga e as mesmas repetições da última (ou em branco),
  // com chave própria — o duplo toque não grava duas.
  const addSet = useMutation({
    mutationFn: (key: string) =>
      workoutApi.logSet(sessionId, {
        exerciseId: group.exerciseId,
        weightKg: last?.weightKg ?? undefined,
        reps: last?.reps ?? undefined,
        durationSeconds: last?.durationSeconds ?? undefined,
        distanceMeters: last?.distanceMeters ?? undefined,
        clientKey: key,
      }),
    onSuccess: () => {
      clientKey.current = null;
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });

  return (
    <li className="space-y-2 rounded-2xl border border-subtle bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-foreground">{group.exerciseName}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {group.sets.length}
            {group.targetSets ? ` de ${group.targetSets}` : ''}{' '}
            {group.sets.length === 1 ? 'série' : 'séries'}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Tirar ${group.exerciseName} do treino`}
          onClick={onRemove}
          className="anim-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-danger"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      {group.sets.length > 0 && (
        <SetChips sessionId={sessionId} sets={group.sets} isCardio={group.isCardio} />
      )}

      <button
        type="button"
        aria-label={`Mais uma série de ${group.exerciseName}`}
        disabled={addSet.isPending}
        onClick={() => {
          clientKey.current ??= newSetClientKey();
          addSet.mutate(clientKey.current);
        }}
        className="anim-press flex h-11 items-center gap-1.5 rounded-full bg-muted px-4 text-[13px] font-bold text-foreground disabled:opacity-60"
      >
        <Plus size={14} aria-hidden />
        Série
      </button>
    </li>
  );
}
