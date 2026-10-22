'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
import { addDays, format, startOfDay, startOfWeek, subWeeks } from 'date-fns';
import { workoutApi, type WorkoutSession } from '@fatia/api-client';

const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Dia local — `toISOString().slice(0, 10)` punha o treino das 21h no dia seguinte. */
function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
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

export interface HeatmapCell {
  date: string;
  intensity: number;
  future: boolean;
}

/**
 * Duas semanas de calendário, de domingo a sábado: a da semana passada e a
 * atual. A janela era "os últimos 14 dias", que começa em qualquer dia da
 * semana — e o cabeçalho D S T Q Q S S ficava em cima dos dias errados.
 */
export function heatmapCells(sessions: WorkoutSession[], today: Date): HeatmapCell[] {
  const byDay = new Map<string, WorkoutSession[]>();
  for (const s of sessions) {
    const key = dateKey(new Date(s.startedAt));
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const start = startOfWeek(subWeeks(today, 1));
  const todayStart = startOfDay(today);
  return Array.from({ length: 14 }, (_, i) => {
    const day = addDays(start, i);
    const date = dateKey(day);
    return { date, intensity: intensityFor(byDay.get(date) ?? []), future: day > todayStart };
  });
}

function HeatmapCellView({ cell }: { cell: HeatmapCell }) {
  const styles = ['bg-muted/40', 'bg-primary/20', 'bg-primary/40', 'bg-primary/70', 'bg-primary'];
  const label = new Date(`${cell.date}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
  return (
    <div
      title={label}
      // `aria-label` só vale em elemento com papel; a célula é uma figura.
      role={cell.future ? undefined : 'img'}
      aria-label={cell.future ? undefined : `${label}: ${INTENSITY_LABEL[cell.intensity]}`}
      aria-hidden={cell.future || undefined}
      className={`aspect-square rounded-md ${
        cell.future ? 'border border-dashed border-white/10' : styles[cell.intensity]
      } ${cell.intensity >= 3 ? 'shadow-[0_0_8px_hsl(var(--primary)/0.4)]' : ''}`}
    />
  );
}

const INTENSITY_LABEL = ['sem treino', 'leve', 'moderado', 'forte', 'intenso'];

export function TrainingIntensity() {
  // A API devolve no máximo 50 sessões, mais recentes primeiro: sobra para duas semanas.
  const sessions = useQuery({
    queryKey: ['workout', 'sessions', 'heatmap'],
    queryFn: () => workoutApi.listSessions({ limit: 50 }),
  });

  const grid = useMemo(() => heatmapCells(sessions.data ?? [], new Date()), [sessions.data]);

  return (
    <div className="rounded-2xl border border-subtle bg-card p-4">
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
        {grid.map((cell) => (
          <HeatmapCellView key={cell.date} cell={cell} />
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
