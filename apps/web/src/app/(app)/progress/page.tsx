'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { progressApi } from '@/lib/api/progress';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  return format(new Date(d + 'T12:00:00'), 'dd/MM', { locale: ptBR });
}

const DAY_OPTIONS = [14, 30, 90] as const;

function DayRangeButtons({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {DAY_OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            value === d
              ? 'bg-blue-600 text-white'
              : 'bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

function Skeleton() {
  return <div className="h-48 animate-pulse rounded bg-muted" />;
}

/* ── Peso tab ─────────────────────────────────────────────────────────────── */
function WeightTab({ days }: { days: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['progress', 'weight', days],
    queryFn: () => progressApi.weightProgress(days),
  });

  const [showForm, setShowForm] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  const logWeight = useMutation({
    mutationFn: (kg: number) =>
      progressApi.logWeight({ weightKg: kg, loggedAt: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress', 'weight'] });
      setShowForm(false);
      setWeightInput('');
    },
  });

  const chartData = data?.points.map((p) => ({ date: fmtDate(p.date), kg: p.weightKg })) ?? [];

  return (
    <div className="space-y-4">
      {data?.delta != null && (
        <p className="text-sm text-muted-foreground">
          {data.delta > 0 ? '+' : ''}
          {data.delta.toFixed(1)} kg nos últimos {days} dias
        </p>
      )}

      {isLoading && <Skeleton />}

      {!isLoading && chartData.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum registro de peso encontrado.
        </p>
      )}

      {!isLoading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 12 }}
              formatter={(v: number) => [`${v} kg`, 'Peso']}
            />
            <Line
              type="monotone"
              dataKey="kg"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full rounded-md border border-dashed border-blue-500/50 py-2 text-sm text-blue-400 hover:border-blue-500 hover:text-blue-300"
        >
          + Registrar peso
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const kg = parseFloat(weightInput);
            if (!isNaN(kg) && kg > 0) logWeight.mutate(kg);
          }}
          className="flex items-center gap-2 rounded-md border bg-card p-3"
        >
          <input
            type="number"
            step="0.1"
            min="20"
            max="300"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="Ex.: 78.5"
            className="flex-1 rounded bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <span className="text-sm text-muted-foreground">kg</span>
          <button
            type="submit"
            disabled={logWeight.isPending}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </form>
      )}

      {logWeight.error && (
        <p className="text-xs text-rose-500">{(logWeight.error as Error).message}</p>
      )}
    </div>
  );
}

/* ── Força tab ────────────────────────────────────────────────────────────── */
function StrengthTab({ days }: { days: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['progress', 'volume', days],
    queryFn: () => progressApi.volumeProgress(days),
  });

  const chartData =
    data?.weeks.map((w) => ({ week: fmtDate(w.weekStart), volume: Math.round(w.volume) })) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Volume semanal de treino (kg)</p>

      {isLoading && <Skeleton />}

      {!isLoading && chartData.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum dado de treino encontrado.
        </p>
      )}

      {!isLoading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 12 }}
              formatter={(v: number) => [`${v} kg`, 'Volume']}
            />
            <Bar dataKey="volume" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ── Cardio tab ───────────────────────────────────────────────────────────── */
function CardioTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-muted p-8 text-center text-sm text-muted-foreground">
        <p className="font-medium">Progresso de cardio</p>
        <p className="mt-1 text-xs">
          Selecione um exercício de cardio para visualizar o progresso.
        </p>
        <p className="mt-3 text-xs opacity-70">
          💡 Dica: Use o Claude para analisar seu progresso de cardio com linguagem natural.
        </p>
      </div>
    </div>
  );
}

/* ── Passos tab ───────────────────────────────────────────────────────────── */
function StepsTab({ days }: { days: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['progress', 'steps', days],
    queryFn: () => progressApi.stepsProgress(days),
  });

  const [showForm, setShowForm] = useState(false);
  const [stepsInput, setStepsInput] = useState('');

  const logSteps = useMutation({
    mutationFn: (steps: number) => progressApi.logSteps({ date: todayIso(), steps }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress', 'steps'] });
      setShowForm(false);
      setStepsInput('');
    },
  });

  const chartData = data?.points.map((p) => ({ date: fmtDate(p.date), steps: p.steps })) ?? [];
  const goal = data?.dailyTarget ?? 0;

  return (
    <div className="space-y-4">
      {data && (
        <p className="text-sm text-muted-foreground">
          {data.daysHitGoal} dia{data.daysHitGoal !== 1 ? 's' : ''} com meta batida
          {days <= 30 ? ` nos últimos ${days} dias` : ''}
        </p>
      )}

      {isLoading && <Skeleton />}

      {!isLoading && chartData.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum registro de passos encontrado.
        </p>
      )}

      {!isLoading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 12 }}
              formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Passos']}
            />
            {goal > 0 && (
              <ReferenceLine
                y={goal}
                stroke="#f59e0b"
                strokeDasharray="4 2"
                label={{ value: 'Meta', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
              />
            )}
            <Bar dataKey="steps" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full rounded-md border border-dashed border-blue-500/50 py-2 text-sm text-blue-400 hover:border-blue-500 hover:text-blue-300"
        >
          + Registrar passos de hoje
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const s = parseInt(stepsInput, 10);
            if (!isNaN(s) && s > 0) logSteps.mutate(s);
          }}
          className="flex items-center gap-2 rounded-md border bg-card p-3"
        >
          <input
            type="number"
            step="1"
            min="0"
            value={stepsInput}
            onChange={(e) => setStepsInput(e.target.value)}
            placeholder="Ex.: 8500"
            className="flex-1 rounded bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <span className="text-sm text-muted-foreground">passos</span>
          <button
            type="submit"
            disabled={logSteps.isPending}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </form>
      )}

      {logSteps.error && (
        <p className="text-xs text-rose-500">{(logSteps.error as Error).message}</p>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function ProgressPage() {
  const [days, setDays] = useState<number>(30);

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Progresso</h1>
        <DayRangeButtons value={days} onChange={setDays} />
      </header>

      <Tabs.Root defaultValue="weight" className="space-y-4">
        <Tabs.List className="flex gap-1 rounded-lg bg-secondary p-1">
          {[
            { value: 'weight', label: 'Peso' },
            { value: 'strength', label: 'Força' },
            { value: 'cardio', label: 'Cardio' },
            { value: 'steps', label: 'Passos' },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="flex-1 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-colors data-[state=active]:bg-background data-[state=active]:text-foreground"
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="weight">
          <WeightTab days={days} />
        </Tabs.Content>

        <Tabs.Content value="strength">
          <StrengthTab days={days} />
        </Tabs.Content>

        <Tabs.Content value="cardio">
          <CardioTab />
        </Tabs.Content>

        <Tabs.Content value="steps">
          <StepsTab days={days} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
