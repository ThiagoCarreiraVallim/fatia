'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Trash2, Plus, Dumbbell } from 'lucide-react';
import { workoutApi } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function PlansPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const create = useMutation({
    mutationFn: () => workoutApi.createPlan({ name: newName.trim() }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      setNewName('');
      setShowForm(false);
      // Leva direto para o plano recém-criado para adicionar exercícios —
      // criar um plano "vazio" e ficar na lista passava a sensação de que
      // nada tinha sido criado.
      if (created?.id) router.push(`/workout/plans/${created.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => workoutApi.deletePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header className="flex items-center gap-3">
        <Link
          href="/workout"
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-3xl font-extrabold text-foreground">Planos de treino</h1>
      </header>

      {showForm ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do plano"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) create.mutate();
              if (e.key === 'Escape') setShowForm(false);
            }}
          />
          <Button
            onClick={() => create.mutate()}
            disabled={!newName.trim() || create.isPending}
            size="sm"
          >
            Salvar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full gap-2 rounded-2xl"
          onClick={() => setShowForm(true)}
        >
          <Plus size={16} />
          Novo plano
        </Button>
      )}

      {plans.isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {plans.data && plans.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum plano criado ainda.</p>
      )}

      <div className="space-y-2">
        {plans.data?.map((plan) => (
          <div
            key={plan.id}
            className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card p-4"
          >
            <Link
              href={`/workout/plans/${plan.id}`}
              className="flex flex-1 items-center gap-3 min-w-0"
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
            <button
              type="button"
              onClick={() => remove.mutate(plan.id)}
              className="rounded p-1 text-muted-foreground hover:text-rose-500"
              aria-label="Excluir plano"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
