'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { progressApi } from '@/lib/api/progress';
import { WeightChart } from '@/components/progress/weight-chart';
import { StepsChart } from '@/components/progress/steps-chart';
import { LogWeightDrawer } from '@/components/progress/log-weight-drawer';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';

const RANGES = [14, 30, 90, 180] as const;

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
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Progresso</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`rounded-md px-2 py-1 text-xs ${
                days === r
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </header>

      <Tabs defaultValue="weight" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="weight">Peso</TabsTrigger>
          <TabsTrigger value="strength">Força</TabsTrigger>
          <TabsTrigger value="cardio">Cardio</TabsTrigger>
          <TabsTrigger value="steps">Passos</TabsTrigger>
        </TabsList>

        <TabsContent value="weight" className="space-y-3">
          <Button onClick={() => setLogWeightOpen(true)} className="w-full" variant="outline">
            <Plus size={16} /> Logar peso
          </Button>
          {weight.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {weight.data && (
            <>
              <WeightChart data={weight.data} />
              {weight.data.currentWeightKg !== null && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Atual</p>
                    <p className="text-lg font-semibold">
                      {weight.data.currentWeightKg.toFixed(1)} kg
                    </p>
                  </div>
                  <div className="rounded-md border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Δ período</p>
                    <p className="text-lg font-semibold">
                      {weight.data.totalDeltaKg > 0 ? '+' : ''}
                      {weight.data.totalDeltaKg.toFixed(1)} kg
                    </p>
                  </div>
                </div>
              )}
              {weight.data.weeklyAverages.length > 0 && (
                <div className="rounded-md border bg-card">
                  <div className="border-b p-3 text-sm font-medium">Médias semanais</div>
                  <ul className="divide-y text-sm">
                    {weight.data.weeklyAverages.map((w) => (
                      <li key={w.weekStart} className="flex justify-between p-3">
                        <span className="text-muted-foreground">
                          Semana de {w.weekStart.slice(5)}
                        </span>
                        <span className="tabular-nums">
                          {w.avgKg.toFixed(1)} kg
                          {w.deltaKg !== null && (
                            <span
                              className={`ml-2 text-xs ${
                                w.deltaKg < 0 ? 'text-emerald-500' : 'text-amber-500'
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
        </TabsContent>

        <TabsContent value="strength">
          <p className="text-sm text-muted-foreground">
            Selecione um exercício pra visualizar evolução. Use o Claude com{' '}
            <code className="rounded bg-muted px-1">get_strength_progress</code> ou navegue pelo
            histórico de treino para ver detalhes.
          </p>
        </TabsContent>

        <TabsContent value="cardio">
          <p className="text-sm text-muted-foreground">
            Selecione um exercício de cardio para ver evolução de duração, distância ou pace.
          </p>
        </TabsContent>

        <TabsContent value="steps" className="space-y-3">
          <Button onClick={() => setLogStepsOpen(true)} className="w-full" variant="outline">
            <Plus size={16} /> Logar passos
          </Button>
          {steps.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {steps.data && (
            <>
              <StepsChart data={steps.data} />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Média/dia</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {Math.round(steps.data.averageDaily).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Dias na meta</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {steps.data.daysWithGoalReached}/{steps.data.points.length}
                  </p>
                </div>
              </div>
              {steps.data.bestDay && (
                <div className="rounded-md border bg-card p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Melhor dia</p>
                  <p>
                    {steps.data.bestDay.date}:{' '}
                    <span className="font-semibold tabular-nums">
                      {steps.data.bestDay.steps.toLocaleString('pt-BR')}
                    </span>
                  </p>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <LogWeightDrawer open={logWeightOpen} onClose={() => setLogWeightOpen(false)} />
      <LogStepsDrawer open={logStepsOpen} onClose={() => setLogStepsOpen(false)} />
    </div>
  );
}
