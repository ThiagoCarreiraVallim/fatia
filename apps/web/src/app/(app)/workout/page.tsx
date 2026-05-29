'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, History, ListChecks, ChevronRight, Dumbbell } from 'lucide-react';
import { workoutApi, type WorkoutSession } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { FinishSessionModal } from '@/components/workout/finish-session-modal';
import { buildExerciseGroups } from '@/lib/workout-session-view';
import { CancelSessionModal } from '@/components/workout/cancel-session-modal';
import { ActiveExerciseCard } from '@/components/workout/active-exercise-card';
import { ActiveCardioCard } from '@/components/workout/active-cardio-card';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { QUICK_TEMPLATES } from '@/lib/workout/quick-templates';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';

function ActiveSession({ session }: { session: WorkoutSession }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<Set<number>>(new Set());
  const groups = buildExerciseGroups(session.plannedExercises, session.sets);

  const focused = groups.find((g) => {
    if (skippedExerciseIds.has(g.exerciseId)) return false;
    if (g.isCardio) return g.sets.length === 0;
    const target = g.targetSets ?? 0;
    return target === 0 || g.sets.length < target;
  });

  const others = groups.filter((g) => g.exerciseId !== focused?.exerciseId);

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

      {focused && !focused.isCardio && (
        <ActiveExerciseCard
          sessionId={session.id}
          group={focused}
          onFinishExercise={() =>
            setSkippedExerciseIds((prev) => new Set(prev).add(focused.exerciseId))
          }
        />
      )}

      {focused && focused.isCardio && (
        <ActiveCardioCard
          sessionId={session.id}
          group={focused}
          onFinishExercise={() =>
            setSkippedExerciseIds((prev) => new Set(prev).add(focused.exerciseId))
          }
        />
      )}

      {others.length > 0 && (
        <div className="space-y-3">
          {others.map((g) => {
            const muscle = g.sets[0]?.exercise?.muscleGroup ?? 'outros';
            return (
              <ExerciseDetailCard
                key={g.exerciseId}
                mode="readonly"
                isCardio={g.isCardio}
                sessionId={session.id}
                item={{
                  id: String(g.exerciseId),
                  exercise: {
                    id: g.exerciseId,
                    name: g.exerciseName,
                    muscleGroup: muscle,
                    source: 'SEED',
                    createdByUserId: null,
                  },
                  targetSets: g.targetSets ?? g.sets.length,
                  targetReps: g.targetReps ?? '—',
                }}
                loggedSets={g.sets}
              />
            );
          })}
        </div>
      )}

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

function NoSession() {
  const qc = useQueryClient();

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

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-foreground">Treinos</h1>
        <Link
          href="/workout/history"
          aria-label="Histórico"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <History size={16} />
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
          <Link href="/workout/plans" className="rounded-2xl border border-white/5 bg-card p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <ListChecks size={16} className="text-foreground" />
            </div>
            <p className="mt-3 text-sm font-bold leading-tight text-foreground">
              Meus planos de
              <br />
              treino
            </p>
          </Link>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
            TREINOS RÁPIDOS
          </p>
        </div>

        <Carousel opts={{ align: 'start', dragFree: true }} className="mt-2">
          <CarouselContent>
            {QUICK_TEMPLATES.map((q) => (
              <CarouselItem key={q.id} className="basis-[72%] sm:basis-1/2">
                <Link
                  href={`/workout/quick/${q.id}`}
                  className={`relative block h-44 w-full overflow-hidden rounded-2xl bg-gradient-to-br ${q.gradient}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={q.image}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover opacity-80"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
                    <p className="text-[10px] font-bold text-white/70">{q.level}</p>
                    <h3 className="mt-1 text-base font-extrabold leading-tight text-white">
                      {q.title}
                    </h3>
                    <p className="mt-1 text-[11px] text-white/70">
                      {q.duration} • {q.location}
                    </p>
                  </div>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </section>

      <Button
        className="h-14 w-full rounded-2xl text-base font-extrabold tracking-wide shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
        onClick={() => start.mutate()}
        disabled={start.isPending}
      >
        {start.isPending ? 'INICIANDO...' : 'INICIAR TREINO LIVRE'}
      </Button>

      <section>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
            MEUS PLANOS
          </p>
          <Link href="/workout/plans" className="text-[11px] font-extrabold text-primary">
            Ver tudo
          </Link>
        </div>

        {plans.isLoading && (
          <div className="mt-3 space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {plans.data && plans.data.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum plano criado ainda.{' '}
            <Link href="/workout/plans" className="font-bold text-primary underline">
              Criar agora
            </Link>
          </p>
        )}

        <div className="mt-3 space-y-2">
          {plans.data?.map((plan) => (
            <Link
              key={plan.id}
              href={`/workout/plans/${plan.id}`}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card p-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Dumbbell size={20} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-base font-bold text-foreground">{plan.name}</p>
                <p className="text-xs text-muted-foreground">
                  {plan.exercises?.length ?? 0} exercício
                  {(plan.exercises?.length ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function WorkoutPage() {
  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
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
