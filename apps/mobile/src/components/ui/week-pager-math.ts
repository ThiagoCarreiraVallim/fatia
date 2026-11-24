import { shiftWeek } from '@fatia/api-client';

/**
 * As contas da faixa de dias arrastável (#479), sem tela: cada página é uma
 * semana, de segunda a domingo, identificada pela segunda-feira (YYYY-MM-DD).
 */

const DAY_MS = 86_400_000;

/** Meio-dia UTC: o dia da semana não depende do fuso do aparelho. */
function noonUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function addDays(iso: string, days: number): string {
  return new Date(noonUtc(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** A segunda-feira da semana do dia. */
export function mondayOf(iso: string): string {
  return addDays(iso, -((noonUtc(iso).getUTCDay() + 6) % 7));
}

/** As páginas: `back` semanas antes da de `today` até `forward` depois. */
export function weekPages(today: string, range: { back: number; forward: number }): string[] {
  const start = mondayOf(today);
  return Array.from({ length: range.back + range.forward + 1 }, (_, i) =>
    addDays(start, (i - range.back) * 7),
  );
}

/** A página do dia; fora da faixa, a ponta mais perto. */
export function pageIndexOf(pages: string[], date: string): number {
  const monday = mondayOf(date);
  if (monday <= pages[0]!) return 0;
  if (monday >= pages[pages.length - 1]!) return pages.length - 1;
  return Math.round((noonUtc(monday).getTime() - noonUtc(pages[0]!).getTime()) / (7 * DAY_MS));
}

/** O dia escolhido depois de arrastar da página `from` para a `to`: o mesmo dia da semana. */
export function moveAnchor(anchor: string, from: number, to: number): string {
  return shiftWeek(anchor, to - from);
}
