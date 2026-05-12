'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Trash2, Plus, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { workoutApi, type Exercise, type WorkoutPlanExercise } from '@/lib/api/workout';
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

function AddExerciseDrawer({
  open,
  onOpenChange,
  planId,
  existingExerciseIds,
  nextOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  existingExerciseIds: Set<number>;
  nextOrder: number;
}) {
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
    mutationFn: (exercise: Exercise) =>
      workoutApi.addPlanExercise(planId, {
        exerciseId: exercise.id,
        order: nextOrder,
        targetSets: 3,
        targetReps: '8-12',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', planId] });
      onOpenChange(false);
    },
  });

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
                onClick={() => add.mutate(exercise)}
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

function ExerciseRow({
  item,
  planId,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  item: WorkoutPlanExercise;
  planId: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const qc = useQueryClient();
  const [targetSets, setTargetSets] = useState(String(item.targetSets));
  const [targetReps, setTargetReps] = useState(item.targetReps);

  const update = useMutation({
    mutationFn: (body: { targetSets?: number; targetReps?: string }) =>
      workoutApi.updatePlanExercise(planId, item.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', planId] });
    },
  });

  const remove = useMutation({
    mutationFn: () => workoutApi.removePlanExercise(planId, item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', planId] });
    },
  });

  function handleSetsBlur() {
    const n = parseInt(targetSets, 10);
    if (!isNaN(n) && n > 0 && n !== item.targetSets) {
      update.mutate({ targetSets: n });
    }
  }

  function handleRepsBlur() {
    if (targetReps.trim() && targetReps.trim() !== item.targetReps) {
      update.mutate({ targetReps: targetReps.trim() });
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
          aria-label="Mover para cima"
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
          aria-label="Mover para baixo"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{item.exercise.name}</p>
        <p className="text-xs text-muted-foreground">{item.exercise.muscleGroup}</p>
      </div>

      <div className="flex items-center gap-1">
        <Input
          value={targetSets}
          onChange={(e) => setTargetSets(e.target.value)}
          onBlur={handleSetsBlur}
          className="h-7 w-10 px-1 text-center text-xs"
          aria-label="Séries"
        />
        <span className="text-xs text-muted-foreground">×</span>
        <Input
          value={targetReps}
          onChange={(e) => setTargetReps(e.target.value)}
          onBlur={handleRepsBlur}
          className="h-7 w-16 px-1 text-center text-xs"
          aria-label="Repetições"
        />
      </div>

      <button
        type="button"
        onClick={() => remove.mutate()}
        disabled={remove.isPending}
        className="rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-50"
        aria-label="Remover exercício"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function EditPlanPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [nameEdit, setNameEdit] = useState('');
  const [editingName, setEditingName] = useState(false);

  const plan = useQuery({
    queryKey: ['workout', 'plan', id],
    queryFn: () => workoutApi.getPlan(id),
  });

  const renamePlan = useMutation({
    mutationFn: (name: string) => workoutApi.updatePlan(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      setEditingName(false);
    },
  });

  const movExercise = useMutation({
    mutationFn: ({ exerciseId, order }: { exerciseId: string; order: number }) =>
      workoutApi.updatePlanExercise(id, exerciseId, { order }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  function startEditName() {
    setNameEdit(plan.data?.name ?? '');
    setEditingName(true);
  }

  function submitName() {
    const trimmed = nameEdit.trim();
    if (trimmed && trimmed !== plan.data?.name) {
      renamePlan.mutate(trimmed);
    } else {
      setEditingName(false);
    }
  }

  const exercises = [...(plan.data?.exercises ?? [])].sort((a, b) => a.order - b.order);
  const existingIds = new Set(exercises.map((e) => e.exerciseId));
  const nextOrder = exercises.length > 0 ? Math.max(...exercises.map((e) => e.order)) + 1 : 1;

  function handleMoveUp(idx: number) {
    if (idx === 0) return;
    const a = exercises[idx];
    const b = exercises[idx - 1];
    movExercise.mutate({ exerciseId: a.id, order: b.order });
    movExercise.mutate({ exerciseId: b.id, order: a.order });
  }

  function handleMoveDown(idx: number) {
    if (idx === exercises.length - 1) return;
    const a = exercises[idx];
    const b = exercises[idx + 1];
    movExercise.mutate({ exerciseId: a.id, order: b.order });
    movExercise.mutate({ exerciseId: b.id, order: a.order });
  }

  if (plan.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!plan.data) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Plano não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link
          href="/workout/plans"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ChevronLeft size={20} />
        </Link>

        {editingName ? (
          <div className="flex flex-1 gap-2">
            <Input
              autoFocus
              value={nameEdit}
              onChange={(e) => setNameEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="h-8 text-lg font-semibold"
            />
            <Button
              size="sm"
              onClick={submitName}
              disabled={!nameEdit.trim() || renamePlan.isPending}
            >
              OK
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditName}
            className="text-xl font-semibold hover:underline"
          >
            {plan.data.name}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {exercises.map((item, idx) => (
          <ExerciseRow
            key={item.id}
            item={item}
            planId={id}
            isFirst={idx === 0}
            isLast={idx === exercises.length - 1}
            onMoveUp={() => handleMoveUp(idx)}
            onMoveDown={() => handleMoveDown(idx)}
          />
        ))}
      </div>

      {exercises.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum exercício no plano ainda.</p>
      )}

      <Button variant="outline" className="w-full gap-2" onClick={() => setAddOpen(true)}>
        <Plus size={16} />
        Adicionar exercício
      </Button>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planId={id}
        existingExerciseIds={existingIds}
        nextOrder={nextOrder}
      />
    </div>
  );
}
