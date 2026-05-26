'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Plus,
  Flame,
  Dumbbell,
  Hourglass,
  CheckCircle2,
  History,
  ChevronRight,
  Footprints,
  Scale,
  Sparkles,
  Trash2,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { goalsApi, type Goal, type GoalKind } from '@/lib/api/goals';
import { NewGoalDrawer } from '@/components/goals/new-goal-drawer';

const KIND_ICON: Record<GoalKind, LucideIcon> = {
  weight: Scale,
  body_fat: Flame,
  workout_frequency: Dumbbell,
  step_count: Footprints,
  custom: Sparkles,
};

function formatValue(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) return '—';
  const rounded = Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v).toString();
  return unit === '%' ? `${rounded}%` : rounded;
}

function MainGoalCard({ goal }: { goal: Goal }) {
  const stroke = 10;
  const size = 140;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = goal.progressPercent ?? 0;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card p-5">
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-primary/10 to-transparent" />

      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-foreground">
        <Flame size={12} className="text-primary" />
        META PRINCIPAL
      </span>

      <h2 className="relative mt-3 text-2xl font-extrabold text-foreground">{goal.title}</h2>
      {goal.description && (
        <p className="relative text-sm text-muted-foreground">{goal.description}</p>
      )}

      <div className="relative mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/60 px-4 py-3">
          <p className="text-[10px] font-bold tracking-wide text-muted-foreground">ATUAL</p>
          <p className="mt-0.5 text-xl font-extrabold text-primary tabular-nums">
            {formatValue(goal.currentValue, goal.unit)}
            {goal.unit !== '%' && (
              <span className="ml-1 text-xs text-muted-foreground">{goal.unit}</span>
            )}
          </p>
        </div>
        <div className="rounded-xl bg-muted/60 px-4 py-3">
          <p className="text-[10px] font-bold tracking-wide text-muted-foreground">ALVO</p>
          <p className="mt-0.5 text-xl font-extrabold text-foreground tabular-nums">
            {formatValue(goal.targetValue, goal.unit)}
            {goal.unit !== '%' && (
              <span className="ml-1 text-xs text-muted-foreground">{goal.unit}</span>
            )}
          </p>
        </div>
      </div>

      <div className="relative mt-5 flex justify-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="hsl(var(--muted))"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="hsl(var(--primary))"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.5))' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-3xl font-extrabold text-foreground tabular-nums">
              {pct}
              <span className="text-base font-bold">%</span>
            </p>
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground">CONCLUÍDO</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecondaryGoalCard({
  goal,
  onComplete,
  onDelete,
}: {
  goal: Goal;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const pct = goal.progressPercent ?? 0;
  const Icon = KIND_ICON[goal.kind];
  const deadline = goal.deadline ? new Date(goal.deadline) : null;
  const daysLeft = deadline
    ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
  const badge = daysLeft !== null ? `${daysLeft}D` : goal.kind.toUpperCase();

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <Icon size={18} className="text-primary" />
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold text-foreground">
          {badge}
        </span>
      </div>

      <h3 className="mt-3 text-base font-bold text-foreground">{goal.title}</h3>
      {goal.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{goal.description}</p>
      )}

      <div className="mt-3 flex items-baseline justify-between">
        <p className="text-lg font-extrabold text-foreground tabular-nums">
          {formatValue(goal.currentValue, goal.unit)}{' '}
          <span className="text-xs font-medium text-muted-foreground">{goal.unit}</span>
        </p>
        <p className="text-[11px] font-bold text-primary tabular-nums">
          Alvo: {formatValue(goal.targetValue, goal.unit)}
        </p>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onComplete}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary/10 px-2 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/20"
        >
          <Check size={12} />
          Concluir
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remover meta"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function RecentGoalRow({ goal }: { goal: Goal }) {
  const done = goal.status === 'completed';
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        }`}
      >
        {done ? <CheckCircle2 size={18} /> : <History size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{goal.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          Alvo: {formatValue(goal.targetValue, goal.unit)} {goal.unit}
        </p>
      </div>
      <span
        className={`text-[10px] font-extrabold ${done ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {done ? 'CONCLUÍDO' : 'EXPIRADO'}
      </span>
    </div>
  );
}

export default function GoalsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const qc = useQueryClient();

  // Uma única query traz todas as metas (sem filtro de status). Bucketizamos
  // no client. Evita 3 chamadas paralelas — Logto SDK pode dar race em
  // getAccessToken concorrente.
  const allGoals = useQuery({
    queryKey: ['goals', 'all'],
    queryFn: () => goalsApi.list(),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => goalsApi.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => goalsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });

  const goals = allGoals.data ?? [];
  const activeGoals = goals.filter((g) => g.status === 'active');
  const [mainGoal, ...secondaryGoals] = activeGoals;
  const recents = goals
    .filter((g) => g.status === 'completed' || g.status === 'expired')
    .slice(0, 5);

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground">Metas</h1>
            <p className="mt-1 text-sm text-muted-foreground">Acompanhe seus objetivos ativos.</p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-[11px] font-extrabold text-primary-foreground"
          >
            <Plus size={14} strokeWidth={3} />
            NOVA META
          </button>
        </div>
      </header>

      {allGoals.isLoading && (
        <>
          <div className="h-[280px] animate-pulse rounded-2xl bg-card" />
          <div className="grid grid-cols-1 gap-3">
            <div className="h-[160px] animate-pulse rounded-2xl bg-card" />
            <div className="h-[160px] animate-pulse rounded-2xl bg-card" />
          </div>
        </>
      )}

      {!allGoals.isLoading && activeGoals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-card/30 p-6 text-center">
          <Hourglass size={20} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm font-bold text-foreground">Nenhuma meta ativa</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie uma meta pelo botão acima ou peça ao Claude.
          </p>
        </div>
      )}

      {mainGoal && <MainGoalCard goal={mainGoal} />}

      {secondaryGoals.length > 0 && (
        <div className="space-y-3">
          {secondaryGoals.map((g) => (
            <SecondaryGoalCard
              key={g.id}
              goal={g}
              onComplete={() => completeMutation.mutate(g.id)}
              onDelete={() => deleteMutation.mutate(g.id)}
            />
          ))}
        </div>
      )}

      {recents.length > 0 && (
        <section className="rounded-2xl border border-white/5 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Metas Recentes</h3>
          </div>
          <div className="space-y-2">
            {recents.map((g) => (
              <RecentGoalRow key={g.id} goal={g} />
            ))}
          </div>
        </section>
      )}

      <Link
        href="/profile"
        className="flex items-center justify-between rounded-xl border border-white/5 bg-card/50 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
      >
        Voltar ao perfil
        <ChevronRight size={16} />
      </Link>

      <NewGoalDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
