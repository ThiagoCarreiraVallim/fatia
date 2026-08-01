import { useState, type ReactNode } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Line, Text as SvgText } from 'react-native-svg';
import { chartColors } from './colors';
import {
  bandScale,
  decimalsFor,
  linearScale,
  niceTicks,
  pickTickIndexes,
  pointPositions,
  type Domain,
} from './scale';

/**
 * Moldura comum dos gráficos: mede a largura disponível, reserva a calha dos
 * rótulos, desenha grade e eixos e entrega ao filho a geometria já resolvida.
 *
 * Existe para que os cinco gráficos não repitam escala e eixo — que é o custo
 * que a ADR 012 aceitou ao trocar `recharts` por `react-native-svg` cru. A série
 * em si (linha, área, barra) é responsabilidade de quem usa.
 */

const AXIS_FONT_SIZE = 10;
const MARGIN_TOP = 10;
const MARGIN_RIGHT = 6;
const X_AXIS_HEIGHT = 18;
/** Aproximação da largura de um dígito nesse corpo — não há como medir texto em SVG. */
const CHAR_WIDTH = 6;

export interface ChartGeometry {
  left: number;
  top: number;
  plotWidth: number;
  plotHeight: number;
  /** Centro horizontal do índice: ponto da linha ou centro da barra. */
  xAt: (index: number) => number;
  /** Largura da barra; irrelevante quando `xKind` é `point`. */
  bandWidth: number;
  yAt: (value: number) => number;
  /** Base da área de plotagem, onde a barra e o preenchimento fecham. */
  baseline: number;
}

export function ChartFrame({
  labels,
  domain,
  height = 180,
  formatY,
  formatX,
  tickCount = 4,
  xKind = 'point',
  accessibilityLabel,
  children,
}: {
  labels: readonly string[];
  domain: Domain;
  height?: number;
  formatY?: (value: number) => string;
  formatX?: (label: string) => string;
  tickCount?: number;
  xKind?: 'point' | 'band';
  accessibilityLabel: string;
  children: (geometry: ChartGeometry) => ReactNode;
}) {
  const [width, setWidth] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  }

  const ticks = niceTicks(domain, tickCount);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const decimals = decimalsFor(step);
  const formatTick = formatY ?? ((value: number) => value.toFixed(decimals));
  const tickLabels = ticks.map(formatTick);
  const gutter =
    tickLabels.reduce((widest, label) => Math.max(widest, label.length), 1) * CHAR_WIDTH + 6;

  const plotWidth = Math.max(0, width - gutter - MARGIN_RIGHT);
  const plotHeight = Math.max(0, height - MARGIN_TOP - X_AXIS_HEIGHT);
  const yAt = linearScale(domain, [MARGIN_TOP + plotHeight, MARGIN_TOP]);
  const band = bandScale(labels.length, plotWidth);
  const points = pointPositions(labels.length, plotWidth);
  const xAt = (index: number) =>
    gutter + (xKind === 'band' ? band.center(index) : (points[index] ?? 0));

  const geometry: ChartGeometry = {
    left: gutter,
    top: MARGIN_TOP,
    plotWidth,
    plotHeight,
    xAt,
    bandWidth: band.width,
    yAt,
    baseline: MARGIN_TOP + plotHeight,
  };

  // O rótulo do eixo X ocupa ~5 caracteres ("29/07"); cada um precisa de folga
  // para não encostar no vizinho.
  const maxXLabels = Math.max(2, Math.floor(plotWidth / 46));
  const xIndexes = pickTickIndexes(labels.length, maxXLabels);

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((tick) => (
            <Line
              key={`grid-${tick}`}
              x1={gutter}
              x2={gutter + plotWidth}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke={chartColors.border}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ))}

          {ticks.map((tick, index) => (
            <SvgText
              key={`y-${tick}`}
              x={gutter - 4}
              y={yAt(tick) + AXIS_FONT_SIZE / 3}
              fontSize={AXIS_FONT_SIZE}
              fill={chartColors.mutedForeground}
              textAnchor="end"
            >
              {tickLabels[index]}
            </SvgText>
          ))}

          {xIndexes.map((index) => (
            <SvgText
              key={`x-${index}`}
              x={xAt(index)}
              y={height - 4}
              fontSize={AXIS_FONT_SIZE}
              fill={chartColors.mutedForeground}
              textAnchor="middle"
            >
              {formatX ? formatX(labels[index]) : labels[index]}
            </SvgText>
          ))}

          {children(geometry)}
        </Svg>
      ) : null}
    </View>
  );
}
