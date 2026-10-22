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
import { describeSeries, formatInteger, type StepsProgress } from '@fatia/api-client';

export function StepsChart({ data }: { data: StepsProgress }) {
  if (!data.points.length) {
    return (
      <div className="rounded-xl border border-subtle bg-card p-6 text-center text-sm text-muted-foreground">
        Sem dados no período.
      </div>
    );
  }

  return (
    // O leitor de tela não atravessa o SVG: ouve o resumo da série, como no app.
    <div
      role="img"
      aria-label={
        describeSeries({
          name: 'Passos por dia',
          labels: data.points.map((p) => p.date),
          values: data.points.map((p) => p.steps),
          format: (v) => `${formatInteger(v)} passos`,
        }) +
        (data.goalTarget !== null
          ? ` Meta diária de ${formatInteger(data.goalTarget)} passos.`
          : '')
      }
      className="rounded-xl border border-subtle bg-card p-4"
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
            tickFormatter={(v: number) => formatInteger(v)}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [formatInteger(v), 'Passos']}
          />
          {data.goalTarget !== null && (
            <ReferenceLine
              y={data.goalTarget}
              stroke="hsl(var(--primary))"
              strokeDasharray="3 3"
              label={{
                value: `Meta ${formatInteger(data.goalTarget)}`,
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
