'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Play, Clock, Dumbbell, Plus } from 'lucide-react';
import { workoutApi, type Exercise } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { findQuickTemplate } from '@/lib/workout/quick-templates';

interface LocalExercise {
  localId: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
}

export default function QuickTemplatePage() {
  const { templateId } = useParams<{ templateId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const template = useMemo(() => findQuickTemplate(templateId), [templateId]);
  const [items, setItems] = useState<LocalExercise[]>([]);
  const [nameOverride, setNameOverride] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [resolved, setResolved] = useState(false);

  const lookups = useQueries({
    queries: (template?.exercises ?? []).map((ex) => ({
      queryKey: ['workout', 'exercises', ex.nameQuery],
      queryFn: () => workoutApi.searchExercises(ex.nameQuery),
    })),
  });

  useEffect(() => {
    if (!template || resolved) return;
    const allDone = lookups.every((q) => q.isSuccess || q.isError);
    if (!allDone) return;
    const seen = new Set<number>();
    const next: LocalExercise[] = [];
    template.exercises.forEach((tmpl, idx) => {
      const result = lookups[idx]?.data ?? [];
      const match = result.find((e) => !seen.has(e.id));
      if (match) {
        seen.add(match.id);
        next.push({
          localId: `${match.id}-${idx}`,
          exercise: match,
          targetSets: tmpl.targetSets,
          targetReps: tmpl.targetReps,
        });
      }
    });
    setItems(next);
    setResolved(true);
  }, [template, lookups, resolved]);

  const start = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error('Sem exercícios');
      const planName = (nameOverride || template?.title || 'Treino rápido').trim();
      const plan = await workoutApi.createPlan({ name: planName });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await workoutApi.addPlanExercise(plan.id, {
          exerciseId: it.exercise.id,
          order: i + 1,
          targetSets: it.targetSets,
          targetReps: it.targetReps,
        });
      }
      return workoutApi.startSession({
        planId: plan.id,
        startedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.push('/workout');
    },
  });

  if (!template) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Template não encontrado.</p>
        <Link href="/workout" className="mt-2 inline-block text-sm text-primary">
          Voltar
        </Link>
      </div>
    );
  }

  const totalSets = items.reduce((acc, i) => acc + i.targetSets, 0);
  const estDuration = Math.max(15, totalSets * 5);
  const estVolume = (totalSets * 1.5).toFixed(1);
  const existingIds = new Set(items.map((i) => i.exercise.id));
  const planName = nameOverride || template.title;

  function updateItem(localId: string, patch: Partial<LocalExercise>) {
    setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));
  }

  function removeItem(localId: string) {
    setItems((prev) => prev.filter((i) => i.localId !== localId));
  }

  function moveItem(idx: number, delta: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleAdd(exercise: Exercise) {
    setItems((prev) => [
      ...prev,
      {
        localId: `${exercise.id}-${Date.now()}`,
        exercise,
        targetSets: 3,
        targetReps: '8-12',
      },
    ]);
  }

  const loading = !resolved;

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
          <Input
            autoFocus
            value={nameOverride || template.title}
            onChange={(e) => setNameOverride(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false);
            }}
            className="mx-2 h-8 text-base font-bold"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="flex-1 truncate px-2 text-center text-base font-bold text-foreground hover:underline"
          >
            {planName}
          </button>
        )}
        <div className="w-9" />
      </header>

      <div className="space-y-4 px-5 pt-2">
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card">
          <div className="relative h-44 w-full overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${template.gradient}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute left-4 right-4 top-4 flex gap-2">
              <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                TREINO RÁPIDO
              </span>
              <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-sm">
                {template.level.toUpperCase()}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h2 className="text-2xl font-extrabold text-white">{planName}</h2>
              <p className="mt-1 text-xs text-white/70">
                {template.duration} • {template.location}
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

        <h3 className="text-base font-extrabold text-foreground">
          Exercícios{' '}
          <span className="text-sm font-bold text-muted-foreground">({items.length})</span>
        </h3>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum exercício encontrado para esse template. Adicione manualmente.
          </div>
        )}

        <div className="space-y-3">
          {items.map((it, idx) => (
            <ExerciseDetailCard
              key={it.localId}
              mode="plan"
              item={{
                id: it.localId,
                exercise: it.exercise,
                targetSets: it.targetSets,
                targetReps: it.targetReps,
              }}
              isFirst={idx === 0}
              isLast={idx === items.length - 1}
              onChangeSets={(n) => updateItem(it.localId, { targetSets: n })}
              onChangeReps={(v) => updateItem(it.localId, { targetReps: v })}
              onRemove={() => removeItem(it.localId)}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
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

        <Button
          className="h-14 w-full rounded-full text-base font-extrabold shadow-[0_0_24px_hsl(var(--primary)/0.45)]"
          onClick={() => start.mutate()}
          disabled={start.isPending || items.length === 0}
        >
          <Play size={16} fill="currentColor" className="mr-1.5" />
          {start.isPending ? 'Iniciando...' : 'Iniciar Treino'}
        </Button>
      </div>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        existingExerciseIds={existingIds}
        onAdd={handleAdd}
      />
    </div>
  );
}
