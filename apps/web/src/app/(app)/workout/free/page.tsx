'use client';

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Dumbbell, Play, Search, Star, X } from 'lucide-react';
import {
  addToFreeWorkout,
  freeStartLabel,
  freeSuggestions,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { TopBarActions } from '@/components/layout/app-top-bar';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { ExerciseGroupLine, ExerciseThumb } from '@/components/workout/plan-exercise-row';
import { groupTone } from '@/components/workout/group-tone';
import { useStartWithExercises } from '@/components/workout/use-start-with-exercises';
import { cn } from '@/lib/utils';

/** Quantos sugeridos aparecem embaixo da busca (a prancha mostra uma linha e meia). */
const SUGGESTIONS = 8;

/**
 * Treino livre (prancha `Al-T17b`, #381): "Treino atual · livre", vazio, para
 * montar na hora. Nada começa até o "Iniciar treino": o relógio da sessão só
 * anda dali em diante. Os sugeridos são a busca sem termo, que já põe os
 * favoritos primeiro (#378).
 *
 * `?add=cardio` é o "Só cardio" da aba Treino: abre o Adicionar exercício já
 * no filtro Cardio. Cardio é exercício, não tipo de treino.
 */
function FreeWorkout() {
  const params = useSearchParams();
  const [picked, setPicked] = useState<Exercise[]>([]);
  const [addOpen, setAddOpen] = useState(params.get('add') === 'cardio');
  // O filtro Cardio vale só na primeira vez que a busca abre.
  const [cardioFirst, setCardioFirst] = useState(params.get('add') === 'cardio');
  const [toast, setToast] = useState<string | null>(null);
  const start = useStartWithExercises();

  const suggestions = useQuery({
    queryKey: ['workout', 'exercises', 'suggested'],
    queryFn: () => workoutApi.searchExercises(undefined, undefined, { limit: SUGGESTIONS + 4 }),
  });
  const chosen = new Set(picked.map((e) => e.id));
  const suggested = freeSuggestions(suggestions.data, picked, SUGGESTIONS);

  function add(exercises: Exercise[]) {
    const next = addToFreeWorkout(picked, exercises);
    if (!next.message) return;
    setPicked(next.picked);
    setToast(next.message);
  }

  return (
    <DockedPage className="px-4 pt-2">
      <TopBarActions>
        <span className="rounded-pill bg-muted px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
          livre
        </span>
      </TopBarActions>

      <div className="space-y-1 px-1">
        <h1 className="font-display text-[26px] font-bold tracking-tight">Treino livre</h1>
        <p className="text-sm text-muted-foreground">
          Monte na hora. O relógio começa quando você iniciar.
        </p>
      </div>

      {picked.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card px-4 py-7 text-center shadow-[inset_0_0_0_1.5px_hsl(var(--border-strong))]">
          <span
            aria-hidden
            className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primary-soft text-primary-text"
          >
            <Dumbbell size={24} />
          </span>
          <p className="font-bold">Adicione o primeiro exercício</p>
          <p className="text-sm text-muted-foreground">Busque ou toque num dos sugeridos abaixo</p>
        </div>
      ) : (
        <ol aria-label="Exercícios do treino" className="rounded-card bg-card px-4">
          {picked.map((e, i) => (
            <li
              key={e.id}
              className={cn(
                'flex min-h-[68px] items-center gap-3',
                i > 0 && 'border-t border-border',
              )}
            >
              <ExerciseThumb group={e.muscleGroup} size={40} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-[15px] font-semibold">{e.name}</span>
                <ExerciseGroupLine group={e.muscleGroup} />
              </span>
              <button
                type="button"
                aria-label={`Remover ${e.name}`}
                onClick={() => setPicked((prev) => prev.filter((p) => p.id !== e.id))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-faint hover:text-danger"
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="anim-press flex min-h-[52px] w-full items-center justify-center gap-2 rounded-card bg-card text-sm font-bold"
      >
        <Search size={16} aria-hidden />
        Buscar exercício
      </button>

      {suggested.length > 0 && (
        <section aria-labelledby="free-suggested" className="space-y-2">
          <div className="flex items-baseline justify-between px-1 text-xs text-muted-foreground">
            <h2 id="free-suggested">Sugeridos</h2>
            <span>favoritos primeiro</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-label={`Adicionar ${e.name}${e.favorite ? ' (favorito)' : ''}`}
                onClick={() => add([e])}
                className="anim-press inline-flex h-[38px] items-center gap-1.5 rounded-pill bg-card px-3.5 text-sm font-semibold"
              >
                {e.favorite ? (
                  <Star size={14} aria-hidden className="fill-current text-steps" />
                ) : (
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-[2px]"
                    style={{ background: groupTone(e.muscleGroup) }}
                  />
                )}
                {e.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {toast ?? ''}
      </p>

      {start.isError && (
        <p role="alert" className="text-sm text-danger">
          Não foi possível iniciar o treino. Tente de novo.
        </p>
      )}

      <DockedAction>
        <button
          type="button"
          disabled={picked.length === 0 || start.isPending}
          onClick={() =>
            start.mutate({
              planId: null,
              pending: picked.map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup })),
            })
          }
          className="anim-press flex h-14 flex-1 items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:bg-card disabled:text-faint"
        >
          <Play size={16} aria-hidden />
          {start.isPending ? 'Iniciando...' : freeStartLabel(picked.length)}
        </button>
      </DockedAction>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setCardioFirst(false);
        }}
        initialTab={cardioFirst ? 'cardio' : undefined}
        existingExerciseIds={chosen}
        onAddMany={add}
      />
    </DockedPage>
  );
}

export default function FreeWorkoutPage() {
  // `useSearchParams` pede um Suspense em volta (render estático do Next).
  return (
    <Suspense>
      <FreeWorkout />
    </Suspense>
  );
}
