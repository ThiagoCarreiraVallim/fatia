'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Trash2, Plus } from 'lucide-react';
import { workoutApi } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function PlansPage() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const create = useMutation({
    mutationFn: () => workoutApi.createPlan({ name: newName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      setNewName('');
      setShowForm(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => workoutApi.deletePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link
          href="/workout"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold">Planos de treino</h1>
      </div>

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
        <Button variant="outline" className="w-full gap-2" onClick={() => setShowForm(true)}>
          <Plus size={16} />
          Novo plano
        </Button>
      )}

      {plans.isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
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
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
          >
            <Link
              href={`/workout/plans/${plan.id}/edit`}
              className="flex flex-1 items-center justify-between hover:text-foreground"
            >
              <div>
                <p className="text-sm font-medium">{plan.name}</p>
                <p className="text-xs text-muted-foreground">
                  {plan.exercises?.length ?? 0} exercício
                  {(plan.exercises?.length ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
            <button
              type="button"
              onClick={() => remove.mutate(plan.id)}
              className="ml-3 rounded p-1 text-muted-foreground hover:text-rose-500"
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
