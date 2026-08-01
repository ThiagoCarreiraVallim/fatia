import type { WeightProgress } from '@fatia/api-client';
import { Card, EmptyState } from '@/components/ui';
import {
  LineChart,
  describeSeries,
  ensureSpan,
  extent,
  formatDecimal,
  padDomain,
} from '@/components/charts';

/**
 * Réplica de `apps/web/src/components/progress/weight-chart.tsx` — a área com
 * curva monotônica, incluindo a folga de 1 kg acima e abaixo que o PWA pede ao
 * `recharts` com `dataMin - 1 / dataMax + 1`.
 */
export function WeightChart({ data }: { data: WeightProgress }) {
  if (!data.points.length) {
    return (
      <Card>
        <EmptyState
          title="Sem registros no período."
          description="Loga um peso pra começar."
          className="py-8"
        />
      </Card>
    );
  }

  const labels = data.points.map((point) => point.date);
  const values = data.points.map((point) => point.weightKg);
  const domain = ensureSpan(padDomain(extent(values) ?? [0, 1], 1));

  return (
    <Card className="p-4">
      <LineChart
        name="Peso corporal"
        labels={labels}
        values={values}
        domain={domain}
        height={220}
        area
        formatValue={(value) => formatDecimal(value, 1)}
        accessibilityLabel={describeSeries({
          name: 'Peso corporal',
          labels,
          values,
          format: (value) => `${formatDecimal(value, 1)} kg`,
        })}
      />
    </Card>
  );
}
