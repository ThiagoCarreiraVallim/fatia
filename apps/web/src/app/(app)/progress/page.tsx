'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Flame, Footprints, Plus, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { progressApi } from '@/lib/api/progress';
import { WeightChart } from '@/components/progress/weight-chart';
import { StepsChart } from '@/components/progress/steps-chart';
import { LogWeightDrawer } from '@/components/progress/log-weight-drawer';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';

const RANGES = [14, 30, 90, 180] as const;

function StatCard({
  label,
  value,
  trend,
  sub,
  className,
}: {
  label: string;
  value: string;
  trend?: number;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/5 bg-card p-4 ${className ?? ''}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end gap-1.5">
        <p className="text-[20px] font-bold text-foreground tabular-nums leading-none">{value}</p>
        {trend !== undefined &&
          trend !== 0 &&
          (trend < 0 ? (
            <TrendingDown size={16} className="mb-0.5 text-primary" />
          ) : (
            <TrendingUp size={16} className="mb-0.5 text-amber-400" />
          ))}
      </div>
      {sub && <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-card" />
        <div className="h-20 animate-pulse rounded-xl bg-card" />
      </div>
      <div className="h-52 animate-pulse rounded-xl bg-card" />
    </div>
  );
}

function LogButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <Plus size={16} />
      {label}
    </button>
  );
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

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header className="flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-foreground">Progresso</h1>
        <div className="flex items-center gap-1">
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
      </header>

      <Tabs defaultValue="weight" className="w-full">
        <TabsList className="grid w-full grid-cols-4 rounded-xl bg-muted p-1">
          <TabsTrigger
            value="weight"
            className="rounded-lg text-[11px] data-[state=active]:bg-card data-[state=active]:font-bold data-[state=active]:text-primary"
          >
            <Scale size={13} className="mr-1" />
            Peso
          </TabsTrigger>
          <TabsTrigger
            value="steps"
            className="rounded-lg text-[11px] data-[state=active]:bg-card data-[state=active]:font-bold data-[state=active]:text-primary"
          >
            <Footprints size={13} className="mr-1" />
            Passos
          </TabsTrigger>
          <TabsTrigger
            value="strength"
            className="rounded-lg text-[11px] data-[state=active]:bg-card data-[state=active]:font-bold data-[state=active]:text-primary"
          >
            <Dumbbell size={13} className="mr-1" />
            Força
          </TabsTrigger>
          <TabsTrigger
            value="cardio"
            className="rounded-lg text-[11px] data-[state=active]:bg-card data-[state=active]:font-bold data-[state=active]:text-primary"
          >
            <Flame size={13} className="mr-1" />
            Cardio
          </TabsTrigger>
        </TabsList>

        {/* ── PESO ─────────────────────────────────────────────── */}
        <TabsContent value="weight" className="mt-4 space-y-4">
          {weight.isLoading && <LoadingSkeleton />}
          {weight.data && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Peso atual"
                  value={
                    weight.data.currentWeightKg !== null
                      ? `${weight.data.currentWeightKg.toFixed(1)} kg`
                      : '—'
                  }
                />
                <StatCard
                  label={`Variação (${days}d)`}
                  value={
                    weight.data.currentWeightKg !== null
                      ? `${weight.data.totalDeltaKg > 0 ? '+' : ''}${weight.data.totalDeltaKg.toFixed(1)} kg`
                      : '—'
                  }
                  trend={weight.data.totalDeltaKg}
                />
              </div>
              <WeightChart data={weight.data} />
              {weight.data.weeklyAverages.length > 0 && (
                <div className="rounded-xl border border-white/5 bg-card overflow-hidden">
                  <div className="px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-muted-foreground border-b border-white/5">
                    Médias semanais
                  </div>
                  <ul className="divide-y divide-white/5">
                    {weight.data.weeklyAverages.map((w) => (
                      <li key={w.weekStart} className="flex justify-between px-4 py-3 text-[13px]">
                        <span className="text-muted-foreground">
                          Sem. de {w.weekStart.slice(5)}
                        </span>
                        <span className="tabular-nums text-foreground">
                          {w.avgKg.toFixed(1)} kg
                          {w.deltaKg !== null && (
                            <span
                              className={`ml-2 text-[11px] ${
                                w.deltaKg < 0 ? 'text-primary' : 'text-amber-400'
                              }`}
                            >
                              {w.deltaKg > 0 ? '+' : ''}
                              {w.deltaKg.toFixed(2)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <LogButton label="Logar peso" onClick={() => setLogWeightOpen(true)} />
        </TabsContent>

        {/* ── PASSOS ───────────────────────────────────────────── */}
        <TabsContent value="steps" className="mt-4 space-y-4">
          {steps.isLoading && <LoadingSkeleton />}
          {steps.data && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Média/dia"
                  value={Math.round(steps.data.averageDaily).toLocaleString('pt-BR')}
                />
                <StatCard
                  label="Dias na meta"
                  value={`${steps.data.daysWithGoalReached}/${steps.data.points.length}`}
                />
              </div>
              {steps.data.bestDay && (
                <StatCard
                  label="Melhor dia"
                  value={`${steps.data.bestDay.steps.toLocaleString('pt-BR')} passos`}
                  sub={steps.data.bestDay.date}
                  className="col-span-2"
                />
              )}
              <StepsChart data={steps.data} />
            </>
          )}
          <LogButton label="Logar passos" onClick={() => setLogStepsOpen(true)} />
        </TabsContent>

        {/* ── FORÇA ────────────────────────────────────────────── */}
        <TabsContent value="strength" className="mt-4">
          <div className="space-y-3 rounded-xl border border-white/5 bg-card p-8 text-center">
            <Dumbbell size={32} className="mx-auto text-muted-foreground" />
            <p className="text-[14px] font-semibold text-foreground">Evolução de força</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Use o assistente com{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-primary">
                get_strength_progress
              </code>{' '}
              ou navegue pelo histórico de treino para ver detalhes.
            </p>
          </div>
        </TabsContent>

        {/* ── CARDIO ───────────────────────────────────────────── */}
        <TabsContent value="cardio" className="mt-4">
          <div className="space-y-3 rounded-xl border border-white/5 bg-card p-8 text-center">
            <Flame size={32} className="mx-auto text-muted-foreground" />
            <p className="text-[14px] font-semibold text-foreground">Evolução de cardio</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Selecione um exercício de cardio para ver evolução de duração, distância ou pace.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <LogWeightDrawer open={logWeightOpen} onClose={() => setLogWeightOpen(false)} />
      <LogStepsDrawer open={logStepsOpen} onClose={() => setLogStepsOpen(false)} />
    </div>
  );
}
