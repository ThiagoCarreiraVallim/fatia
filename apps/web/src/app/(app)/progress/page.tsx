'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { progressApi } from '@/lib/api/progress';
import { WeightChart } from '@/components/progress/weight-chart';
import { StepsChart } from '@/components/progress/steps-chart';
import { StrengthChart } from '@/components/progress/strength-chart';
import { CardioChart } from '@/components/progress/cardio-chart';
import { PersonalRecords } from '@/components/progress/personal-records';
import { TrainingIntensity } from '@/components/progress/training-intensity';
import { ConsistencyCard } from '@/components/progress/consistency-card';
import { LogWeightDrawer } from '@/components/progress/log-weight-drawer';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RANGES = [14, 30, 90, 180] as const;

function WeightBarMini({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        Logue pelo menos dois pesos para ver a evolução.
      </p>
    );
  }
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
              className={`w-full rounded-sm ${
                isLast ? 'bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]' : 'bg-muted/80'
              }`}
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
  const weightSeries = realWeightPoints.slice(-6).map((p) => p.weightKg);
  const currentWeight = weight.data?.currentWeightKg;
  const weightDelta = weight.data?.totalDeltaKg ?? 0;

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
                    {currentWeight !== null && currentWeight !== undefined
                      ? currentWeight.toFixed(1)
                      : '—'}{' '}
                    <span className="text-base font-bold">kg</span>
                  </p>
                  {weight.data && realWeightPoints.length >= 2 && (
                    <span
                      className={`flex items-center gap-0.5 text-xs font-bold ${
                        weightDelta < 0 ? 'text-primary' : 'text-amber-400'
                      }`}
                    >
                      {weightDelta < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                      {weightDelta > 0 ? '+' : ''}
                      {weightDelta.toFixed(1)} kg
                    </span>
                  )}
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

          <ConsistencyCard />

          <TrainingIntensity />

          <PersonalRecords />
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

          <StrengthChart days={days} />
          <CardioChart days={days} />

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
        </TabsContent>
      </Tabs>

      <LogWeightDrawer open={logWeightOpen} onClose={() => setLogWeightOpen(false)} />
      <LogStepsDrawer open={logStepsOpen} onClose={() => setLogStepsOpen(false)} />
    </div>
  );
}
