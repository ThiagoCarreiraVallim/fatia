'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { History, Dumbbell, Plus } from 'lucide-react';
import { workoutApi, type WorkoutSession, type SessionSet } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import { ExerciseCard } from '@/components/workout/exercise-card';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { FinishSessionModal } from '@/components/workout/finish-session-modal';

function groupByExercise(sets: SessionSet[]) {
  const map = new Map<
    number,
    { exerciseId: number; exerciseName: string; isCardio: boolean; sets: SessionSet[] }
  >();
  for (const s of sets) {
    if (!map.has(s.exerciseId)) {
      map.set(s.exerciseId, {
        exerciseId: s.exerciseId,
        exerciseName: s.exercise.name,
        isCardio: s.exercise.muscleGroup === 'CARDIO',
        sets: [],
      });
    }
    map.get(s.exerciseId)!.sets.push(s);
  }
  return Array.from(map.values());
}

function ActiveSession({ session }: { session: WorkoutSession }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const groups = groupByExercise(session.sets ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Treino em andamento</h1>
          <p className="text-xs text-muted-foreground">
            Iniciado às{' '}
            {new Date(session.startedAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setFinishOpen(true)}>
          Finalizar
        </Button>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum exercício registrado ainda.</p>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <ExerciseCard
            key={g.exerciseId}
            exerciseId={g.exerciseId}
            exerciseName={g.exerciseName}
            isCardio={g.isCardio}
            sets={g.sets}
            sessionId={session.id}
            active
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
      >
        <Plus size={16} />
        Adicionar exercício
      </button>

      <ExerciseSearchDrawer open={searchOpen} onOpenChange={setSearchOpen} sessionId={session.id} />

      <FinishSessionModal open={finishOpen} onOpenChange={setFinishOpen} session={session} />
    </div>
  );
}

function NoSession() {
  const qc = useQueryClient();
  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const [selectedPlanId, setSelectedPlanId] = useState('');

  const start = useMutation({
    mutationFn: () =>
      workoutApi.startSession({
        planId: selectedPlanId || undefined,
        startedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Treino</h1>
        <div className="flex gap-2">
          <Link
            href="/workout/history"
            className="rounded p-2 text-muted-foreground hover:text-foreground"
            aria-label="Histórico"
          >
            <History size={18} />
          </Link>
          <Link
            href="/workout/plans"
            className="rounded p-2 text-muted-foreground hover:text-foreground"
            aria-label="Planos"
          >
            <Dumbbell size={18} />
          </Link>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Pronto para treinar?</p>

        {plans.data && plans.data.length > 0 && (
          <select
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Treino livre (sem plano)</option>
            {plans.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <Button className="w-full" onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? 'Iniciando...' : 'Iniciar treino'}
        </Button>
      </div>
    </div>
  );
}

export default function WorkoutPage() {
  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
  });

  if (active.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="p-4">
      {active.data ? <ActiveSession session={active.data} /> : <NoSession />}
    </div>
  );
}
