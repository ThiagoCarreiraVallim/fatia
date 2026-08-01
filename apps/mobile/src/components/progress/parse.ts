/**
 * Leitura do que a pessoa digitou nos campos de log.
 *
 * O teclado decimal do iOS em pt-BR entrega vírgula, e `Number('78,5')` é `NaN`
 * — o app aceitaria o toque em "Salvar" e não salvaria nada.
 */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
