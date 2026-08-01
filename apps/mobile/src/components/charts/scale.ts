/**
 * Escalas e ticks dos gráficos do app.
 *
 * Funções puras, sem JSX e sem nada de React Native, porque é aqui que mora o
 * risco da ADR 012: ao abrir mão do `recharts` o cálculo de domínio, passo de
 * eixo e arredondamento passou a ser nosso. Separado assim, dá para testar em
 * ambiente node — o harness de teste do app não monta componente.
 */

export type Domain = readonly [number, number];

/** `null` quando não há valor finito — série vazia não tem domínio. */
export function extent(values: readonly number[]): Domain | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min > max) return null;
  return [min, max];
}

/** Folga acima e abaixo, como o `dataMin - 1 / dataMax + 1` do gráfico de peso. */
export function padDomain([min, max]: Domain, amount: number): Domain {
  return [min - amount, max + amount];
}

/** Barra medida a partir de zero mente menos sobre proporção do que barra cortada. */
export function withZero([min, max]: Domain): Domain {
  return [Math.min(0, min), Math.max(0, max)];
}

export function includeValue([min, max]: Domain, value: number): Domain {
  if (!Number.isFinite(value)) return [min, max];
  return [Math.min(min, value), Math.max(max, value)];
}

/**
 * Série constante (ou de um ponto só) tem domínio de altura zero, e toda divisão
 * pela amplitude vira `Infinity`. Abrir um mínimo mantém a linha no meio da área
 * em vez de sumir na borda.
 */
export function ensureSpan([min, max]: Domain, minSpan = 1): Domain {
  const span = max - min;
  if (span >= minSpan) return [min, max];
  const middle = (min + max) / 2;
  return [middle - minSpan / 2, middle + minSpan / 2];
}

export function linearScale(domain: Domain, range: Domain): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  const ratio = (r1 - r0) / span;
  return (value) => r0 + (value - d0) * ratio;
}

function niceNumber(value: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let nice: number;
  if (round) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else {
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
  }
  return nice * 10 ** exponent;
}

export function decimalsFor(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  return Math.max(0, -Math.floor(Math.log10(step)));
}

/**
 * Ticks "redondos" dentro do domínio (algoritmo de Heckbert). O passo é
 * arredondado para 1, 2 ou 5 vezes uma potência de dez, e cada tick é reduzido à
 * casa decimal do passo — sem isso a soma acumulada gera rótulo `72.30000000001`.
 */
export function niceTicks(domain: Domain, count = 4): number[] {
  const [min, max] = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const step = niceNumber((max - min) / Math.max(1, count - 1), true);
  const decimals = decimalsFor(step);
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  // Tolerância relativa ao passo: o acumulado em ponto flutuante erra na última
  // casa e, sem ela, o tick do topo desaparece de vez em quando.
  for (let value = first; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toFixed(decimals)));
  }
  return ticks;
}

/** Posição horizontal de cada ponto de uma linha, da borda esquerda à direita. */
export function pointPositions(count: number, width: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [width / 2];
  const step = width / (count - 1);
  return Array.from({ length: count }, (_, index) => index * step);
}

export interface Band {
  /** Centro da faixa do índice. */
  center: (index: number) => number;
  /** Largura da barra já descontado o espaçamento. */
  width: number;
}

export function bandScale(count: number, width: number, padding = 0.25): Band {
  if (count <= 0) return { center: () => 0, width: 0 };
  const slot = width / count;
  return {
    center: (index) => slot * index + slot / 2,
    // Piso de 1px: com 180 dias no gráfico de passos a barra some por completo.
    width: Math.max(1, slot * (1 - padding)),
  };
}

/**
 * Índices de rótulo do eixo X que cabem sem sobrepor. Sempre inclui o primeiro e
 * o último — a ponta da série é a informação que mais se procura no eixo.
 */
export function pickTickIndexes(count: number, max: number): number[] {
  if (count <= 0 || max <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil((count - 1) / Math.max(1, max - 1));
  const indexes: number[] = [];
  for (let index = 0; index < count - 1; index += step) indexes.push(index);
  const last = count - 1;
  // O penúltimo escolhido pode encostar no último; nesse caso ele cede o lugar.
  if (indexes.length > 0 && last - indexes[indexes.length - 1] < step / 2) indexes.pop();
  indexes.push(last);
  return indexes;
}
