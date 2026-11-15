import { MealType, ReminderKind, ReminderMode } from '@fatia/db';

/**
 * As regras dos lembretes pessoais (#389, pranchas Al-V2/V3), sem banco: quais
 * horários um lembrete tem no dia, se um deles venceu agora, o silêncio
 * noturno e o texto do aviso. O `ReminderService` e o `ReminderJob` só leem e
 * gravam; o que decide está aqui, e é o que os testes cobrem.
 */

/** "A cada N h": a prancha anda de 1 em 1, de 1 a 6. */
export const EVERY_HOURS_MIN = 1;
export const EVERY_HOURS_MAX = 6;
/** O seletor hh:mm da prancha anda de 5 em 5 minutos. */
export const MINUTE_STEP = 5;
/** Horários fixos por lembrete. */
export const TIMES_MAX = 8;
/** Lembretes por pessoa: passou disso é lista, não lembrete. */
export const REMINDERS_MAX = 30;
/**
 * Teto de lembretes que o servidor manda por pessoa por dia (#148), somando
 * todos os lembretes dela. Água de 2 em 2 h das 8h às 20h são 7; o resto do
 * dia cabe nos outros 5.
 */
export const DAILY_PUSH_CAP = 12;
/**
 * Horário vencido há até tantos minutos ainda sai: o job roda a cada minuto,
 * e um reinício da API não pode engolir o almoço. Depois disso, passou.
 */
export const CATCH_UP_MINUTES = 10;
/** Silêncio noturno padrão, 22:00–07:00 (prancha Al-V2). */
export const DEFAULT_QUIET = { enabled: true, from: 22 * 60, to: 7 * 60 } as const;
export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** `"12:30"` ↔ 750. Só horário válido e na grade de 5 minutos. */
export function parseClock(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  return minute % MINUTE_STEP === 0 ? minute : null;
}

export function formatClock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface ReminderRule {
  kind: ReminderKind;
  mode: ReminderMode;
  everyHours: number | null;
  fromMinute: number | null;
  toMinute: number | null;
  times: number[];
  weekdays: number[];
}

/**
 * Os horários do dia, em minutos. No intervalo, do primeiro ao último aviso a
 * cada N h — a mesma conta do "Salvar · N avisos por dia" da prancha.
 */
export function slotsOfDay(r: ReminderRule): number[] {
  if (r.mode === ReminderMode.TIMES) return [...r.times].sort((a, b) => a - b);
  if (r.everyHours == null || r.fromMinute == null || r.toMinute == null) return [];
  const out: number[] = [];
  for (let m = r.fromMinute; m <= r.toMinute; m += r.everyHours * 60) out.push(m);
  return out;
}

/** O relógio da pessoa agora: o dia, o minuto e o dia da semana ISO, no fuso dela. */
export interface LocalClock {
  date: string;
  minute: number;
  weekday: number;
}

const WEEKDAY_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function localClock(now: Date, timezone: string): LocalClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAY_ISO[parts.weekday as string] ?? 1,
  };
}

/** O minuto está no silêncio? A janela pode virar a meia-noite (22:00–07:00). */
export function inQuietHours(
  minute: number,
  quiet: { enabled: boolean; from: number; to: number },
): boolean {
  if (!quiet.enabled || quiet.from === quiet.to) return false;
  return quiet.from < quiet.to
    ? minute >= quiet.from && minute < quiet.to
    : minute >= quiet.from || minute < quiet.to;
}

/**
 * O horário do lembrete que venceu agora e ainda não saiu, ou `null`. Vale o
 * dia da semana de hoje; horário de mais de `CATCH_UP_MINUTES` atrás já passou.
 * `lastSentAt` posterior ao horário quer dizer que ele já saiu.
 */
export function dueSlot(
  r: ReminderRule,
  clock: LocalClock,
  now: Date,
  lastSentAt: Date | null,
): number | null {
  if (!r.weekdays.includes(clock.weekday)) return null;
  const vencidos = slotsOfDay(r).filter(
    (s) => s <= clock.minute && clock.minute - s < CATCH_UP_MINUTES,
  );
  const slot = vencidos.at(-1);
  if (slot === undefined) return null;
  // O instante do horário, com os segundos do relógio descontados.
  const slotAt = new Date(
    now.getTime() - (clock.minute - slot) * 60_000 - now.getUTCSeconds() * 1000,
  );
  if (lastSentAt && lastSentAt.getTime() >= slotAt.getTime()) return null;
  return slot;
}

/**
 * Que refeição é o lembrete pelo horário: o "Café da manhã 08:00" e o
 * "Almoço 12:30" da prancha. É também a refeição que, registrada, cala o aviso.
 */
export function mealTypeAt(minute: number): MealType {
  if (minute < 10 * 60 + 30) return MealType.BREAKFAST;
  if (minute < 15 * 60) return MealType.LUNCH;
  if (minute < 18 * 60) return MealType.SNACK;
  return MealType.DINNER;
}

const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Café da manhã',
  LUNCH: 'Almoço',
  SNACK: 'Lanche',
  DINNER: 'Jantar',
};

const KIND_LABEL: Record<ReminderKind, string> = {
  WATER: 'Água',
  MEAL: 'Refeição',
  WEIGHT: 'Pesagem',
  WORKOUT: 'Treino',
  STEPS: 'Passos',
  HABIT: 'Hábito',
};

/** O nome na lista (prancha Al-V2): "Água", "Almoço", "Pesagem". */
export function reminderTitle(r: Pick<ReminderRule, 'kind' | 'mode' | 'times' | 'fromMinute'>) {
  if (r.kind !== ReminderKind.MEAL) return KIND_LABEL[r.kind];
  const first = r.mode === ReminderMode.TIMES ? Math.min(...r.times) : r.fromMinute;
  return first == null || !Number.isFinite(first) ? KIND_LABEL.MEAL : MEAL_LABEL[mealTypeAt(first)];
}

/** Um aviso de lembrete. Nada de valor: nem copos, nem passos, nem peso. */
export interface ReminderNotice {
  title: string;
  body: string;
  url: string;
}

/**
 * O texto do lembrete na tela bloqueada (ADR 033): diz o que fazer, nunca
 * quanto falta nem quanto a pessoa fez. O toque leva à tela do registro.
 */
export function reminderNotice(kind: ReminderKind, slot: number): ReminderNotice {
  switch (kind) {
    case ReminderKind.WATER:
      return { title: 'Hora da água', body: 'Um copo agora. Toque para registrar.', url: '/' };
    case ReminderKind.MEAL: {
      const meal = MEAL_LABEL[mealTypeAt(slot)].toLowerCase();
      return {
        title: `Hora do ${meal}`,
        body: 'Toque para registrar a refeição.',
        url: '/nutrition',
      };
    }
    case ReminderKind.WEIGHT:
      return { title: 'Hora da pesagem', body: 'Toque para registrar.', url: '/' };
    case ReminderKind.WORKOUT:
      return { title: 'Hora do treino', body: 'Toque para começar.', url: '/workout' };
    case ReminderKind.STEPS:
      return { title: 'Bora caminhar?', body: 'Ainda dá tempo de mexer o corpo hoje.', url: '/' };
    case ReminderKind.HABIT:
      return { title: 'Lembrete de hábito', body: 'Toque para marcar.', url: '/' };
  }
}

/** Vários lembretes no mesmo minuto viram um aviso só, com os nomes. */
export function groupedReminderNotice(titles: string[]): ReminderNotice {
  const nomes = titles.map((t, i) => (i === 0 ? t : t.toLowerCase()));
  const lista =
    nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
  return { title: `${titles.length} lembretes agora`, body: lista, url: '/' };
}
