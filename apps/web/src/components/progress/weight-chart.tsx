'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WeightProgress } from '@/lib/api/progress';

export function WeightChart({ data }: { data: WeightProgress }) {
  if (!data.points.length) {
    return (
      <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
        Sem registros no período. Loga um peso pra começar.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card p-3">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            domain={['dataMin - 1', 'dataMax + 1']}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v.toFixed(1)} kg`, 'Peso']}
          />
          <Area
            type="monotone"
            dataKey="weightKg"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary) / 0.2)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
