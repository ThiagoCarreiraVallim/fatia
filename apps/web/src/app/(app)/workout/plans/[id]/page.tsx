'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Play, Clock, Dumbbell, Lightbulb, Plus, Trash2, Check } from 'lucide-react';
import { workoutApi } from '@/lib/api/workout';
import { isCardioExercise } from '@/lib/workout/is-cardio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameEdit, setNameEdit] = useState('');

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

  const deletePlan = useMutation({
    mutationFn: () => workoutApi.deletePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.push('/workout');
    },
  });

  const updateExercise = useMutation({
    mutationFn: ({
      exerciseId,
      body,
    }: {
      exerciseId: string;
      body: { targetSets?: number; targetReps?: string; order?: number };
    }) => workoutApi.updatePlanExercise(id, exerciseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  const removeExercise = useMutation({
    mutationFn: (exerciseId: string) => workoutApi.removePlanExercise(id, exerciseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  const start = useMutation({
    mutationFn: () =>
      workoutApi.startSession({
        planId: id,
        startedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push('/workout');
    },
  });

  if (plan.isLoading) {
    return (
      <div className="space-y-3 px-5 pt-4">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-44 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!plan.data) {
    return <p className="px-5 pt-4 text-sm text-muted-foreground">Plano não encontrado.</p>;
  }

  const exercises = [...plan.data.exercises].sort((a, b) => a.order - b.order);
  const existingIds = new Set(exercises.map((e) => e.exerciseId));
  const nextOrder = exercises.length > 0 ? Math.max(...exercises.map((e) => e.order)) + 1 : 1;
  const totalSets = exercises.reduce((acc, e) => acc + e.targetSets, 0);
  const estDuration = Math.max(15, totalSets * 5);
  const estVolume = (totalSets * 1.5).toFixed(1);

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

  function handleMoveUp(idx: number) {
    if (idx === 0) return;
    const a = exercises[idx];
    const b = exercises[idx - 1];
    updateExercise.mutate({ exerciseId: a.id, body: { order: b.order } });
    updateExercise.mutate({ exerciseId: b.id, body: { order: a.order } });
  }

  function handleMoveDown(idx: number) {
    if (idx === exercises.length - 1) return;
    const a = exercises[idx];
    const b = exercises[idx + 1];
    updateExercise.mutate({ exerciseId: a.id, body: { order: b.order } });
    updateExercise.mutate({ exerciseId: b.id, body: { order: a.order } });
  }

  function handleDelete() {
    if (confirm('Excluir este plano de treino?')) {
      deletePlan.mutate();
    }
  }

  return (
    <div className="pb-4">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-background/90 px-4 backdrop-blur">
        <Link
          href="/workout"
          aria-label="Voltar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
        >
          <ChevronLeft size={20} />
        </Link>
        {editingName ? (
          <div className="flex flex-1 items-center gap-2 px-2">
            <Input
              autoFocus
              value={nameEdit}
              onChange={(e) => setNameEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="h-8 text-base font-bold"
            />
            <button
              type="button"
              onClick={submitName}
              disabled={!nameEdit.trim() || renamePlan.isPending}
              className="rounded p-1 text-primary disabled:opacity-50"
              aria-label="Salvar nome"
            >
              <Check size={18} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditName}
            className="flex-1 truncate px-2 text-center text-base font-bold text-foreground hover:underline"
          >
            {plan.data.name}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Excluir plano"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-rose-500"
        >
          <Trash2 size={18} />
        </button>
      </header>

      <div className="space-y-4 px-5 pt-2">
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card">
          <div className="relative h-44 w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-stone-800 to-stone-900" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute left-4 right-4 top-4 flex gap-2">
              <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                HIPERTROFIA
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h2 className="text-2xl font-extrabold text-white">{plan.data.name}</h2>
              <p className="mt-1 text-xs text-white/70">
                {exercises.length} exercício{exercises.length !== 1 ? 's' : ''} • {totalSets} séries
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 border-t border-white/5 px-5 py-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-primary" />
              <div>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground">Duração</p>
                <p className="text-sm font-extrabold text-foreground tabular-nums">
                  {estDuration}m
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dumbbell size={14} className="text-primary" />
              <div>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground">Volume</p>
                <p className="text-sm font-extrabold text-foreground tabular-nums">
                  {estVolume} Ton
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-foreground">
            Exercícios{' '}
            <span className="text-sm font-bold text-muted-foreground">({exercises.length})</span>
          </h3>
        </div>

        {exercises.length === 0 && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center text-sm text-muted-foreground hover:bg-primary/10"
          >
            <Plus size={20} className="text-primary" />
            <span>
              Plano criado! Agora{' '}
              <span className="font-bold text-primary">adicione seu primeiro exercício</span>.
            </span>
          </button>
        )}

        <div className="space-y-3">
          {exercises.map((ex, idx) => (
            <ExerciseDetailCard
              key={ex.id}
              mode="plan"
              item={ex}
              isCardio={isCardioExercise(ex.exercise)}
              isFirst={idx === 0}
              isLast={idx === exercises.length - 1}
              onChangeSets={(n) =>
                updateExercise.mutate({ exerciseId: ex.id, body: { targetSets: n } })
              }
              onChangeReps={(v) =>
                updateExercise.mutate({ exerciseId: ex.id, body: { targetReps: v } })
              }
              onRemove={() => removeExercise.mutate(ex.id)}
              onMoveUp={() => handleMoveUp(idx)}
              onMoveDown={() => handleMoveDown(idx)}
            />
          ))}
        </div>

        <Button
          variant="outline"
          className="w-full gap-2 rounded-2xl"
          onClick={() => setAddOpen(true)}
        >
          <Plus size={16} />
          Adicionar exercício
        </Button>

        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-primary" />
            <h4 className="text-sm font-extrabold text-foreground">Foco na Excêntrica</h4>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Mantenha o controle da descida (fase excêntrica) por 3 segundos para maximizar a
            hipertrofia.
          </p>
        </div>

        <Button
          className="h-14 w-full rounded-full text-base font-extrabold shadow-[0_0_24px_hsl(var(--primary)/0.45)]"
          onClick={() => start.mutate()}
          disabled={start.isPending || exercises.length === 0}
        >
          <Play size={16} fill="currentColor" className="mr-1.5" />
          {start.isPending ? 'Iniciando...' : 'Iniciar Treino'}
        </Button>
      </div>

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
