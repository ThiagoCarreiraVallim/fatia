'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, History, ListChecks, ChevronRight, Dumbbell } from 'lucide-react';
import {
  buildExerciseGroups,
  moveExerciseInOrder,
  orderExerciseGroups,
  pickFocusedGroup,
  QUICK_TEMPLATES,
  workoutApi,
  type ExerciseGroup,
  type PendingExercise,
  type WorkoutSession,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { FinishSessionModal } from '@/components/workout/finish-session-modal';
import { CancelSessionModal } from '@/components/workout/cancel-session-modal';
import { ActiveExerciseCard } from '@/components/workout/active-exercise-card';
import { ActiveCardioCard } from '@/components/workout/active-cardio-card';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { ExerciseActions } from '@/components/workout/exercise-actions';
import { RemoveExerciseModal } from '@/components/workout/remove-exercise-modal';
import { useSessionLayout } from '@/components/workout/use-session-layout';
import { useWakeLock } from '@/components/workout/use-wake-lock';
import { BlockTimeline } from '@/components/workout/block-timeline';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Skeleton } from '@/components/ui/skeleton';
import { TopBarActions, topBarActionClass, useTopBarTitle } from '@/components/layout/app-top-bar';

/**
 * Sessão em andamento — no PWA ela vive aqui, porque não existe rota de sessão.
 *
 * Um exercício por vez fica em foco (o primeiro incompleto que não foi pulado) e
 * os demais aparecem abaixo em modo leitura. O foco segue a ordem, mas a
 * academia não: o aparelho do próximo está ocupado e a pessoa pula para outro.
 * Cada card abaixo tem "Fazer agora", que o traz para o foco, e setas e lixeira
 * para arrumar a ordem ou tirar o exercício — só desta sessão
 * (`use-session-layout.ts`). Mesmo recorte do `active-session.tsx` do app.
 */
function ActiveSession({ session }: { session: WorkoutSession }) {
  // A tela apagando no meio da série obriga a desbloquear o celular com a mão
  // que está segurando a barra.
  useWakeLock();
  const layout = useSessionLayout(session);
  const topRef = useRef<HTMLDivElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ExerciseGroup | null>(null);
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<Set<number>>(new Set());
  // Escolhidos na busca e ainda sem série: vivem só na tela (ver `buildExerciseGroups`).
  const [pending, setPending] = useState<PendingExercise[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const groups = orderExerciseGroups(
    buildExerciseGroups(session.plannedExercises, session.sets, pending),
    session.exerciseOrder,
  );
  const focused = pickFocusedGroup(groups, skippedExerciseIds, pickedId);

  const others = groups.filter((g) => g.exerciseId !== focused?.exerciseId);
  useTopBarTitle('Treino em andamento');

  function skipExercise(exerciseId: number) {
    setSkippedExerciseIds((prev) => new Set(prev).add(exerciseId));
  }

  /** Traz o exercício para o foco — inclusive um que a pessoa tinha pulado. */
  function doNow(exerciseId: number) {
    setSkippedExerciseIds((prev) => {
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
    setPickedId(exerciseId);
    // O card em foco fica no topo; quem clicou estava lá embaixo na lista.
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Move entre os cards de baixo, e o que está em foco fica onde estava na
   * ordem: senão, mexer em dois exercícios lá embaixo mudaria qual vem depois
   * do atual.
   */
  function move(exerciseId: number, direction: 'up' | 'down') {
    const ids = moveExerciseInOrder(others, exerciseId, direction);
    if (focused) {
      const index = groups.findIndex((g) => g.exerciseId === focused.exerciseId);
      ids.splice(index, 0, focused.exerciseId);
    }
    layout.reorder.mutate(ids);
  }

  function removeExercise(group: ExerciseGroup) {
    setRemoveTarget(null);
    setPending((prev) => prev.filter((p) => p.id !== group.exerciseId));
    if (pickedId === group.exerciseId) setPickedId(null);
    // Escolhido na busca e ainda sem série: só existia na tela.
    if (!group.isPlanned && group.sets.length === 0) return;
    layout.remove.mutate(group);
  }

  /** Sem série registrada não há o que perder: tira direto, sem perguntar. */
  function requestRemove(group: ExerciseGroup) {
    if (group.sets.length === 0) removeExercise(group);
    else setRemoveTarget(group);
  }

  return (
    <div ref={topRef} className="scroll-mt-20 space-y-4 px-5 pt-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
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
        // `key` por exercício: sem ela o React reaproveita a instância ao trocar
        // o foco, e a carga digitada no exercício anterior continuaria no campo
        // do próximo — junto com o `touched`, que impediria o palpite da sessão
        // anterior de rodar em todos os exercícios seguintes.
        <ActiveExerciseCard
          key={focused.exerciseId}
          sessionId={session.id}
          sessionStartedAt={session.startedAt}
          group={focused}
          onFinishExercise={() => skipExercise(focused.exerciseId)}
        />
      )}

      {focused && focused.isCardio && (
        <ActiveCardioCard
          key={focused.exerciseId}
          sessionId={session.id}
          group={focused}
          onFinishExercise={() => skipExercise(focused.exerciseId)}
        />
      )}

      {focused && (
        <div className="-mt-2 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => requestRemove(focused)}
          >
            Tirar este exercício do treino
          </Button>
        </div>
      )}

      {!focused && groups.length > 0 && (
        <div className="rounded-2xl border border-subtle bg-card p-4">
          <p className="text-sm font-bold text-foreground">Tudo feito por aqui.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Finalize o treino no topo, ou adicione outro exercício abaixo.
          </p>
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-3">
          <p className="mt-2 text-[11px] font-extrabold tracking-wide text-muted-foreground">
            {focused ? 'PRÓXIMOS' : 'EXERCÍCIOS DO TREINO'}
          </p>
          {others.map((g, index) => {
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
                    primaryMuscles: [],
                    secondaryMuscles: [],
                    equipment: null,
                    level: null,
                    mechanic: null,
                    instructions: [],
                    youtubeVideoId: null,
                    youtubeVideoIdPt: null,
                  },
                  targetSets: g.targetSets ?? g.sets.length,
                  targetReps: g.targetReps ?? '—',
                }}
                loggedSets={g.sets}
                footer={
                  <ExerciseActions
                    group={g}
                    isFirst={index === 0}
                    isLast={index === others.length - 1}
                    disabled={layout.reorder.isPending}
                    onDoNow={() => doNow(g.exerciseId)}
                    onMove={(direction) => move(g.exerciseId, direction)}
                    onRemove={() => requestRemove(g)}
                  />
                }
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

      <ExerciseSearchDrawer
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onPick={(exercise) => {
          setPending((prev) => [...prev, exercise]);
          setPickedId(exercise.id);
        }}
      />
      <FinishSessionModal open={finishOpen} onOpenChange={setFinishOpen} session={session} />
      <CancelSessionModal open={cancelOpen} onOpenChange={setCancelOpen} session={session} />
      <RemoveExerciseModal
        group={removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        onConfirm={removeExercise}
      />
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
      <TopBarActions>
        <Link href="/workout/history" aria-label="Histórico" className={topBarActionClass}>
          <History size={20} />
        </Link>
      </TopBarActions>

      {/* Os planos da pessoa vêm primeiro, que é o que ela abre a tela para
          achar; a periodização — consultada uma vez por bloco, não a cada
          treino — desce para o fim. Mesma ordem do app. */}
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
              <Skeleton key={i} className="h-16 rounded-2xl bg-muted" />
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
              className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-3"
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

      <section>
        <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
          PERSONALIZAÇÃO
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Link href="/workout/plans" className="rounded-2xl border border-subtle bg-card p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Plus size={16} className="text-foreground" />
            </div>
            <p className="mt-3 text-sm font-bold leading-tight text-foreground">
              Criar um treino
              <br />
              personalizado
            </p>
          </Link>
          <Link href="/workout/plans" className="rounded-2xl border border-subtle bg-card p-4">
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

      <section>
        <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
          PERIODIZAÇÃO
        </p>
        <div className="mt-2">
          <BlockTimeline />
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
        <Skeleton className="h-6 w-40 rounded bg-muted" />
        <Skeleton className="h-24 rounded-lg bg-muted" />
      </div>
    );
  }

  return active.data ? <ActiveSession session={active.data} /> : <NoSession />;
}
