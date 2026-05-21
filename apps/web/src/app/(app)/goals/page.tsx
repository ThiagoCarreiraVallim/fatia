'use client';

import Link from 'next/link';
import {
  Plus,
  Flame,
  Dumbbell,
  Hourglass,
  CheckCircle2,
  History,
  ChevronRight,
} from 'lucide-react';

interface SecondaryGoal {
  id: string;
  title: string;
  subtitle: string;
  current: number;
  target: number;
  unit: string;
  badge: string;
  icon: 'hourglass' | 'dumbbell';
  color: 'blue' | 'pink';
}

interface RecentGoal {
  id: string;
  title: string;
  subtitle: string;
  status: 'CONCLUÍDO' | 'EXPIRADO';
}

const mainGoal = {
  title: 'Redução BF',
  description: 'Baixar gordura corporal para 12%',
  currentLabel: 'ATUAL',
  current: '14.5%',
  targetLabel: 'ALVO',
  target: '12.0%',
  progress: 60,
};

const secondaryGoals: SecondaryGoal[] = [
  {
    id: 'peso',
    title: 'Peso Corporal',
    subtitle: 'Ganho de massa magra',
    current: 82,
    target: 85,
    unit: 'kg',
    badge: '30 DIAS',
    icon: 'hourglass',
    color: 'blue',
  },
  {
    id: 'freq',
    title: 'Frequência',
    subtitle: 'Treinos por semana',
    current: 4,
    target: 6,
    unit: 'treinos',
    badge: 'SEMANAL',
    icon: 'dumbbell',
    color: 'pink',
  },
];

const recentGoals: RecentGoal[] = [
  {
    id: 'agua',
    title: 'Consumo de Água',
    subtitle: '3L por dia durante 30 dias',
    status: 'CONCLUÍDO',
  },
  {
    id: 'corrida',
    title: 'Corrida 5km',
    subtitle: 'Abaixo de 25 minutos',
    status: 'EXPIRADO',
  },
];

function MainGoalCard() {
  const stroke = 10;
  const size = 140;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (mainGoal.progress / 100) * circ;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card p-5">
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-primary/10 to-transparent" />

      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-foreground">
        <Flame size={12} className="text-primary" />
        META PRINCIPAL
      </span>

      <h2 className="relative mt-3 text-2xl font-extrabold text-foreground">{mainGoal.title}</h2>
      <p className="relative text-sm text-muted-foreground">{mainGoal.description}</p>

      <div className="relative mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/60 px-4 py-3">
          <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
            {mainGoal.currentLabel}
          </p>
          <p className="mt-0.5 text-xl font-extrabold text-primary tabular-nums">
            {mainGoal.current}
          </p>
        </div>
        <div className="rounded-xl bg-muted/60 px-4 py-3">
          <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
            {mainGoal.targetLabel}
          </p>
          <p className="mt-0.5 text-xl font-extrabold text-foreground tabular-nums">
            {mainGoal.target}
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
              {mainGoal.progress}
              <span className="text-base font-bold">%</span>
            </p>
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground">CONCLUÍDO</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecondaryGoalCard({ goal }: { goal: SecondaryGoal }) {
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
  const Icon = goal.icon === 'hourglass' ? Hourglass : Dumbbell;
  const iconBg = goal.color === 'blue' ? 'bg-blue-500/15' : 'bg-pink-500/15';
  const iconColor = goal.color === 'blue' ? 'text-blue-400' : 'text-pink-400';
  const barColor = goal.color === 'blue' ? 'bg-blue-500' : 'bg-pink-400';
  const targetColor = goal.color === 'blue' ? 'text-blue-400' : 'text-pink-300';

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon size={18} className={iconColor} />
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold text-foreground">
          {goal.badge}
        </span>
      </div>

      <h3 className="mt-3 text-base font-bold text-foreground">{goal.title}</h3>
      <p className="text-xs text-muted-foreground">{goal.subtitle}</p>

      <div className="mt-3 flex items-baseline justify-between">
        <p className="text-lg font-extrabold text-foreground tabular-nums">
          {goal.current}{' '}
          <span className="text-xs font-medium text-muted-foreground">{goal.unit}</span>
        </p>
        <p className={`text-[11px] font-bold ${targetColor} tabular-nums`}>
          Alvo: {goal.target}
          {goal.unit === 'kg' ? 'kg' : ''}
        </p>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RecentGoalRow({ goal }: { goal: RecentGoal }) {
  const done = goal.status === 'CONCLUÍDO';
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
        <p className="text-sm font-bold text-foreground">{goal.title}</p>
        <p className="text-xs text-muted-foreground">{goal.subtitle}</p>
      </div>
      <span
        className={`text-[10px] font-extrabold ${done ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {goal.status}
      </span>
    </div>
  );
}

export default function GoalsPage() {
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
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-[11px] font-extrabold text-primary-foreground"
          >
            <Plus size={14} strokeWidth={3} />
            NOVA
            <br />
            META
          </button>
        </div>
      </header>

      <MainGoalCard />

      <div className="space-y-3">
        {secondaryGoals.map((g) => (
          <SecondaryGoalCard key={g.id} goal={g} />
        ))}
      </div>

      <section className="rounded-2xl border border-white/5 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Metas Recentes</h3>
          <Link href="#" className="text-[11px] font-extrabold text-primary">
            VER TODAS
          </Link>
        </div>
        <div className="space-y-2">
          {recentGoals.map((g) => (
            <RecentGoalRow key={g.id} goal={g} />
          ))}
        </div>
      </section>

      <Link
        href="/profile"
        className="flex items-center justify-between rounded-xl border border-white/5 bg-card/50 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
      >
        Voltar ao perfil
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}
