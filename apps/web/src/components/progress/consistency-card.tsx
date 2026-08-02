'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workoutApi } from '@fatia/api-client';

const WINDOW_DAYS = 30;

export function ConsistencyCard() {
  const sessions = useQuery({
    queryKey: ['workout', 'sessions', 'consistency'],
    queryFn: () => workoutApi.listSessions({ limit: 100 }),
  });

  // Uma única leitura do relógio, presa à montagem e declarada como dependência.
  // Antes o memo lia a hora duas vezes (`Date.now()` e `new Date()`) em momentos
  // diferentes e sem dependência nenhuma: a janela de 30 dias e os baldes de 7
  // dias podiam sair de instantes distintos, e o resultado mudava sozinho se o
  // React resolvesse recalcular o memo.
  const [nowMs] = useState(() => Date.now());

  const stats = useMemo(() => {
    if (!sessions.data) return null;
    const cutoff = nowMs - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const daysWithSession = new Set<string>();
    for (const s of sessions.data) {
      const t = new Date(s.startedAt).getTime();
      if (t < cutoff) continue;
      daysWithSession.add(s.startedAt.slice(0, 10));
    }
    const daysActive = daysWithSession.size;

    // 4 buckets de ~7 dias: % de dias com treino em cada semana
    const buckets = [0, 0, 0, 0];
    const now = new Date(nowMs);
    for (let bucketIdx = 0; bucketIdx < 4; bucketIdx++) {
      const start = new Date(now);
      start.setDate(now.getDate() - (bucketIdx + 1) * 7 + 1);
      let count = 0;
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + d);
        if (daysWithSession.has(day.toISOString().slice(0, 10))) count++;
      }
      buckets[3 - bucketIdx] = count;
    }

    return { daysActive, buckets };
  }, [sessions.data, nowMs]);

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-4">
      <p className="text-[10px] font-bold tracking-wide text-muted-foreground">CONSTÂNCIA</p>
      <p className="mt-1 text-xl font-extrabold text-foreground tabular-nums">
        {stats?.daysActive ?? 0}{' '}
        <span className="text-xs font-bold text-muted-foreground">/{WINDOW_DAYS} dias</span>
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1">
        {(stats?.buckets ?? [0, 0, 0, 0]).map((count, i) => {
          const pct = count / 7;
          const color = pct >= 0.5 ? 'bg-primary' : pct >= 0.25 ? 'bg-primary/40' : 'bg-muted';
          return <div key={i} className={`h-2.5 rounded-sm ${color}`} />;
        })}
      </div>
    </div>
  );
}
