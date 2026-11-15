'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Layers, Plus, X } from 'lucide-react';
import {
  DEFAULT_PLAN_LINE,
  isCardioExercise,
  planDraftSummary,
  planExerciseSummary,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { ExerciseGroupLine, ExerciseThumb } from '@/components/workout/plan-exercise-row';
import { cn } from '@/lib/utils';

/**
 * Novo plano (prancha Al-T19, #378). Nome e exercícios numa tela só; o plano
 * nasce com tudo em duas requisições (cria e adiciona o lote). Séries,
 * repetições e descanso de cada um se ajustam no plano criado, no Configurar.
 */
export default function NewPlanPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Exercise[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  // Se o lote falhar depois do plano criado, tentar de novo não cria outro.
  const [createdId, setCreatedId] = useState<string | null>(null);
  useTopBarTitle('Novo plano');

  const create = useMutation({
    mutationFn: async () => {
      const id = createdId ?? (await workoutApi.createPlan({ name: name.trim() })).id;
      setCreatedId(id);
      if (picked.length > 0) {
        await workoutApi.addPlanExercises(
          id,
          picked.map((e) => e.id),
        );
      }
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.push(`/workout/plans/${id}`);
    },
  });

  const lines = picked.map((e) => {
    const cardio = isCardioExercise(e);
    return {
      exercise: e,
      ...DEFAULT_PLAN_LINE,
      targetSets: cardio ? 1 : DEFAULT_PLAN_LINE.targetSets,
      targetReps: cardio ? '' : DEFAULT_PLAN_LINE.targetReps,
    };
  });
  const canCreate = name.trim().length > 0 && picked.length > 0 && !create.isPending;

  return (
    <DockedPage className="px-4 pt-2">
      <div className="space-y-2">
        <label htmlFor="plan-name" className="block px-1 text-xs text-faint">
          Nome do plano
        </label>
        <input
          id="plan-name"
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Costas e bíceps"
          className="h-14 w-full rounded-2xl bg-card px-4 text-lg font-bold text-foreground outline-none placeholder:font-semibold placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      <section aria-labelledby="new-plan-exercises" className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <p id="new-plan-exercises" className="text-xs text-faint">
            Exercícios
          </p>
          <span className="text-xs text-faint tabular-nums">{planDraftSummary(lines)}</span>
        </div>

        <div className="rounded-card bg-card px-4">
          {lines.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <p className="font-bold">Nenhum exercício ainda</p>
              <p className="text-xs text-faint">Adicione na ordem em que vai fazer</p>
            </div>
          )}
          {lines.length > 0 && (
            <ol>
              {lines.map((l, i) => (
                <li
                  key={`${l.exercise.id}-${i}`}
                  className={cn(
                    'flex min-h-[72px] items-center gap-3',
                    i > 0 && 'border-t border-border',
                  )}
                >
                  <ExerciseThumb group={l.exercise.muscleGroup} size={48} />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-[15px] font-semibold">{l.exercise.name}</span>
                    <ExerciseGroupLine
                      group={l.exercise.muscleGroup}
                      detail={l.targetReps ? planExerciseSummary(l) : null}
                    />
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover ${l.exercise.name}`}
                    onClick={() => setPicked((prev) => prev.filter((_, k) => k !== i))}
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
            className="flex min-h-14 w-full items-center gap-2 border-t border-border text-sm font-bold text-primary-text"
          >
            <Plus size={16} aria-hidden />
            Adicionar exercício
          </button>
        </div>
        {/* Desvio do Al-T19: séries e descanso se ajustam no plano criado. */}
        <p className="px-1 text-xs text-faint">
          Depois de criar, toque no exercício para definir séries, repetições e descanso.
        </p>
      </section>

      <Link
        href="/community"
        className="anim-press flex items-center gap-3 rounded-card px-4 py-3.5 shadow-[inset_0_0_0_1.5px_hsl(var(--border-strong))]"
      >
        <Layers size={20} aria-hidden className="text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Começar de um modelo</span>
          <span className="block text-xs text-faint">planos prontos das suas comunidades</span>
        </span>
        <ChevronRight size={16} aria-hidden className="text-faint" />
      </Link>

      {create.isError && (
        <p role="alert" className="text-sm text-danger">
          Não foi possível criar o plano.{' '}
          {create.error instanceof Error ? create.error.message : 'Tente de novo.'}
        </p>
      )}

      <DockedAction>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => canCreate && create.mutate()}
          className="anim-press flex h-14 flex-1 items-center justify-center rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:bg-card disabled:text-faint"
        >
          {create.isPending ? 'Criando...' : 'Criar plano'}
        </button>
      </DockedAction>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planName={name.trim() || undefined}
        existingExerciseIds={new Set(picked.map((e) => e.id))}
        onAddMany={(chosen) => setPicked((prev) => [...prev, ...chosen])}
      />
    </DockedPage>
  );
}
