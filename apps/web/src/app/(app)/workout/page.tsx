'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Star, Search, Clock, ListChecks, ChevronDown } from 'lucide-react';
import { workoutApi, type WorkoutSession } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import { ExerciseCard } from '@/components/workout/exercise-card';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { FinishSessionModal } from '@/components/workout/finish-session-modal';
import { buildExerciseGroups } from '@/lib/workout-session-view';
import { CancelSessionModal } from '@/components/workout/cancel-session-modal';

interface QuickWorkout {
  id: string;
  title: string;
  level: string;
  duration: string;
  location: string;
  gradient: string;
}

const QUICK_WORKOUTS: QuickWorkout[] = [
  {
    id: 'peito-triceps',
    title: 'Construtor de Peito e Tríceps em Casa',
    level: 'Intermediário',
    duration: '50 min',
    location: 'Academia Pequena',
    gradient: 'from-rose-900/70 via-stone-800/80 to-stone-900',
  },
  {
    id: 'costas-biceps',
    title: 'Costas e Bíceps Avançado',
    level: 'Avançado',
    duration: '65 min',
    location: 'Academia Completa',
    gradient: 'from-slate-800/70 via-stone-800/80 to-stone-900',
  },
];

interface MuscleEntry {
  key: string;
  label: string;
  count: number;
  icon: 'power' | 'dollar';
  glow: 'green' | 'amber';
}

const MUSCLES: MuscleEntry[] = [
  { key: 'peito', label: 'Peito', count: 36, icon: 'power', glow: 'green' },
  { key: 'costas', label: 'Costas', count: 38, icon: 'dollar', glow: 'amber' },
  { key: 'pernas', label: 'Pernas', count: 42, icon: 'power', glow: 'green' },
  { key: 'ombro', label: 'Ombro', count: 24, icon: 'power', glow: 'green' },
  { key: 'braço', label: 'Braço', count: 28, icon: 'dollar', glow: 'amber' },
  { key: 'core', label: 'Core', count: 20, icon: 'power', glow: 'green' },
];

function ActiveSession({ session }: { session: WorkoutSession }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const groups = buildExerciseGroups(session.plannedExercises, session.sets);

  return (
    <div className="space-y-4 px-5 pt-4 pb-4">
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
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
            Cancelar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFinishOpen(true)}>
            Finalizar
          </Button>
        </div>
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
            targetSets={g.targetSets}
            targetReps={g.targetReps}
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
      <CancelSessionModal open={cancelOpen} onOpenChange={setCancelOpen} session={session} />
    </div>
  );
}

function MuscleIcon({ entry }: { entry: MuscleEntry }) {
  const glow =
    entry.glow === 'green'
      ? 'text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.7)]'
      : 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]';
  return (
    <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-muted">
      <div className="absolute inset-0 bg-gradient-to-br from-card to-muted/80" />
      <span className={`relative text-xl font-extrabold ${glow}`}>
        {entry.icon === 'power' ? '⏻' : '$'}
      </span>
    </div>
  );
}

function NoSession() {
  const qc = useQueryClient();
  const [muscleFilter, setMuscleFilter] = useState<'POR MÚSCULO' | 'EQUIPAMENTOS' | 'FAVORITOS'>(
    'POR MÚSCULO',
  );

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const start = useMutation({
    mutationFn: () =>
      workoutApi.startSession({
        startedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });

  const currentPlan = useMemo(() => plans.data?.[0], [plans.data]);

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-foreground">Treinos</h1>
        <Link
          href="/workout/history"
          aria-label="Favoritos"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Star size={16} />
        </Link>
      </header>

      <section>
        <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
          PERSONALIZAÇÃO
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Link href="/workout/plans" className="rounded-2xl border border-white/5 bg-card p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Plus size={16} className="text-foreground" />
            </div>
            <p className="mt-3 text-sm font-bold leading-tight text-foreground">
              Criar um treino
              <br />
              personalizado
            </p>
          </Link>
          <Link
            href={currentPlan ? `/workout/plans/${currentPlan.id}` : '/workout/plans'}
            className="rounded-2xl border border-white/5 bg-card p-4"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <ListChecks size={16} className="text-foreground" />
            </div>
            <p className="mt-3 text-sm font-bold leading-tight text-foreground">
              Meu plano de
              <br />
              treino atual
            </p>
          </Link>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
            TREINOS RÁPIDOS PARA{' '}
            <span className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2">
              INTERMEDIÁRIO
              <ChevronDown size={10} />
            </span>
          </p>
          <Link href="/workout/plans" className="text-[11px] font-extrabold text-primary">
            Ver tudo
          </Link>
        </div>

        <div className="-mx-5 mt-2 overflow-x-auto px-5">
          <div className="flex gap-3">
            {QUICK_WORKOUTS.map((q) => (
              <div
                key={q.id}
                className={`relative h-44 w-72 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br ${q.gradient}`}
              >
                <button
                  type="button"
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-foreground backdrop-blur-sm"
                  aria-label="Favoritar"
                >
                  <Star size={14} />
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <p className="text-[10px] font-bold text-white/70">{q.level}</p>
                  <h3 className="mt-1 text-base font-extrabold leading-tight text-white">
                    {q.title}
                  </h3>
                  <p className="mt-1 text-[11px] text-white/70">
                    {q.duration} • {q.location}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Button
        className="h-14 w-full rounded-2xl text-base font-extrabold tracking-wide shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
        onClick={() => start.mutate()}
        disabled={start.isPending}
      >
        {start.isPending ? 'INICIANDO...' : 'INICIAR TREINO'}
      </Button>

      <section>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
            EXERCÍCIOS POR MÚSCULO
          </p>
          <button type="button" aria-label="Buscar" className="text-muted-foreground">
            <Search size={14} />
          </button>
        </div>

        <div className="-mx-5 mt-3 overflow-x-auto px-5">
          <div className="flex gap-2">
            {(['POR MÚSCULO', 'EQUIPAMENTOS', 'FAVORITOS'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMuscleFilter(tab)}
                className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-extrabold tracking-wide transition-colors ${
                  muscleFilter === tab ? 'bg-blue-500 text-white' : 'bg-muted text-foreground'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {MUSCLES.map((m) => (
            <Link
              key={m.key}
              href={`/workout/plans?muscle=${m.key}`}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card p-3"
            >
              <MuscleIcon entry={m} />
              <div className="flex-1">
                <p className="text-base font-bold text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.count} exercícios</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Link
          href="/workout/history"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Clock size={14} />
          Histórico
        </Link>
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

  return active.data ? <ActiveSession session={active.data} /> : <NoSession />;
}
