'use client';

import { Suspense, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ClipboardList,
  Layers,
  Play,
  Plus,
  Timer,
  Trash2,
  Users,
} from 'lucide-react';
import {
  circuitBadge,
  circuitExerciseChips,
  circuitPlanSummary,
  moveWithin,
  planExerciseChips,
  planOrderApi,
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
import { Segmented } from '@/components/ui/segmented';
import { CircuitBadge } from '@/components/workout/circuit/circuit-badge';
import { useStartCircuit } from '@/components/workout/circuit/use-start-circuit';
import { cn } from '@/lib/utils';

/** O `btn sm` do canvas: cinza (`--s2`), 12 px de canto. */
const greyButton =
  'anim-press inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-muted text-sm font-bold text-foreground disabled:opacity-40';

type PlansTab = 'planos' | 'circuitos';

/**
 * Planos e circuitos (prancha Al-T6, #378 e #380): as abas Planos e Circuitos,
 * os cards, os atalhos para modelos e bloco, e o "Novo plano" ou "Novo
 * circuito" preso embaixo. O plano recebido do personal fica para a #379.
 */
export default function PlansPage() {
  return (
    <Suspense>
      <PlansAndCircuits />
    </Suspense>
  );
}

function PlansAndCircuits() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  // A aba vai na URL: o "Salvar" do Novo circuito e o X do relógio voltam nela.
  const [tab, setTab] = useState<PlansTab>(
    params?.get('tab') === 'circuitos' ? 'circuitos' : 'planos',
  );
  const circuitsTab = tab === 'circuitos';
  const startCircuit = useStartCircuit();
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

  // A ordem é da pessoa (#402): o primeiro é o treino de hoje. A equipe dá a
  // ordem inicial; depois de reordenar aqui, a lista não muda mais pela ficha.
  const [ordering, setOrdering] = useState(false);
  const reorder = useMutation({
    mutationFn: (ids: string[]) => planOrderApi.set(ids),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workout', 'plans'] }),
  });
  const move = (id: string, delta: -1 | 1) => {
    const all = plans.data?.map((p) => p.id) ?? [];
    const subset = (plans.data ?? [])
      .filter((p) => (p.kind === 'CIRCUIT') === circuitsTab)
      .map((p) => p.id);
    const next = moveWithin(all, subset, id, delta);
    if (next === all) return;
    qc.setQueryData<WorkoutPlan[]>(['workout', 'plans'], (old) =>
      old ? next.flatMap((pid) => old.filter((p) => p.id === pid)) : old,
    );
    reorder.mutate(next);
  };

  const activeBlock = block.data ?? null;
  const shown = plans.data?.filter((p) => (p.kind === 'CIRCUIT') === circuitsTab);
  const starting = start.isPending || startCircuit.isPending;
  const startError = start.error ?? startCircuit.error;

  return (
    <DockedPage className="px-4 pt-2">
      <Segmented<PlansTab>
        label="Planos ou circuitos"
        value={tab}
        onChange={(next) => {
          setTab(next);
          setAskId(null);
          setOrdering(false);
          router.replace(next === 'circuitos' ? '/workout/plans?tab=circuitos' : '/workout/plans', {
            scroll: false,
          });
        }}
        options={[
          { value: 'planos', label: 'Planos' },
          { value: 'circuitos', label: 'Circuitos' },
        ]}
      />

      {!circuitsTab && activeBlock && (
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

      {shown && shown.length === 0 && !circuitsTab && (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum plano criado ainda"
          description="Monte um treino (ex.: Push, Pull, Pernas) para começar mais rápido na academia."
        />
      )}
      {shown && shown.length === 0 && circuitsTab && (
        <EmptyState
          icon={Timer}
          title="Nenhum circuito ainda"
          description="Monte um AMRAP, EMOM, Tabata ou For Time e deixe o relógio contar por você."
        />
      )}

      {startError && (
        <p role="alert" className="text-sm text-danger">
          Não foi possível começar o treino. {startError instanceof Error ? startError.message : ''}
        </p>
      )}

      {shown && shown.length > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {ordering ? 'O primeiro é o treino de hoje.' : `${shown.length} na ordem do app`}
          </p>
          <button
            type="button"
            onClick={() => setOrdering((v) => !v)}
            className="min-h-11 rounded-xl px-3 text-sm font-bold text-primary hover:bg-muted"
          >
            {ordering ? 'Pronto' : 'Ordenar'}
          </button>
        </div>
      )}
      {reorder.isError && (
        <p role="alert" className="text-sm text-danger">
          Não deu para salvar a ordem.
        </p>
      )}

      {ordering &&
        shown?.map((plan, i) => (
          <div key={plan.id} className="flex items-center gap-2 rounded-card bg-card px-4 py-2">
            <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
            <b className="min-w-0 flex-1 truncate text-sm text-foreground">{plan.name}</b>
            <button
              type="button"
              aria-label={`Subir ${plan.name}`}
              disabled={i === 0}
              onClick={() => move(plan.id, -1)}
              className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted disabled:opacity-30"
            >
              <ArrowUp size={18} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Descer ${plan.name}`}
              disabled={i === shown.length - 1}
              onClick={() => move(plan.id, 1)}
              className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted disabled:opacity-30"
            >
              <ArrowDown size={18} aria-hidden />
            </button>
          </div>
        ))}

      {!ordering &&
        shown?.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            circuit={circuitsTab}
            starting={starting}
            asking={askId === plan.id}
            removing={remove.isPending}
            removeFailed={remove.isError && askId === plan.id}
            onStart={() => (circuitsTab ? startCircuit.mutate(plan.id) : start.mutate(plan.id))}
            onAsk={() => {
              remove.reset();
              setAskId(plan.id);
            }}
            onCancel={() => setAskId(null)}
            onDelete={() => remove.mutate(plan.id)}
          />
        ))}

      {!circuitsTab && (
        <>
          <ShortcutLink
            href="/workout/templates"
            icon={<Users size={20} aria-hidden />}
            title="Modelos das comunidades"
            subtitle="planos prontos dos seus grupos"
          />
          <ShortcutLink
            href="/workout/block"
            icon={<Layers size={20} aria-hidden />}
            title="Bloco de semanas"
            subtitle="organize força, volume e deload"
          />
        </>
      )}

      <DockedAction>
        <Link
          href={circuitsTab ? '/workout/circuits/new' : '/workout/plans/new'}
          className="anim-press flex h-14 flex-1 items-center justify-center gap-2 rounded-pill bg-foreground text-[15px] font-bold text-background"
        >
          <Plus size={16} aria-hidden />
          {circuitsTab ? 'Novo circuito' : 'Novo plano'}
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
  circuit = false,
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
  /** Card da aba Circuitos: o resumo e o selo do formato, e o toque abre o editor. */
  circuit?: boolean;
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
  const chips = circuit ? circuitExerciseChips(exercises) : planExerciseChips(exercises);
  const template = Boolean(plan.fromTemplateId);
  const format = circuit ? plan.circuit?.format : undefined;
  return (
    <article className="space-y-3 rounded-card bg-card p-4">
      {/* O card inteiro (nome, chips e barra) abre o plano, como na prancha. O
          do circuito abre o editor: o "Começar" embaixo já leva ao relógio. */}
      <Link
        href={circuit ? `/workout/circuits/${plan.id}` : `/workout/plans/${plan.id}`}
        className="block space-y-3"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-bold text-foreground">
              {plan.name}
            </span>
            <span className="block text-xs text-faint">
              {circuit ? circuitPlanSummary(plan) : planSummaryLine(exercises)}
            </span>
          </span>
          {format ? (
            <CircuitBadge format={format}>{circuitBadge(format).label}</CircuitBadge>
          ) : (
            <span
              className={cn(
                'inline-flex h-[22px] shrink-0 items-center rounded-pill px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em]',
                template ? 'bg-brand text-brand-foreground' : 'bg-primary-soft text-primary-text',
              )}
            >
              {template ? 'modelo' : 'seu'}
            </span>
          )}
        </span>
        {chips.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className="inline-flex h-[30px] max-w-full items-center gap-1.5 whitespace-nowrap rounded-[15px] bg-muted pl-[3px] pr-2.5 text-xs font-semibold text-foreground"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-extrabold">
                  {c.label}
                </span>
                <span className="truncate">{c.name}</span>
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
