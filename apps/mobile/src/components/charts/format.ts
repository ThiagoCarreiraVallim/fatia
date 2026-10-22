/**
 * Formatação de data e número dos gráficos, em pt-BR.
 *
 * Escrito à mão em vez de `toLocaleString('pt-BR')`: o Hermes é compilado sem
 * ICU completo em parte dos aparelhos Android, e lá o locale cai silenciosamente
 * para o padrão — o número aparece com separador americano só para alguns
 * usuários, que é o tipo de defeito que ninguém reproduz.
 */

import { dayMonth, describeSeries, formatDecimal, formatInteger } from '@fatia/api-client';

/**
 * Fatia a string ISO em vez de construir `Date`. `new Date('2026-07-29')` é lido
 * como meia-noite UTC e, em fuso negativo como o do Brasil, volta um dia — o
 * gráfico inteiro sairia deslocado.
 */
export function shortDate(iso: string): string {
  if (iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * "19 mai" a partir de um instante (`loggedAt` do peso), no dia do relógio de
 * quem registrou — o mesmo dia local em que a API agrupa o gráfico de peso.
 * `dayMonth` cortaria a string e daria o dia UTC: a pesagem das 21h30 em São
 * Paulo apareceria no dia seguinte. Réplica de `instantDayMonth` do PWA.
 */
export function instantDayMonth(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return dayMonth(`${parsed.getFullYear()}-${month}-${day}`);
}

// Os mesmos do PWA, num lugar só (`@fatia/api-client`, `format.ts`).
export { dayMonth, describeSeries, formatDecimal, formatInteger };

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
