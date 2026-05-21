'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  MoreVertical,
  Play,
  ArrowUpDown,
  Clock,
  Dumbbell,
  Lightbulb,
  History,
} from 'lucide-react';
import { workoutApi, type WorkoutPlanExercise } from '@/lib/api/workout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function ExerciseDetailCard({
  item,
  setsLog,
  onChangeLog,
}: {
  item: WorkoutPlanExercise;
  setsLog: Record<string, { reps: string; weight: string }>;
  onChangeLog: (id: string, field: 'reps' | 'weight', value: string) => void;
}) {
  const setsToShow = Math.min(item.targetSets, 2);

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex gap-3">
        <div className="relative flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          <div className="absolute inset-0 bg-gradient-to-br from-black/50 to-transparent" />
          <Play size={20} fill="white" className="relative text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-extrabold leading-tight text-foreground">
            {item.exercise.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.exercise.muscleGroup === 'costas' ? 'Costas • Dorsal' : item.exercise.muscleGroup}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
              {item.targetSets} Séries
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
              {item.targetReps} Reps
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-[40px_1fr_1fr_28px] gap-2 text-[10px] font-bold tracking-wide text-muted-foreground">
          <div>Série</div>
          <div>Reps</div>
          <div>Carga (kg)</div>
          <div />
        </div>
        {Array.from({ length: setsToShow }).map((_, idx) => {
          const setKey = `${item.id}-${idx}`;
          const log = setsLog[setKey] ?? { reps: '', weight: '' };
          return (
            <div key={setKey} className="grid grid-cols-[40px_1fr_1fr_28px] items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                {idx + 1}
              </div>
              <Input
                inputMode="numeric"
                placeholder="—"
                value={log.reps}
                onChange={(e) => onChangeLog(setKey, 'reps', e.target.value)}
                className="h-9 bg-background text-center text-sm"
              />
              <Input
                inputMode="decimal"
                placeholder="—"
                value={log.weight}
                onChange={(e) => onChangeLog(setKey, 'weight', e.target.value)}
                className="h-9 bg-background text-center text-sm"
              />
              <button type="button" aria-label="Histórico" className="text-muted-foreground">
                <History size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [setsLog, setSetsLog] = useState<Record<string, { reps: string; weight: string }>>({});

  const plan = useQuery({
    queryKey: ['workout', 'plan', id],
    queryFn: () => workoutApi.getPlan(id),
  });

  const start = useMutation({
    mutationFn: () =>
      workoutApi.startSession({
        planId: id,
        startedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });

  function updateLog(key: string, field: 'reps' | 'weight', value: string) {
    setSetsLog((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { reps: '', weight: '' }), [field]: value },
    }));
  }

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
  // mock volume / duração baseados no plano
  const totalSets = exercises.reduce((acc, e) => acc + e.targetSets, 0);
  const estDuration = Math.max(15, totalSets * 5);
  const estVolume = (totalSets * 1.5).toFixed(1);

  return (
    <div className="pb-4">
      {/* Header fixo (back + title) */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-background/90 px-4 backdrop-blur">
        <Link
          href="/workout"
          aria-label="Voltar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-base font-bold text-foreground">{plan.data.name}</h1>
        <Link
          href={`/workout/plans/${id}/edit`}
          aria-label="Mais opções"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
        >
          <MoreVertical size={18} />
        </Link>
      </header>

      <div className="space-y-4 px-5 pt-2">
        {/* Header visual */}
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card">
          <div className="relative h-44 w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-stone-800 to-stone-900" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute left-4 right-4 top-4 flex gap-2">
              <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                HIPERTROFIA
              </span>
              <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-sm">
                AVANÇADO
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h2 className="text-2xl font-extrabold text-white">{plan.data.name}</h2>
              <p className="mt-1 text-xs text-white/70">
                Foco em expansão dorsal e pico de contração.
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

        {/* Exercícios */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-foreground">
            Exercícios{' '}
            <span className="text-sm font-bold text-muted-foreground">({exercises.length})</span>
          </h3>
          <Link
            href={`/workout/plans/${id}/edit`}
            className="inline-flex items-center gap-1 text-xs font-extrabold text-primary"
          >
            <ArrowUpDown size={12} />
            Reordenar
          </Link>
        </div>

        {exercises.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-card p-6 text-center text-sm text-muted-foreground">
            Sem exercícios no plano ainda.{' '}
            <Link href={`/workout/plans/${id}/edit`} className="font-bold text-primary underline">
              Adicionar
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {exercises.map((ex) => (
            <ExerciseDetailCard key={ex.id} item={ex} setsLog={setsLog} onChangeLog={updateLog} />
          ))}
        </div>

        {/* Tip / Foco */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-primary" />
            <h4 className="text-sm font-extrabold text-foreground">Foco na Excêntrica</h4>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Mantenha o controle da descida (fase excêntrica) por 3 segundos em todos os exercícios
            de costas para maximizar a hipertrofia.
          </p>
        </div>

        <Button
          className="h-14 w-full rounded-full text-base font-extrabold shadow-[0_0_24px_hsl(var(--primary)/0.45)]"
          onClick={() => start.mutate()}
          disabled={start.isPending}
        >
          <Play size={16} fill="currentColor" className="mr-1.5" />
          {start.isPending ? 'Iniciando...' : 'Iniciar Treino'}
        </Button>
      </div>
    </div>
  );
}
