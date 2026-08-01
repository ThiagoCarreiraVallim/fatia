import type { StepsProgress } from '@fatia/api-client';
import { Card, EmptyState } from '@/components/ui';
import { BarChart, describeSeries, formatCompact, formatInteger } from '@/components/charts';

/**
 * Réplica de `apps/web/src/components/progress/steps-chart.tsx` — barras com a
 * linha de meta do dia.
 */
export function StepsChart({ data }: { data: StepsProgress }) {
  if (!data.points.length) {
    return (
      <Card>
        <EmptyState title="Sem dados no período." className="py-8" />
      </Card>
    );
  }

  const labels = data.points.map((point) => point.date);
  const values = data.points.map((point) => point.steps);

  return (
    <Card className="p-4">
      <BarChart
        name="Passos"
        labels={labels}
        values={values}
        height={220}
        // O eixo usa forma curta ("9,5k") porque "9.500" não cabe na calha de um
        // celular; o resumo em texto continua com o número cheio.
        formatValue={formatCompact}
        referenceValue={data.goalTarget}
        referenceLabel={data.goalTarget != null ? `Meta ${formatInteger(data.goalTarget)}` : ''}
        accessibilityLabel={
          describeSeries({
            name: 'Passos por dia',
            labels,
            values,
            format: (value) => `${formatInteger(value)} passos`,
          }) +
          (data.goalTarget != null
            ? ` Meta diária de ${formatInteger(data.goalTarget)} passos.`
            : '')
        }
      />
    </Card>
  );
}
