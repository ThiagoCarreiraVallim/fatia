/**
 * Formatação de data e número dos gráficos, em pt-BR.
 *
 * Escrito à mão em vez de `toLocaleString('pt-BR')`: o Hermes é compilado sem
 * ICU completo em parte dos aparelhos Android, e lá o locale cai silenciosamente
 * para o padrão — o número aparece com separador americano só para alguns
 * usuários, que é o tipo de defeito que ninguém reproduz.
 */

const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/**
 * Fatia a string ISO em vez de construir `Date`. `new Date('2026-07-29')` é lido
 * como meia-noite UTC e, em fuso negativo como o do Brasil, volta um dia — o
 * gráfico inteiro sairia deslocado.
 */
export function shortDate(iso: string): string {
  if (iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function dayMonth(iso: string | null): string {
  if (!iso || iso.length < 10) return '—';
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return '—';
  return `${iso.slice(8, 10)} ${MONTHS_SHORT[month - 1]}`;
}

export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits).replace('.', ',');
}

/** Eixo de celular não comporta "12.500"; vira "12,5k". */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const thousands = value / 1000;
    return `${formatDecimal(thousands, abs >= 10_000 ? 0 : 1)}k`;
  }
  return formatInteger(value);
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Resumo da série em texto. Leitor de tela não atravessa SVG — sem isto o
 * gráfico é um retângulo mudo, e o dado só existe para quem enxerga.
 */
export function describeSeries(params: {
  name: string;
  labels: readonly string[];
  values: readonly number[];
  format: (value: number) => string;
}): string {
  const { name, labels, values, format } = params;
  if (values.length === 0) return `${name}: sem dados no período.`;
  const first = values[0];
  const last = values[values.length - 1];
  let min = first;
  let max = first;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const period =
    labels.length > 0 ? ` de ${dayMonth(labels[0])} a ${dayMonth(labels[labels.length - 1])}` : '';
  const trend =
    values.length > 1 ? ` Começou em ${format(first)} e terminou em ${format(last)}.` : '';
  return (
    `${name}: ${values.length} ${values.length === 1 ? 'registro' : 'registros'}${period}.` +
    `${trend} Menor valor ${format(min)}, maior valor ${format(max)}.`
  );
}
