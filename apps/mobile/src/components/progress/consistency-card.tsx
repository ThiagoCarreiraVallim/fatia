import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { workoutApi } from '@fatia/api-client';
import { Card } from '@/components/ui';
import { chartColors } from '@/components/charts';

const WINDOW_DAYS = 30;
const BUCKETS = 4;

/**
 * Réplica de `apps/web/src/components/progress/consistency-card.tsx`.
 */
export function ConsistencyCard() {
  const sessions = useQuery({
    queryKey: ['workout', 'sessions', 'consistency'],
    queryFn: () => workoutApi.listSessions({ limit: 100 }),
  });

  // Uma única leitura do relógio, presa à montagem e declarada como dependência.
  // Antes o memo lia a hora duas vezes (`Date.now()` e `new Date()`) em momentos
  // diferentes e sem dependência nenhuma: a janela de 30 dias e os blocos de 7
  // dias podiam sair de instantes distintos, e o resultado mudava sozinho se o
  // React resolvesse recalcular o memo.
  const [nowMs] = useState(() => Date.now());

  const stats = useMemo(() => {
    if (!sessions.data) return null;
    const cutoff = nowMs - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const daysWithSession = new Set<string>();
    for (const session of sessions.data) {
      if (new Date(session.startedAt).getTime() < cutoff) continue;
      daysWithSession.add(session.startedAt.slice(0, 10));
    }

    // 4 blocos de 7 dias: quantos dias com treino em cada semana.
    const buckets = [0, 0, 0, 0];
    const now = new Date(nowMs);
    for (let bucketIndex = 0; bucketIndex < BUCKETS; bucketIndex++) {
      const start = new Date(now);
      start.setDate(now.getDate() - (bucketIndex + 1) * 7 + 1);
      let count = 0;
      for (let offset = 0; offset < 7; offset++) {
        const day = new Date(start);
        day.setDate(start.getDate() + offset);
        if (daysWithSession.has(day.toISOString().slice(0, 10))) count++;
      }
      buckets[BUCKETS - 1 - bucketIndex] = count;
    }

    return { daysActive: daysWithSession.size, buckets };
  }, [sessions.data, nowMs]);

  const buckets = stats?.buckets ?? [0, 0, 0, 0];
  const daysActive = stats?.daysActive ?? 0;

  return (
    <Card className="p-4">
      <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">CONSTÂNCIA</Text>
      <Text className="mt-1 text-xl font-extrabold text-foreground">
        {daysActive}{' '}
        <Text className="text-xs font-bold text-muted-foreground">/{WINDOW_DAYS} dias</Text>
      </Text>
      <View
        className="mt-3 flex-row gap-1"
        accessible
        accessibilityLabel={`Constância: ${daysActive} de ${WINDOW_DAYS} dias com treino. Por semana, da mais antiga para a mais recente: ${buckets.join(', ')} dias.`}
      >
        {buckets.map((count, index) => {
          const ratio = count / 7;
          return (
            <View
              key={index}
              className="h-2.5 flex-1 rounded-sm bg-muted"
              // Opacidade em vez de `bg-primary/40`: a paleta usa `hsl(var(--x))`
              // sem canal alfa, então o modificador de opacidade do Tailwind não
              // resolve para uma cor válida no NativeWind.
              style={
                ratio >= 0.25
                  ? { backgroundColor: chartColors.primary, opacity: ratio >= 0.5 ? 1 : 0.4 }
                  : undefined
              }
            />
          );
        })}
      </View>
    </Card>
  );
}
