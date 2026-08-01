import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react-native';
import { workoutApi, type WorkoutSession } from '@fatia/api-client';
import { Card } from '@/components/ui';
import { chartColors, dayMonth } from '@/components/charts';

const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WINDOW_DAYS = 14;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Intensidade 0–4 a partir da duração da sessão somada ao volume das séries. */
function intensityFor(sessions: WorkoutSession[]): number {
  if (sessions.length === 0) return 0;
  let score = 0;
  for (const session of sessions) {
    if (session.completedAt) {
      const durationMs =
        new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
      score += Math.max(0, durationMs / 60000);
    }
    for (const set of session.sets ?? []) {
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

const LEVEL_OPACITY = [0, 0.2, 0.4, 0.7, 1];

/**
 * Réplica de `apps/web/src/components/progress/training-intensity.tsx` — o mapa
 * de calor de 14 dias, em duas linhas de sete.
 */
export function TrainingIntensity() {
  const fromIso = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - (WINDOW_DAYS - 1));
    return dateKey(date);
  }, []);

  const sessions = useQuery({
    queryKey: ['workout', 'sessions', 'heatmap', fromIso],
    queryFn: () => workoutApi.listSessions({ limit: 100 }),
  });

  const cells = useMemo(() => {
    const sessionsByDay = new Map<string, WorkoutSession[]>();
    for (const session of sessions.data ?? []) {
      const key = session.startedAt.slice(0, 10);
      const list = sessionsByDay.get(key) ?? [];
      list.push(session);
      sessionsByDay.set(key, list);
    }
    // Meio-dia UTC evita que o ajuste de horário de verão empurre um dia para o
    // anterior ao atravessar a janela.
    const start = new Date(`${fromIso}T12:00:00Z`);
    return Array.from({ length: WINDOW_DAYS }, (_, offset) => {
      const day = new Date(start);
      day.setDate(start.getDate() + offset);
      const key = dateKey(day);
      return { date: key, intensity: intensityFor(sessionsByDay.get(key) ?? []) };
    });
  }, [sessions.data, fromIso]);

  const rows = [cells.slice(0, 7), cells.slice(7, WINDOW_DAYS)];

  return (
    <Card className="p-4">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
          Intensidade do Treino
        </Text>
        <Calendar size={16} color={chartColors.mutedForeground} />
      </View>

      <View className="mt-3 flex-row gap-1.5">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <Text
            key={`weekday-${index}`}
            className="flex-1 text-center text-[10px] font-bold text-muted-foreground"
          >
            {initial}
          </Text>
        ))}
      </View>

      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} className="mt-1.5 flex-row gap-1.5">
          {row.map((cell) => (
            <View
              key={cell.date}
              accessible
              accessibilityLabel={`${dayMonth(cell.date)}: intensidade ${cell.intensity} de 4`}
              className="aspect-square flex-1 rounded-md bg-muted"
              style={
                cell.intensity > 0
                  ? {
                      backgroundColor: chartColors.primary,
                      opacity: LEVEL_OPACITY[cell.intensity],
                    }
                  : undefined
              }
            />
          ))}
        </View>
      ))}

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-[10px] font-bold text-muted-foreground">Leve</Text>
        <View className="flex-row gap-1">
          {LEVEL_OPACITY.slice(1).map((opacity) => (
            <View
              key={opacity}
              className="h-2 w-3 rounded-sm"
              style={{ backgroundColor: chartColors.primary, opacity }}
            />
          ))}
        </View>
        <Text className="text-[10px] font-bold text-muted-foreground">Intenso</Text>
      </View>
    </Card>
  );
}
