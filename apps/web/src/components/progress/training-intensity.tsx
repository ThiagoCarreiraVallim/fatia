'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
import { workoutApi, type WorkoutSession } from '@/lib/api/workout';

const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Map intensity 0-4 from session duration + volume.
function intensityFor(sessions: WorkoutSession[]): number {
  if (sessions.length === 0) return 0;
  // Soma duração em minutos + volume*0.001 como score.
  let score = 0;
  for (const s of sessions) {
    if (s.completedAt) {
      const durMs = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
      score += Math.max(0, durMs / 60000);
    }
    for (const set of s.sets ?? []) {
      if (set.weightKg && set.reps) score += (set.weightKg * set.reps) / 100;
      if (set.durationSeconds) score += set.durationSeconds / 60;
    }
  }
  if (score === 0) return 1; // teve sessão mas sem set logado
  if (score < 20) return 1;
  if (score < 50) return 2;
  if (score < 100) return 3;
  return 4;
}

function HeatmapCell({ intensity }: { intensity: number }) {
  const styles = ['bg-muted/40', 'bg-primary/20', 'bg-primary/40', 'bg-primary/70', 'bg-primary'];
  return (
    <div
      className={`aspect-square rounded-md ${styles[intensity]} ${
        intensity >= 3 ? 'shadow-[0_0_8px_hsl(var(--primary)/0.4)]' : ''
      }`}
    />
  );
}

export function TrainingIntensity() {
  // Janela: últimos 14 dias (2 linhas × 7 colunas)
  const fromIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return dateKey(d);
  }, []);

  const sessions = useQuery({
    queryKey: ['workout', 'sessions', 'heatmap', fromIso],
    queryFn: () => workoutApi.listSessions({ limit: 100 }),
  });

  const grid = useMemo(() => {
    const sessionsByDay = new Map<string, WorkoutSession[]>();
    if (sessions.data) {
      for (const s of sessions.data) {
        const key = s.startedAt.slice(0, 10);
        const arr = sessionsByDay.get(key) ?? [];
        arr.push(s);
        sessionsByDay.set(key, arr);
      }
    }
    const cells: number[] = [];
    const start = new Date(`${fromIso}T12:00:00Z`);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d);
      cells.push(intensityFor(sessionsByDay.get(key) ?? []));
    }
    return cells;
  }, [sessions.data, fromIso]);

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Intensidade do Treino</h3>
        <Calendar size={16} className="text-muted-foreground" />
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {DAYS.map((d, i) => (
          <p key={`day-${i}`} className="text-center text-[10px] font-bold text-muted-foreground">
            {d}
          </p>
        ))}
        {grid.map((v, i) => (
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
  );
}
