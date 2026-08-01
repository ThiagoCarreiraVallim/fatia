import { Circle, Path } from 'react-native-svg';
import { chartColors } from './colors';
import { ChartFrame } from './chart-frame';
import { describeSeries, formatDecimal, shortDate } from './format';
import { areaPath, monotonePath, type Point } from './path';
import { ensureSpan, extent, type Domain } from './scale';

/**
 * Linha (opcionalmente com área preenchida) — o desenho do `AreaChart` de peso e
 * dos `LineChart` de força e cardio do PWA.
 */
export function LineChart({
  name,
  labels,
  values,
  height = 180,
  area = false,
  domain,
  formatValue,
  formatLabel = shortDate,
  accessibilityLabel,
}: {
  /** Nome da série, usado no resumo em texto para o leitor de tela. */
  name: string;
  labels: readonly string[];
  values: readonly number[];
  height?: number;
  area?: boolean;
  domain?: Domain;
  /** Ausente deixa a `ChartFrame` derivar as casas decimais do passo do eixo. */
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  accessibilityLabel?: string;
}) {
  const resolvedDomain = domain ?? ensureSpan(extent(values) ?? [0, 1]);
  const describe = formatValue ?? ((value: number) => formatDecimal(value, 1));

  return (
    <ChartFrame
      labels={labels}
      domain={resolvedDomain}
      height={height}
      formatY={formatValue}
      formatX={formatLabel}
      accessibilityLabel={
        accessibilityLabel ?? describeSeries({ name, labels, values, format: describe })
      }
    >
      {(geometry) => {
        const points: Point[] = values.map((value, index) => ({
          x: geometry.xAt(index),
          y: geometry.yAt(value),
        }));

        return (
          <>
            {area && points.length > 0 ? (
              <Path
                d={areaPath(points, geometry.baseline)}
                fill={chartColors.primary}
                fillOpacity={0.18}
              />
            ) : null}
            <Path
              d={monotonePath(points)}
              stroke={chartColors.primary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Acima de ~40 pontos os círculos se encostam e viram uma faixa
                grossa; a linha sozinha lê melhor. */}
            {points.length <= 40
              ? points.map((point, index) => (
                  <Circle
                    key={`${labels[index] ?? index}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={3}
                    fill={chartColors.background}
                    stroke={chartColors.primary}
                    strokeWidth={2}
                  />
                ))
              : null}
          </>
        );
      }}
    </ChartFrame>
  );
}
