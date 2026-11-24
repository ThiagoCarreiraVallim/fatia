import { figureViewBox } from '../workout-cards';

/**
 * Qual lado do boneco mostrar e onde dar zoom (#474).
 *
 * O cabeçalho do exercício desenhava sempre a frente, inteira e pequena: em
 * remada ou stiff a figura mostrava o peito apagado e nenhum músculo pintado.
 * Aqui mora a escolha, pura e igual para web e app: o lado vem dos músculos, e
 * o recorte é um `viewBox` em volta deles, sobre o **mesmo** SVG completo do
 * `MuscleDiagram` (nunca uma silhueta simplificada).
 */

export type FigureSide = 'front' | 'back';

type Box = readonly [x0: number, y0: number, x1: number, y1: number];

/**
 * A caixa de cada músculo (`data-muscle`) em cada vista, nas coordenadas do
 * próprio SVG (`muscle-front.svg` 587 × 1137, `muscle-back.svg` 596 × 1133).
 * Tirada dos pontos dos traços de `apps/mobile/.../muscle-paths-*.ts`; o teste
 * `muscle-boxes.test.ts` do app recalcula e confere, para a tabela não ficar
 * para trás se o desenho mudar.
 */
export const MUSCLE_BOXES: Record<FigureSide, Readonly<Record<string, Box>>> = {
  front: {
    calves: [191, 809, 396, 1058],
    quadriceps: [181, 500, 406, 825],
    adductors: [227, 490, 360, 728],
    abdominals: [180, 301, 406, 634],
    forearms: [50, 330, 537, 518],
    biceps: [105, 244, 482, 409],
    chest: [168, 198, 418, 372],
    shoulders: [128, 185, 459, 304],
    neck: [197, 147, 389, 209],
  },
  back: {
    calves: [190, 776, 405, 1095],
    hamstrings: [198, 564, 397, 853],
    glutes: [185, 454, 410, 751],
    abductors: [193, 442, 402, 553],
    'lower back': [206, 391, 390, 467],
    forearms: [54, 373, 541, 521],
    triceps: [93, 252, 502, 451],
    neck: [257, 92, 339, 155],
    'middle back': [157, 203, 439, 298],
    lats: [183, 282, 412, 454],
    shoulders: [134, 192, 462, 278],
    traps: [167, 88, 428, 340],
  },
};

/** Músculo que só aparece num dos lados: é ele que decide a vista. */
function sideOf(muscle: string): FigureSide | null {
  const front = muscle in MUSCLE_BOXES.front;
  const back = muscle in MUSCLE_BOXES.back;
  if (front === back) return null;
  return front ? 'front' : 'back';
}

function vote(muscles: readonly string[]): number {
  let score = 0;
  for (const m of muscles) {
    const side = sideOf(m);
    if (side === 'front') score -= 1;
    if (side === 'back') score += 1;
  }
  return score;
}

/**
 * Frente ou costas. O principal decide; empatado (ombro, panturrilha, ou um de
 * cada lado), o secundário desempata; sem nada que decida, a frente, que é o
 * desenho de sempre.
 */
export function figureSideFor(
  primary: readonly string[],
  secondary: readonly string[] = [],
): FigureSide {
  const main = vote(primary);
  if (main !== 0) return main > 0 ? 'back' : 'front';
  return vote(secondary) > 0 ? 'back' : 'front';
}

/** Largura sobre altura do recorte: retrato, como o espaço ao lado do nome. */
export const FOCUS_ASPECT = 0.8;
/** Folga em volta dos músculos, em unidades do SVG. */
const FOCUS_PAD = 36;
/** Altura mínima do recorte: o pescoço sozinho viraria um borrão sem contexto. */
const FOCUS_MIN_HEIGHT = 360;

const round = (n: number) => Math.round(n * 10) / 10;

function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce<Box>(
    (acc, b) => [
      Math.min(acc[0], b[0]),
      Math.min(acc[1], b[1]),
      Math.max(acc[2], b[2]),
      Math.max(acc[3], b[3]),
    ],
    boxes[0]!,
  );
}

/**
 * O `viewBox` em volta dos músculos treinados, na proporção `FOCUS_ASPECT` e
 * dentro do quadro da figura (`figureViewBox`). O recorte usa o principal; se
 * nenhum principal aparece nesse lado, o secundário; sem nenhum, o boneco
 * inteiro.
 */
export function muscleFocusViewBox(
  side: FigureSide,
  primary: readonly string[],
  secondary: readonly string[] = [],
): string {
  const table = MUSCLE_BOXES[side];
  const pick = (list: readonly string[]) =>
    list.map((m) => table[m]).filter((b): b is Box => b != null);
  const target = union(pick(primary)) ?? union(pick(secondary));
  const frameBox = figureViewBox(side);
  if (!target) return frameBox;

  const [fx, fy, fw, fh] = frameBox.split(' ').map(Number) as [number, number, number, number];
  let w = target[2] - target[0] + 2 * FOCUS_PAD;
  let h = Math.max(target[3] - target[1] + 2 * FOCUS_PAD, FOCUS_MIN_HEIGHT);
  if (w / h > FOCUS_ASPECT) h = w / FOCUS_ASPECT;
  else w = h * FOCUS_ASPECT;
  if (h > fh) {
    h = fh;
    w = h * FOCUS_ASPECT;
  }
  if (w > fw) {
    w = fw;
    h = w / FOCUS_ASPECT;
  }
  const cx = (target[0] + target[2]) / 2;
  const cy = (target[1] + target[3]) / 2;
  const x = Math.min(Math.max(cx - w / 2, fx), fx + fw - w);
  const y = Math.min(Math.max(cy - h / 2, fy), fy + fh - h);
  return `${round(x)} ${round(y)} ${round(w)} ${round(h)}`;
}
