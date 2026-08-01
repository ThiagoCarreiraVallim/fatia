/** Mesma regra de `apps/web/src/app/(app)/goals/page.tsx` — não pode divergir. */
export function formatValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return '—';
  const rounded = Math.abs(value) < 10 ? value.toFixed(1) : Math.round(value).toString();
  return unit === '%' ? `${rounded}%` : rounded;
}

/** Dias que faltam até o prazo, ou `null` quando a meta não tem prazo. */
export function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000)));
}
