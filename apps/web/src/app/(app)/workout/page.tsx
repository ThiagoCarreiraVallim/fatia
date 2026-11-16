'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  buildExerciseGroups,
  moveExerciseInOrder,
  orderExerciseGroups,
  pickFocusedGroup,
  workoutApi,
  type ExerciseGroup,
  type PendingExercise,
  type SessionSet,
  type WorkoutSession,
} from '@fatia/api-client';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { FinishSessionModal } from '@/components/workout/finish-session-modal';
import { CancelSessionModal } from '@/components/workout/cancel-session-modal';
import { ActiveExerciseCard } from '@/components/workout/active-exercise-card';
import { ActiveCardioCard } from '@/components/workout/active-cardio-card';
import { RemoveExerciseModal } from '@/components/workout/remove-exercise-modal';
import { RpeModal } from '@/components/workout/rpe-modal';
import { SessionHeader } from '@/components/workout/session-header';
import { isExerciseComplete } from '@/components/workout/format';
import {
  CurrentExerciseList,
  CurrentWorkoutSheet,
} from '@/components/workout/current-workout-sheet';
import { ExerciseHeading } from '@/components/workout/exercise-title';
import { useAutoAdvance } from '@/components/workout/use-auto-advance';
import { Switch } from '@/components/ui/switch';
import { useSessionRestTimer } from '@/components/workout/rest-timer-provider';
import { useSessionLayout } from '@/components/workout/use-session-layout';
import { useWakeLock } from '@/components/workout/use-wake-lock';
import { pendingKey } from '@/components/workout/use-start-with-exercises';
import { WorkoutHome } from '@/components/workout/workout-home';
import { Skeleton } from '@/components/ui/skeleton';

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
  // O descanso mora acima das telas (`RestTimerProvider`), e não no card: o
  // card desmonta quando o foco passa para o próximo exercício, e a barra do
  // treino em andamento mostra a contagem e o "+30 s" fora daqui.
  const rest = useSessionRestTimer();
  const topRef = useRef<HTMLDivElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ExerciseGroup | null>(null);
  const [rpeTarget, setRpeTarget] = useState<SessionSet | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<Set<number>>(new Set());
  // Escolhidos na busca e ainda sem série: vivem só na tela (ver `buildExerciseGroups`).
  // O Treino livre e o "Repetir" (#381) deixam os escolhidos no cache ao abrir a sessão.
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingExercise[]>(
    () => qc.getQueryData<PendingExercise[]>(pendingKey(session.id)) ?? [],
  );
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
  // Nada em foco com exercício na lista (tudo feito, ou o que falta foi
  // pulado), ou a escolha do próximo sem próximo: o resumo do treino até aqui.
  const showDone =
    groups.length > 0 && ((!picking && !focused) || (picking && remaining.length === 0));
  const doneSets = groups.reduce((acc, g) => acc + g.sets.length, 0);

  /** Traz o exercício para o foco — inclusive um que a pessoa tinha pulado. */
  function doNow(exerciseId: number) {
    setSkippedExerciseIds((prev) => {
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
    setPickedId(exerciseId);
    setPicking(false);
    // O card em foco fica no topo: quem escolheu pode ter rolado a página.
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
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

  // "1/7" e as setas, na linha da série (prancha Al-T3d): andam até o vizinho
  // ainda por fazer.
  const exerciseNav = focused ? (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="me-1 text-[13px] font-bold text-muted-foreground tabular-nums">
        <span aria-hidden>
          {focusedIndex + 1}/{groups.length}
        </span>
        <span className="sr-only">
          Exercício {focusedIndex + 1} de {groups.length}
        </span>
      </span>
      <button
        type="button"
        aria-label="Exercício anterior"
        disabled={!previousOpen}
        onClick={() => previousOpen && doNow(previousOpen.exerciseId)}
        className="anim-press flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Próximo exercício"
        disabled={!nextOpen}
        onClick={() => nextOpen && doNow(nextOpen.exerciseId)}
        className="anim-press flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  ) : null;

  // O "Passar sozinho" logo acima do "Concluir série" (prancha Al-T3), como
  // caixa de marcar; a dica diz o que acontece em cada caso.
  const autoToggle = (
    <button
      type="button"
      role="checkbox"
      aria-checked={autoAdvance}
      onClick={() => setAutoAdvance(!autoAdvance)}
      className="anim-press flex w-full items-center gap-3 text-left"
    >
      <span
        aria-hidden
        className={
          autoAdvance
            ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-primary text-primary-foreground'
            : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] shadow-[inset_0_0_0_1.5px_hsl(var(--border-strong))]'
        }
      >
        {autoAdvance && <Check size={16} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-foreground">
          Passar sozinho para o próximo exercício
        </span>
        <span className="block text-xs text-muted-foreground">
          {autoAdvance
            ? 'ao terminar as séries, já abre o seguinte'
            : 'ao terminar, você escolhe qual fazer'}
        </span>
      </span>
    </button>
  );

  return (
    <div ref={topRef} className="scroll-mt-20 space-y-4 px-5 pt-4 pb-4">
      <SessionHeader startedAt={session.startedAt} onFinish={() => setFinishOpen(true)} />

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

      {picking && !showDone && (
        <section
          aria-labelledby="sessao-escolhendo"
          className="space-y-3 rounded-3xl border border-subtle bg-card p-4"
        >
          <h2 id="sessao-escolhendo" className="text-lg font-extrabold text-foreground">
            Qual o próximo?
          </h2>
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
        <ExerciseHeading
          key={`heading-${focused.exerciseId}`}
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
          nav={exerciseNav}
          onAll={() => setCurrentOpen(true)}
          beforeSubmit={autoToggle}
        />
      )}

      {!picking && focused && focused.isCardio && (
        <ActiveCardioCard
          key={focused.exerciseId}
          sessionId={session.id}
          group={focused}
          onFinishExercise={() => skipExercise(focused.exerciseId)}
          nav={exerciseNav}
        />
      )}

      {showDone && (
        // Tudo feito: no lugar do aviso vazio, cada exercício com as séries
        // feitas (a lista do Treino atual, prancha Al-T17), para conferir e
        // corrigir antes de finalizar. Pôr outro e finalizar ficam presos
        // embaixo, como o "Concluir série".
        <section aria-labelledby="sessao-feito" className="space-y-3">
          <div>
            <h2
              id="sessao-feito"
              className="font-display text-[22px] font-semibold text-foreground"
            >
              Treino de hoje
            </h2>
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {groups.length} {groups.length === 1 ? 'exercício' : 'exercícios'} · {doneSets}{' '}
              {doneSets === 1 ? 'série' : 'séries'}
            </p>
          </div>
          <CurrentExerciseList
            surface="page"
            sessionId={session.id}
            groups={groups}
            onRemove={requestRemove}
            onStart={doNow}
          />
          <div className="sticky bottom-[calc(22px+env(safe-area-inset-bottom))] z-30 flex gap-2 md:bottom-4">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="anim-press flex h-14 items-center justify-center rounded-full bg-muted px-5 text-[15px] font-bold text-foreground"
            >
              + Exercício
            </button>
            <button
              type="button"
              onClick={() => setFinishOpen(true)}
              className="anim-press h-14 flex-1 rounded-full bg-primary text-[15px] font-extrabold text-primary-foreground"
            >
              Finalizar treino
            </button>
          </div>
        </section>
      )}

      {/* Treino livre ainda vazio: sem card em foco não há o "Todas ›", e
          adicionar fica aqui. Com foco, a prancha Al-T3 não tem lista embaixo —
          fazer outro agora, reordenar, tirar e pôr exercício moram no "Treino
          atual". */}
      {!picking && !focused && groups.length === 0 && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="anim-press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-muted text-sm font-bold text-foreground"
        >
          <Plus size={16} aria-hidden />
          Adicionar exercício
        </button>
      )}

      <ExerciseSearchDrawer
        open={searchOpen}
        onOpenChange={setSearchOpen}
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
        onCancel={() => {
          setCurrentOpen(false);
          setCancelOpen(true);
        }}
        onFinish={() => {
          setCurrentOpen(false);
          setFinishOpen(true);
        }}
        onMove={(exerciseId, direction) =>
          layout.reorder.mutate(moveExerciseInOrder(groups, exerciseId, direction))
        }
        onStart={(exerciseId) => {
          setCurrentOpen(false);
          doNow(exerciseId);
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

  return active.data ? <ActiveSession session={active.data} /> : <WorkoutHome />;
}
