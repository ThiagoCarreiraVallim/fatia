import { Line, Rect, Text as SvgText } from 'react-native-svg';
import { chartColors } from './colors';
import { ChartFrame } from './chart-frame';
import { describeSeries, formatCompact, shortDate } from './format';
import { ensureSpan, extent, includeValue, withZero } from './scale';

/**
 * Barras com linha de meta opcional — o `BarChart` + `ReferenceLine` de passos
 * do PWA.
 */
export function BarChart({
  name,
  labels,
  values,
  height = 180,
  formatValue = formatCompact,
  formatLabel = shortDate,
  referenceValue = null,
  referenceLabel,
  accessibilityLabel,
}: {
  name: string;
  labels: readonly string[];
  values: readonly number[];
  height?: number;
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  referenceValue?: number | null;
  referenceLabel?: string;
  accessibilityLabel?: string;
}) {
  const base = withZero(extent(values) ?? [0, 1]);
  const domain = ensureSpan(referenceValue != null ? includeValue(base, referenceValue) : base);

  const summary = describeSeries({ name, labels, values, format: formatValue });
  const withGoal =
    referenceValue != null ? `${summary} Meta diária de ${formatValue(referenceValue)}.` : summary;
  const description = accessibilityLabel ?? withGoal;

  return (
    <ChartFrame
      labels={labels}
      domain={domain}
      height={height}
      formatY={formatValue}
      formatX={formatLabel}
      xKind="band"
      accessibilityLabel={description}
    >
      {(geometry) => {
        const zero = geometry.yAt(0);
        return (
          <>
            {values.map((value, index) => {
              const y = geometry.yAt(value);
              const top = Math.min(y, zero);
              // Altura mínima de 2px: dia com poucos passos precisa continuar
              // distinguível de dia sem registro nenhum.
              const barHeight = Math.max(2, Math.abs(zero - y));
              return (
                <Rect
                  key={`${labels[index] ?? index}-${index}`}
                  x={geometry.xAt(index) - geometry.bandWidth / 2}
                  y={top}
                  width={geometry.bandWidth}
                  height={barHeight}
                  rx={Math.min(3, geometry.bandWidth / 2)}
                  fill={chartColors.primary}
                />
              );
            })}

            {referenceValue != null ? (
              <>
                <Line
                  x1={geometry.left}
                  x2={geometry.left + geometry.plotWidth}
                  y1={geometry.yAt(referenceValue)}
                  y2={geometry.yAt(referenceValue)}
                  stroke={chartColors.primary}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <SvgText
                  x={geometry.left + geometry.plotWidth}
                  y={geometry.yAt(referenceValue) - 4}
                  fontSize={9}
                  fill={chartColors.mutedForeground}
                  textAnchor="end"
                >
                  {referenceLabel ?? `Meta ${formatValue(referenceValue)}`}
                </SvgText>
              </>
            ) : null}
          </>
        );
      }}
    </ChartFrame>
  );
}
