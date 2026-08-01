/**
 * Construção dos `d` de `<Path>`. Puro: recebe pontos já em coordenada de tela.
 */

export interface Point {
  x: number;
  y: number;
}

function round(value: number): number {
  // Duas casas bastam para pixel e encurtam bastante o atributo `d`, que no
  // React Native atravessa a ponte como string a cada render.
  return Number(value.toFixed(2));
}

export function linePath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ');
}

/**
 * Interpolação cúbica monotônica (Fritsch–Carlson) — é o `type="monotone"` que o
 * PWA usa no `recharts`. A propriedade que importa não é a curva ser bonita, é
 * ela nunca ultrapassar os valores dos pontos: uma spline comum inventa um pico
 * entre duas pesagens e faz parecer que houve um peso que nunca existiu.
 */
export function monotonePath(points: readonly Point[]): string {
  const n = points.length;
  if (n < 3) return linePath(points);

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const step = points[i + 1].x - points[i].x;
    // X fora de ordem ou repetido quebra a fórmula; a reta é o degrau seguro.
    if (step <= 0) return linePath(points);
    dx.push(step);
    slope.push((points[i + 1].y - points[i].y) / step);
  }

  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      tangent[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }

  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3;
    const c1x = points[i].x + third;
    const c1y = points[i].y + tangent[i] * third;
    const c2x = points[i + 1].x - third;
    const c2y = points[i + 1].y - tangent[i + 1] * third;
    d += ` C${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(points[i + 1].x)} ${round(points[i + 1].y)}`;
  }
  return d;
}

/** Mesma curva da linha, fechada até a base — a área preenchida sob a série. */
export function areaPath(points: readonly Point[], baselineY: number, smooth = true): string {
  if (points.length === 0) return '';
  const top = smooth ? monotonePath(points) : linePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${top} L${round(last.x)} ${round(baselineY)} L${round(first.x)} ${round(baselineY)} Z`;
}
