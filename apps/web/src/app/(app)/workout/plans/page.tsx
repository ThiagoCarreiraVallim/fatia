'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarRange,
  ChevronRight,
  ClipboardList,
  Play,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { planSummaryLine, workoutApi, type WorkoutPlan } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/elements/error-state';
import { PlanMuscleBar } from '@/components/workout/plan-muscle-bar';

/** Planos (prancha Al-T6, #378). Circuitos ficam para a #380. */
export default function PlansPage() {
  const qc = useQueryClient();
  const router = useRouter();
  // Excluir pergunta antes: o histórico continua, mas o plano não volta.
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const block = useQuery({
    queryKey: ['workout', 'block'],
    queryFn: () => workoutApi.getActiveBlock(),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => workoutApi.deletePlan(id),
    onSuccess: () => {
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  const start = useMutation({
    mutationFn: (planId: string) =>
      workoutApi.startSession({ planId, startedAt: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push('/workout');
    },
  });

  const activeBlock = block.data ?? null;
  const week = activeBlock?.currentWeek ?? null;

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      {activeBlock && (
        <section
          aria-label="Bloco de semanas em andamento"
          className="rounded-2xl border border-primary/30 bg-primary/5 p-4"
        >
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {activeBlock.kindLabel}
            {activeBlock.planName ? ` · ${activeBlock.planName}` : ''}
          </p>
          {week && (
            <>
              <p className="mt-1 text-lg font-extrabold">
                Semana {week.weekNumber} de {activeBlock.weeksTotal}
              </p>
              <p className="text-sm text-muted-foreground">
                {week.sessionsDone} de {week.sessionsTarget} sessões nesta semana
              </p>
            </>
          )}
          {activeBlock.planId && activeBlock.planName && (
            <Button
              className="mt-3 w-full rounded-full"
              disabled={start.isPending}
              onClick={() => activeBlock.planId && start.mutate(activeBlock.planId)}
            >
              <Play size={16} fill="currentColor" className="mr-1.5" />
              Começar {activeBlock.planName}
            </Button>
          )}
        </section>
      )}

      <Button asChild variant="outline" className="w-full gap-2 rounded-2xl">
        <Link href="/workout/plans/new">
          <Plus size={16} />
          Novo plano
        </Link>
      </Button>

      {plans.isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {plans.isError && (
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar seus planos"
          detail={plans.error instanceof Error ? plans.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void plans.refetch()}
        />
      )}

      {plans.data && plans.data.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum plano criado ainda"
          description="Monte um treino (ex.: Push, Pull, Pernas) para começar mais rápido na academia."
        />
      )}

      {start.isError && (
        <p role="alert" className="text-sm text-danger">
          Não foi possível começar o treino.{' '}
          {start.error instanceof Error ? start.error.message : ''}
        </p>
      )}

      <div className="space-y-3">
        {plans.data?.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            starting={start.isPending}
            onStart={() => start.mutate(plan.id)}
            onDelete={() => setRemoveTarget({ id: plan.id, name: plan.name })}
          />
        ))}
      </div>

      <div className="space-y-2">
        <ShortcutLink
          href="/community"
          icon={<Users size={18} />}
          title="Modelos das comunidades"
          subtitle="planos prontos dos seus grupos"
        />
        <ShortcutLink
          href="/workout#bloco"
          icon={<CalendarRange size={18} />}
          title="Bloco de semanas"
          subtitle="organize força, volume e deload"
        />
      </div>

      <ConfirmDialog
        open={removeTarget != null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={`Excluir “${removeTarget?.name ?? ''}”?`}
        description="O histórico das sessões continua."
        confirmLabel="Excluir"
        pendingLabel="Excluindo..."
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
      />
    </div>
  );
}

function PlanCard({
  plan,
  starting,
  onStart,
  onDelete,
}: {
  plan: WorkoutPlan;
  starting: boolean;
  onStart: () => void;
  onDelete: () => void;
}) {
  const exercises = [...(plan.exercises ?? [])].sort((a, b) => a.order - b.order);
  const preview = exercises.slice(0, 3);
  const more = exercises.length - preview.length;
  return (
    <article className="rounded-2xl border border-subtle bg-card p-4">
      <Link href={`/workout/plans/${plan.id}`} className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-extrabold">{plan.name}</h2>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
              {plan.fromTemplateId ? 'modelo' : 'seu'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{planSummaryLine(exercises)}</p>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-muted-foreground" />
      </Link>

      {preview.length > 0 && (
        <ol className="mt-3 space-y-1 text-sm">
          {preview.map((pe, i) => (
            <li key={pe.id} className="flex items-center gap-2">
              <span className="w-4 text-xs font-bold text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="truncate">{pe.exercise.name}</span>
            </li>
          ))}
          {more > 0 && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <span className="w-4 text-xs font-bold">+</span>
              {more} mais
            </li>
          )}
        </ol>
      )}

      <PlanMuscleBar exercises={exercises} className="mt-3" />

      <div className="mt-3 flex items-center gap-2">
        <Button
          className="h-11 flex-1 rounded-full"
          aria-label={`Começar ${plan.name}`}
          disabled={starting || exercises.length === 0}
          onClick={onStart}
        >
          <Play size={14} fill="currentColor" className="mr-1.5" />
          Começar
        </Button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-danger"
          aria-label={`Excluir plano ${plan.name}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function ShortcutLink({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-4 hover:bg-accent"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-field bg-muted text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight size={16} className="text-muted-foreground" />
    </Link>
  );
}
