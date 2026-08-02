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
 * "19 mai" a partir de um ISO (`YYYY-MM-DD` ou datetime completo).
 *
 * Corta a string em vez de passar por `new Date(iso).toLocaleDateString()` de
 * propósito. A API deriva a data do gráfico de peso em UTC
 * (`progress.service.ts`: `loggedAt.toISOString().slice(0, 10)`); formatar aqui
 * no fuso do navegador faria uma pesagem de fim de noite aparecer num dia na
 * lista e noutro no gráfico — e alguém apagaria a "duplicata" que é o mesmo
 * registro.
 */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return '—';
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return '—';
  return `${iso.slice(8, 10)} ${MONTHS_SHORT[month - 1]}`;
}

/**
 * "14:07" a partir do `loggedAt`.
 *
 * Ao contrário de `dayMonth`, aqui o fuso do navegador é o certo: a hora existe
 * para separar dois copos de 500 mL do mesmo dia, e "às 14h" só quer dizer
 * alguma coisa no relógio de quem registrou. O **dia** continua vindo do campo
 * `date`, que o servidor calcula no fuso do perfil — então a linha não muda de
 * dia por causa desta formatação.
 */
export function hourMinute(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** 12500 → "12.500". Separador de milhar de pt-BR. */
export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return (
    sign +
    Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  );
}

/**
 * 78.5 → "78,5", só para exibir.
 *
 * O valor que volta para o `<input type="number">` na edição continua sendo
 * `String(n)`: um input numérico rejeita "78,5" e apagaria o campo.
 */
export function formatDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits).replace('.', ',');
}
