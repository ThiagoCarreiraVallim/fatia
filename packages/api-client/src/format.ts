/**
 * Números e durações como a pessoa lê, iguais no PWA e no app.
 *
 * Vieram do app (`components/charts/format.ts`, `workout/session/format.ts` e
 * `dashboard/helpers.ts`), onde já tinham teste. O PWA tinha cópias à mão que
 * divergiam: "5.25 km" e "1.5 L" com ponto, onde o app mostra vírgula, e uma
 * leitura de duração que aceitava "1:75:00" e "1a".
 *
 * Escrito à mão em vez de `toLocaleString('pt-BR')`: o Hermes é compilado sem
 * ICU completo em parte dos aparelhos Android, e lá o locale cai silenciosamente
 * para o padrão americano.
 */

/** 12500 → "12.500". */
export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 78.45 → "78,5". Só para exibir: um `<input type="number">` recusa a vírgula. */
export function formatDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits).replace('.', ',');
}

/** Água: "350 mL" e, a partir de um litro, "1,5 L" — o número em mL fica longo demais. */
export function formatVolume(ml: number): string {
  if (!Number.isFinite(ml)) return '—';
  if (Math.abs(ml) >= 1000) return `${formatDecimal(ml / 1000)} L`;
  return `${Math.round(ml)} mL`;
}

/**
 * `90` → 90 s, `1:30` → 90 s, `1:02:03` → 3723 s. `null` quando não dá para ler:
 * letra, minuto ou segundo acima de 59, ou partes demais.
 */
export function parseClock(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map((part) => part.trim());
  if (parts.some((part) => part !== '' && !/^\d+$/.test(part))) return null;

  if (parts.length === 1) {
    const seconds = Number(parts[0]);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (parts.length === 2) {
    const minutes = Number(parts[0] || 0);
    const seconds = Number(parts[1] || 0);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const hours = Number(parts[0] || 0);
    const minutes = Number(parts[1] || 0);
    const seconds = Number(parts[2] || 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return null;
    }
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}

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
] as const;

/**
 * "19 mai" a partir de um dia `YYYY-MM-DD`. Corta a string em vez de construir
 * `Date`: `new Date('2026-07-29')` é meia-noite UTC e, no Brasil, volta um dia.
 */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return '—';
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return '—';
  return `${iso.slice(8, 10)} ${MONTHS_SHORT[month - 1]}`;
}

/**
 * Resumo de uma série em texto, para o leitor de tela. Ele não atravessa o SVG
 * de um gráfico — sem isto o gráfico é um retângulo mudo, e o dado só existe
 * para quem enxerga. Veio do app (`components/charts/format.ts`); o PWA usa o
 * mesmo texto.
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
