'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, Users, X } from 'lucide-react';
import {
  DEFAULT_PLAN_LINE,
  estimatePlanMinutes,
  isCardioExercise,
  muscleGroupName,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { useTopBarTitle } from '@/components/layout/app-top-bar';

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
  const totalSets = lines.reduce((acc, l) => acc + l.targetSets, 0);
  const canCreate = name.trim().length > 0 && picked.length > 0 && !create.isPending;

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <div className="space-y-1.5">
        <label htmlFor="plan-name" className="text-sm font-bold">
          Nome do plano
        </label>
        <Input
          id="plan-name"
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Costas e bíceps"
          className="h-12 text-base"
        />
      </div>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-extrabold">Exercícios</h2>
          {lines.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {lines.length} · {totalSets} séries · ~{estimatePlanMinutes(lines)} min
            </span>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-subtle px-4 py-6 text-center">
            <p className="text-sm font-semibold">Nenhum exercício ainda</p>
            <p className="text-xs text-muted-foreground">Adicione na ordem em que vai fazer</p>
          </div>
        ) : (
          <ol className="divide-y rounded-2xl border border-subtle bg-card">
            {lines.map((l, i) => (
              <li key={`${l.exercise.id}-${i}`} className="flex items-center gap-3 px-4 py-2">
                <span className="w-4 text-xs font-bold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.exercise.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {muscleGroupName(l.exercise.muscleGroup)}
                    {l.targetReps ? ` · ${l.targetSets} × ${l.targetReps.replace('-', '–')}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remover ${l.exercise.name}`}
                  onClick={() => setPicked((prev) => prev.filter((_, k) => k !== i))}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-danger"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ol>
        )}

        <Button
          variant="outline"
          className="w-full gap-2 rounded-2xl"
          onClick={() => setAddOpen(true)}
        >
          <Plus size={16} />
          Adicionar exercício
        </Button>
        <p className="text-xs text-muted-foreground">
          Depois de criar, toque no exercício para definir séries, repetições e descanso.
        </p>
      </section>

      <Link
        href="/community"
        className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-4 hover:bg-accent"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-field bg-muted text-primary">
          <Users size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Começar de um modelo</span>
          <span className="block text-xs text-muted-foreground">
            planos prontos das suas comunidades
          </span>
        </span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </Link>

      {create.isError && (
        <p role="alert" className="text-sm text-danger">
          Não foi possível criar o plano.{' '}
          {create.error instanceof Error ? create.error.message : 'Tente de novo.'}
        </p>
      )}

      <Button
        className="h-14 w-full rounded-full text-base font-extrabold"
        disabled={!canCreate}
        onClick={() => canCreate && create.mutate()}
      >
        {create.isPending ? 'Criando...' : 'Criar plano'}
      </Button>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planName={name.trim() || undefined}
        existingExerciseIds={new Set(picked.map((e) => e.id))}
        onAddMany={(chosen) => setPicked((prev) => [...prev, ...chosen])}
      />
    </div>
  );
}
