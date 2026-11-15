'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ListChecks, Plus } from 'lucide-react';
import {
  buildExerciseGroups,
  moveExerciseInOrder,
  orderExerciseGroups,
  pickFocusedGroup,
  workoutApi,
  type ExerciseGroup,
  type MuscleGroup,
  type PendingExercise,
  type SessionSet,
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
import { RpeModal } from '@/components/workout/rpe-modal';
import { SessionHeader } from '@/components/workout/session-header';
import { groupCardItem } from '@/components/workout/group-card-item';
import { isExerciseComplete, sessionProgress } from '@/components/workout/format';
import { CurrentWorkoutSheet } from '@/components/workout/current-workout-sheet';
import { ExerciseMedia } from '@/components/workout/exercise-media';
import { useAutoAdvance } from '@/components/workout/use-auto-advance';
import { Switch } from '@/components/ui/switch';
import { useSessionRestTimer } from '@/components/workout/rest-timer-provider';
import { useSessionLayout } from '@/components/workout/use-session-layout';
import { useWakeLock } from '@/components/workout/use-wake-lock';
import { WorkoutHome } from '@/components/workout/workout-home';
import { Skeleton } from '@/components/ui/skeleton';
import { useTopBarTitle } from '@/components/layout/app-top-bar';

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
function ActiveSession({
  session,
  initialSearchGroup = null,
}: {
  session: WorkoutSession;
  initialSearchGroup?: MuscleGroup | null;
}) {
  // A tela apagando no meio da série obriga a desbloquear o celular com a mão
  // que está segurando a barra.
  useWakeLock();
  const layout = useSessionLayout(session);
  // O descanso mora acima das telas (`RestTimerProvider`), e não no card: o
  // card desmonta quando o foco passa para o próximo exercício, e a barra do
  // treino em andamento mostra a contagem e o "+30 s" fora daqui.
  const rest = useSessionRestTimer();
  const topRef = useRef<HTMLDivElement>(null);

  const [searchOpen, setSearchOpen] = useState(initialSearchGroup != null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ExerciseGroup | null>(null);
  const [rpeTarget, setRpeTarget] = useState<SessionSet | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<Set<number>>(new Set());
  // Escolhidos na busca e ainda sem série: vivem só na tela (ver `buildExerciseGroups`).
  const [pending, setPending] = useState<PendingExercise[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [currentOpen, setCurrentOpen] = useState(false);
  // Desligado o "passar sozinho", o fim de um exercício mostra a lista do que
  // falta (prancha Al-T3, estado "escolhendo") em vez de abrir o próximo.
  const [autoAdvance, setAutoAdvance] = useAutoAdvance();
  const [picking, setPicking] = useState(false);
  const groups = orderExerciseGroups(
    buildExerciseGroups(session.plannedExercises, session.sets, pending),
    session.exerciseOrder,
  );
  const focused = pickFocusedGroup(groups, skippedExerciseIds, pickedId);

  const others = groups.filter((g) => g.exerciseId !== focused?.exerciseId);
  useTopBarTitle('Treino em andamento');

  function skipExercise(exerciseId: number) {
    setSkippedExerciseIds((prev) => new Set(prev).add(exerciseId));
    if (pickedId === exerciseId) setPickedId(null);
    if (!autoAdvance) setPicking(true);
  }

  // "Exercício X de N": as setas andam até o vizinho ainda por fazer.
  const focusedIndex = focused ? groups.findIndex((g) => g.exerciseId === focused.exerciseId) : -1;
  const previousOpen =
    focusedIndex > 0
      ? groups
          .slice(0, focusedIndex)
          .reverse()
          .find((g) => !isExerciseComplete(g))
      : undefined;
  const nextOpen =
    focusedIndex >= 0
      ? groups.slice(focusedIndex + 1).find((g) => !isExerciseComplete(g))
      : undefined;
  const remaining = groups.filter((g) => !isExerciseComplete(g));

  /** Traz o exercício para o foco — inclusive um que a pessoa tinha pulado. */
  function doNow(exerciseId: number) {
    setSkippedExerciseIds((prev) => {
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
    setPickedId(exerciseId);
    setPicking(false);
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
      <SessionHeader
        startedAt={session.startedAt}
        progress={sessionProgress(groups)}
        onCancel={() => setCancelOpen(true)}
        onFinish={() => setFinishOpen(true)}
      />

      {/* Montada sempre, e não junto com o texto: um `aria-live` que nasce já
          preenchido costuma não ser anunciado. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum exercício registrado ainda. Adicione o primeiro abaixo.
        </p>
      )}

      {picking && (
        <section
          aria-labelledby="sessao-escolhendo"
          className="space-y-3 rounded-3xl border border-subtle bg-card p-4"
        >
          <h2 id="sessao-escolhendo" className="text-lg font-extrabold text-foreground">
            Qual o próximo?
          </h2>
          {remaining.length === 0 && (
            <p className="text-sm text-muted-foreground">Tudo feito por aqui.</p>
          )}
          <ul className="space-y-2">
            {remaining.map((g) => (
              <li key={g.exerciseId}>
                <button
                  type="button"
                  aria-label={`Fazer ${g.exerciseName}`}
                  onClick={() => doNow(g.exerciseId)}
                  className="anim-press flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl bg-muted px-4 text-left"
                >
                  <span className="min-w-0 truncate text-sm font-bold text-foreground">
                    {g.exerciseName}
                  </span>
                  <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {skippedExerciseIds.has(g.exerciseId)
                      ? 'Pulado'
                      : g.isPlanned
                        ? `${g.sets.length} de ${g.targetSets ?? 0}`
                        : 'Extra'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="anim-press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-subtle text-sm font-bold text-muted-foreground"
          >
            <Plus size={16} aria-hidden />
            Adicionar exercício
          </button>
          <button
            type="button"
            onClick={() => setFinishOpen(true)}
            className="anim-press h-12 w-full rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
          >
            Finalizar treino
          </button>
          <label className="flex min-h-11 items-center justify-between gap-3 text-[13px] text-foreground">
            <span>Passar sozinho para o próximo exercício</span>
            <Switch
              checked={autoAdvance}
              onCheckedChange={setAutoAdvance}
              label="Passar sozinho para o próximo exercício"
            />
          </label>
        </section>
      )}

      {!picking && focused && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Exercício anterior"
            disabled={!previousOpen}
            onClick={() => previousOpen && doNow(previousOpen.exerciseId)}
            className="anim-press flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <p className="text-[13px] font-bold text-muted-foreground tabular-nums">
            Exercício {focusedIndex + 1} de {groups.length}
          </p>
          <button
            type="button"
            aria-label="Próximo exercício"
            disabled={!nextOpen}
            onClick={() => nextOpen && doNow(nextOpen.exerciseId)}
            className="anim-press flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      )}

      {!picking && focused && (
        <ExerciseMedia
          key={`media-${focused.exerciseId}`}
          exerciseId={focused.exerciseId}
          exerciseName={focused.exerciseName}
        />
      )}

      {!picking && focused && !focused.isCardio && (
        // `key` por exercício: sem ela o React reaproveita a instância ao trocar
        // o foco, e a carga digitada no exercício anterior continuaria no campo
        // do próximo — junto com o `touched`, que impediria o palpite da sessão
        // anterior de rodar em todos os exercícios seguintes.
        <ActiveExerciseCard
          key={focused.exerciseId}
          sessionId={session.id}
          sessionStartedAt={session.startedAt}
          group={focused}
          rest={rest}
          onFinishExercise={() => skipExercise(focused.exerciseId)}
          onExerciseComplete={() => {
            if (!autoAdvance) setPicking(true);
          }}
          onAskRpe={setRpeTarget}
          onAnnounce={setAnnouncement}
        />
      )}

      {!picking && focused && focused.isCardio && (
        <ActiveCardioCard
          key={focused.exerciseId}
          sessionId={session.id}
          group={focused}
          onFinishExercise={() => skipExercise(focused.exerciseId)}
        />
      )}

      {!picking && focused && (
        <div className="-mt-2 flex justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setCurrentOpen(true)}
          >
            <ListChecks size={16} aria-hidden />
            Treino atual
          </Button>
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

      {!picking && !focused && groups.length > 0 && (
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
          {others.map((g, index) => (
            <ExerciseDetailCard
              key={g.exerciseId}
              mode="readonly"
              isCardio={g.isCardio}
              sessionId={session.id}
              item={groupCardItem(g)}
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
          ))}
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
        muscleGroup={initialSearchGroup ?? undefined}
        onPick={(exercise) => {
          setPending((prev) => [...prev, exercise]);
          setPickedId(exercise.id);
          setPicking(false);
        }}
      />
      <RpeModal
        open={rpeTarget != null}
        onOpenChange={(open) => {
          if (!open) setRpeTarget(null);
        }}
        sessionId={session.id}
        set={rpeTarget}
      />
      <FinishSessionModal open={finishOpen} onOpenChange={setFinishOpen} session={session} />
      <CancelSessionModal open={cancelOpen} onOpenChange={setCancelOpen} session={session} />
      <CurrentWorkoutSheet
        open={currentOpen}
        onOpenChange={setCurrentOpen}
        sessionId={session.id}
        groups={groups}
        onAddExercise={() => {
          setCurrentOpen(false);
          setSearchOpen(true);
        }}
        onRemove={requestRemove}
        onFinish={() => {
          setCurrentOpen(false);
          setFinishOpen(true);
        }}
      />
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

export default function WorkoutPage() {
  // "Só cardio" começa um treino livre e já abre a busca nos cardios.
  const [searchOnStart, setSearchOnStart] = useState<MuscleGroup | null>(null);
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

  return active.data ? (
    <ActiveSession session={active.data} initialSearchGroup={searchOnStart} />
  ) : (
    <WorkoutHome onCardio={() => setSearchOnStart('cardio')} />
  );
}
