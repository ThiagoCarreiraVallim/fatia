'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StepsProgress } from '@/lib/api/progress';

export function StepsChart({ data }: { data: StepsProgress }) {
  if (!data.points.length) {
    return (
      <div className="rounded-xl border border-white/5 bg-card p-6 text-center text-sm text-muted-foreground">
        Sem dados no período.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-card p-4">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Passos']}
          />
          {data.goalTarget !== null && (
            <ReferenceLine
              y={data.goalTarget}
              stroke="hsl(var(--primary))"
              strokeDasharray="3 3"
              label={{
                value: `Meta ${data.goalTarget}`,
                fontSize: 10,
                fill: 'hsl(var(--muted-foreground))',
              }}
            />
          )}
          <Bar dataKey="steps" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
