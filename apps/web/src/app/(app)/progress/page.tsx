'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Calendar,
  Trophy,
  Dumbbell,
  Footprints,
  Flame,
  Scale,
  ChevronRight,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { progressApi } from '@/lib/api/progress';
import { WeightChart } from '@/components/progress/weight-chart';
import { StepsChart } from '@/components/progress/steps-chart';
import { LogWeightDrawer } from '@/components/progress/log-weight-drawer';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RANGES = [14, 30, 90, 180] as const;
const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function HeatmapCell({ intensity }: { intensity: number }) {
  // 0 = empty, 1-4 = increasing intensity
  const styles = ['bg-muted/40', 'bg-primary/20', 'bg-primary/40', 'bg-primary/70', 'bg-primary'];
  return (
    <div
      className={`aspect-square rounded-md ${styles[intensity]} ${intensity >= 3 ? 'shadow-[0_0_8px_hsl(var(--primary)/0.4)]' : ''}`}
    />
  );
}

function WeightBarMini({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (
    <div className="flex h-16 items-end gap-1">
      {values.map((v, i) => {
        const isLast = i === values.length - 1;
        const h = Math.max(0.1, (v - min) / range) * 100;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-sm ${isLast ? 'bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]' : 'bg-muted/80'}`}
              style={{ height: `${h}%`, minHeight: '8px' }}
            />
            {isLast && (
              <span className="text-[9px] font-extrabold text-primary tracking-wide">HOJE</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PR {
  id: string;
  exercise: string;
  category: string;
  value: string;
  unit: string;
  type: 'strength' | 'cardio';
  icon: 'dumbbell' | 'run';
}

const personalRecords: PR[] = [
  {
    id: '1',
    exercise: 'Supino Reto',
    category: 'Força • Barra Livre',
    value: '110',
    unit: 'kg',
    type: 'strength',
    icon: 'dumbbell',
  },
  {
    id: '2',
    exercise: '5km Corrida',
    category: 'Cardio • Esteira',
    value: '22:45',
    unit: 'TEMPO',
    type: 'cardio',
    icon: 'run',
  },
];

function buildHeatmap(): number[][] {
  // 2 rows × 7 cols mock heatmap based on image
  return [
    [0, 2, 3, 4, 0, 2, 3],
    [0, 2, 4, 0, 0, 0, 0],
  ];
}

function buildWeightSeries(): number[] {
  return [80.2, 79.6, 79.8, 79.0, 78.7, 78.5];
}

export default function ProgressPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [logWeightOpen, setLogWeightOpen] = useState(false);
  const [logStepsOpen, setLogStepsOpen] = useState(false);

  const weight = useQuery({
    queryKey: ['progress', 'weight', days],
    queryFn: () => progressApi.weight(days),
  });
  const steps = useQuery({
    queryKey: ['progress', 'steps', days],
    queryFn: () => progressApi.steps(days),
  });

  const realWeightPoints = weight.data?.points ?? [];
  const weightSeries =
    realWeightPoints.length >= 2
      ? realWeightPoints.slice(-6).map((p) => p.weightKg)
      : buildWeightSeries();
  const currentWeight = weight.data?.currentWeightKg ?? 78.5;
  const weightDelta = weight.data?.totalDeltaKg ?? -1.2;
  const heatmap = buildHeatmap();

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header>
        <h1 className="text-3xl font-extrabold text-foreground">Evolução</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seus dados de performance dos últimos {days} dias.
        </p>
      </header>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted p-1">
          <TabsTrigger
            value="overview"
            className="rounded-lg text-[11px] data-[state=active]:bg-card data-[state=active]:font-bold data-[state=active]:text-primary"
          >
            Visão geral
          </TabsTrigger>
          <TabsTrigger
            value="charts"
            className="rounded-lg text-[11px] data-[state=active]:bg-card data-[state=active]:font-bold data-[state=active]:text-primary"
          >
            Gráficos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* PESO CORPORAL CARD */}
          <div className="rounded-2xl border border-white/5 bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
                  PESO CORPORAL
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className="text-3xl font-extrabold text-foreground tabular-nums">
                    {currentWeight.toFixed(1)} <span className="text-base font-bold">kg</span>
                  </p>
                  <span
                    className={`flex items-center gap-0.5 text-xs font-bold ${weightDelta < 0 ? 'text-primary' : 'text-amber-400'}`}
                  >
                    {weightDelta < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                    {weightDelta > 0 ? '+' : ''}
                    {weightDelta.toFixed(1)} kg
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLogWeightOpen(true)}
                aria-label="Logar peso"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary"
              >
                <Scale size={16} />
              </button>
            </div>

            <div className="mt-4">
              <WeightBarMini values={weightSeries} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/5 bg-card p-4">
              <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
                MASSA MAGRA
              </p>
              <p className="mt-1 text-xl font-extrabold text-foreground tabular-nums">+0.8%</p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/2 bg-blue-500" />
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-card p-4">
              <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
                CONSTÂNCIA
              </p>
              <p className="mt-1 text-xl font-extrabold text-foreground tabular-nums">
                24 <span className="text-xs font-bold text-muted-foreground">/30 dias</span>
              </p>
              <div className="mt-3 grid grid-cols-4 gap-1">
                <div className="h-2.5 rounded-sm bg-primary" />
                <div className="h-2.5 rounded-sm bg-primary" />
                <div className="h-2.5 rounded-sm bg-primary/40" />
                <div className="h-2.5 rounded-sm bg-primary" />
              </div>
            </div>
          </div>

          {/* INTENSIDADE HEATMAP */}
          <div className="rounded-2xl border border-white/5 bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Intensidade do Treino</h3>
              <Calendar size={16} className="text-muted-foreground" />
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {DAYS.map((d, i) => (
                <p
                  key={`day-${i}`}
                  className="text-center text-[10px] font-bold text-muted-foreground"
                >
                  {d}
                </p>
              ))}
              {heatmap.flat().map((v, i) => (
                <HeatmapCell key={i} intensity={v} />
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
              <span>Leve</span>
              <div className="flex gap-1">
                <div className="h-2 w-3 rounded-sm bg-primary/20" />
                <div className="h-2 w-3 rounded-sm bg-primary/40" />
                <div className="h-2 w-3 rounded-sm bg-primary/70" />
                <div className="h-2 w-3 rounded-sm bg-primary" />
              </div>
              <span>Intenso</span>
            </div>
          </div>

          {/* RECORDES PESSOAIS */}
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Trophy size={16} className="text-blue-400" />
              Recordes Pessoais
            </h3>
            {personalRecords.map((pr) => (
              <div
                key={pr.id}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card p-3"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  {pr.icon === 'dumbbell' ? (
                    <Dumbbell size={18} className="text-primary" />
                  ) : (
                    <Footprints size={18} className="text-blue-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{pr.exercise}</p>
                  <p className="text-xs text-muted-foreground">{pr.category}</p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-lg font-extrabold tabular-nums ${
                      pr.type === 'strength' ? 'text-primary' : 'text-blue-400'
                    }`}
                  >
                    {pr.value} {pr.unit !== 'TEMPO' && <span className="text-sm">{pr.unit}</span>}
                  </p>
                  <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
                    {pr.unit === 'kg' ? '1RM' : pr.unit}
                  </p>
                </div>
              </div>
            ))}
            <Link
              href="/workout/history"
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/5 bg-card py-3 text-sm font-bold text-foreground"
            >
              Ver todos os recordes
              <ChevronRight size={14} />
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="charts" className="mt-4 space-y-4">
          <div className="flex items-center justify-end gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                className={`rounded-full px-3 py-1 text-[12px] font-bold transition-colors ${
                  days === r
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>

          {weight.data && <WeightChart data={weight.data} />}
          {steps.data && <StepsChart data={steps.data} />}

          <button
            type="button"
            onClick={() => setLogWeightOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus size={16} />
            Logar peso
          </button>
          <button
            type="button"
            onClick={() => setLogStepsOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus size={16} />
            Logar passos
          </button>

          <div className="rounded-2xl border border-white/5 bg-card p-4 text-center">
            <Flame size={20} className="mx-auto text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">
              Para evolução de força e cardio, abra o histórico de treino.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <LogWeightDrawer open={logWeightOpen} onClose={() => setLogWeightOpen(false)} />
      <LogStepsDrawer open={logStepsOpen} onClose={() => setLogStepsOpen(false)} />
    </div>
  );
}
