'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ClipboardList, Layers, Play, Plus, Trash2, Users } from 'lucide-react';
import {
  planExerciseChips,
  planSummaryLine,
  workoutApi,
  type TrainingBlock,
  type WorkoutPlan,
} from '@fatia/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/elements/error-state';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { PlanMuscleBar } from '@/components/workout/plan-muscle-bar';
import { cn } from '@/lib/utils';

/** O `btn sm` do canvas: cinza (`--s2`), 12 px de canto. */
const greyButton =
  'anim-press inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-muted text-sm font-bold text-foreground disabled:opacity-40';

/**
 * Planos (prancha Al-T6, #378): os cards dos planos, os atalhos para modelos e
 * bloco, e o "Novo plano" preso embaixo. A aba Circuitos fica para a #380 e o
 * plano recebido do personal para a #379.
 */
export default function PlansPage() {
  const qc = useQueryClient();
  const router = useRouter();
  // Excluir pergunta antes, no próprio card (Al-T6): o histórico continua, mas o plano não volta.
  const [askId, setAskId] = useState<string | null>(null);

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
      setAskId(null);
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

  return (
    <DockedPage className="px-4 pt-2">
      {activeBlock && (
        <BlockCard
          block={activeBlock}
          starting={start.isPending}
          onStart={() => activeBlock.planId && start.mutate(activeBlock.planId)}
        />
      )}

      {plans.isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-card bg-muted" />
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

      {plans.data?.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          starting={start.isPending}
          asking={askId === plan.id}
          removing={remove.isPending}
          removeFailed={remove.isError && askId === plan.id}
          onStart={() => start.mutate(plan.id)}
          onAsk={() => {
            remove.reset();
            setAskId(plan.id);
          }}
          onCancel={() => setAskId(null)}
          onDelete={() => remove.mutate(plan.id)}
        />
      ))}

      <ShortcutLink
        href="/community"
        icon={<Users size={20} aria-hidden />}
        title="Modelos das comunidades"
        subtitle="planos prontos dos seus grupos"
      />
      <ShortcutLink
        href="/workout#bloco"
        icon={<Layers size={20} aria-hidden />}
        title="Bloco de semanas"
        subtitle="organize força, volume e deload"
      />

      <DockedAction>
        <Link
          href="/workout/plans/new"
          className="anim-press flex h-14 flex-1 items-center justify-center gap-2 rounded-pill bg-foreground text-[15px] font-bold text-background"
        >
          <Plus size={16} aria-hidden />
          Novo plano
        </Link>
      </DockedAction>
    </DockedPage>
  );
}

/**
 * O bloco em andamento no topo, no desenho do card do plano recebido (Al-T6):
 * a semana, as sessões e o "Começar".
 */
function BlockCard({
  block,
  starting,
  onStart,
}: {
  block: TrainingBlock;
  starting: boolean;
  onStart: () => void;
}) {
  const week = block.currentWeek ?? null;
  return (
    <section
      aria-label="Bloco de semanas em andamento"
      className="space-y-3 rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--border-strong))]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[17px] font-bold">{block.kindLabel}</span>
          {block.planName && <span className="block text-xs text-faint">{block.planName}</span>}
        </span>
        <span className="inline-flex h-[22px] shrink-0 items-center rounded-pill bg-[hsl(var(--info)/0.1)] px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em] text-info">
          bloco
        </span>
      </div>
      {week && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-bold">
              Semana {week.weekNumber} de {block.weeksTotal}
            </span>
            <span className="text-xs text-faint tabular-nums">
              {week.sessionsDone} de {week.sessionsTarget} sessões nesta semana
            </span>
          </div>
          <div aria-hidden className="flex h-1.5 gap-[3px]">
            {Array.from({ length: block.weeksTotal }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'block h-full flex-1 rounded-[3px]',
                  i + 1 < week.weekNumber ? 'bg-primary' : 'bg-surface-3',
                )}
              />
            ))}
          </div>
        </div>
      )}
      {block.planId && block.planName && (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            disabled={starting}
            onClick={onStart}
            className={cn(greyButton, 'h-11 w-full')}
          >
            <Play size={16} aria-hidden />
            Começar {block.planName}
          </button>
        </div>
      )}
    </section>
  );
}

function PlanCard({
  plan,
  starting,
  asking,
  removing,
  removeFailed,
  onStart,
  onAsk,
  onCancel,
  onDelete,
}: {
  plan: WorkoutPlan;
  starting: boolean;
  asking: boolean;
  removing: boolean;
  removeFailed: boolean;
  onStart: () => void;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const exercises = [...(plan.exercises ?? [])].sort((a, b) => a.order - b.order);
  const chips = planExerciseChips(exercises);
  const template = Boolean(plan.fromTemplateId);
  return (
    <article className="space-y-3 rounded-card bg-card p-4">
      {/* O card inteiro (nome, chips e barra) abre o plano, como na prancha. */}
      <Link href={`/workout/plans/${plan.id}`} className="block space-y-3">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-bold text-foreground">
              {plan.name}
            </span>
            <span className="block text-xs text-faint">{planSummaryLine(exercises)}</span>
          </span>
          <span
            className={cn(
              'inline-flex h-[22px] shrink-0 items-center rounded-pill px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em]',
              template ? 'bg-brand text-brand-foreground' : 'bg-primary-soft text-primary-text',
            )}
          >
            {template ? 'modelo' : 'seu'}
          </span>
        </span>
        {chips.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-[15px] bg-muted pl-[3px] pr-2.5 text-xs font-semibold text-foreground"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-[11px] font-extrabold">
                  {c.label}
                </span>
                {c.name}
              </span>
            ))}
          </span>
        )}
        <PlanMuscleBar exercises={exercises} />
      </Link>

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          className={cn(greyButton, 'flex-1')}
          aria-label={`Começar ${plan.name}`}
          disabled={starting || exercises.length === 0}
          onClick={onStart}
        >
          <Play size={16} aria-hidden />
          Começar
        </button>
        <button
          type="button"
          onClick={onAsk}
          className={cn(greyButton, 'w-10 shrink-0 text-muted-foreground')}
          aria-label={`Excluir plano ${plan.name}`}
          aria-expanded={asking}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      {asking && (
        <div
          role="group"
          aria-label={`Excluir “${plan.name}”?`}
          className="space-y-2.5 rounded-[14px] bg-danger/10 p-3 shadow-[inset_0_0_0_1px_hsl(var(--danger)/0.35)]"
        >
          <p className="text-sm font-bold">Excluir “{plan.name}”?</p>
          <p className="text-xs text-faint">O histórico das sessões continua.</p>
          {removeFailed && (
            <p role="alert" className="text-xs text-danger">
              Não foi possível excluir. Tente de novo.
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className={cn(greyButton, 'flex-1')}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={removing}
              className="anim-press inline-flex h-10 flex-1 items-center justify-center rounded-[12px] bg-danger/15 text-sm font-bold text-danger disabled:opacity-40"
            >
              {removing ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      )}
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
      className="anim-press flex items-center gap-3 rounded-card px-4 py-3.5 shadow-[inset_0_0_0_1.5px_hsl(var(--border-strong))]"
    >
      <span className="text-primary-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-faint">{subtitle}</span>
      </span>
      <ChevronRight size={16} aria-hidden className="text-faint" />
    </Link>
  );
}
