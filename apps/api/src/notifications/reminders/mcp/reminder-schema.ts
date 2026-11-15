import { z } from 'zod';
import type { ReminderKind, ReminderMode } from '@fatia/db';
import { EVERY_HOURS_MAX, EVERY_HOURS_MIN, TIMES_MAX } from '../reminder-rules';
import { STEPS_BELOW_MAX, STEPS_BELOW_MIN } from '../reminder.service';

/**
 * Os campos de um lembrete nas tools (#389), os mesmos do REST. O lembrete de
 * hábito fica de fora até os hábitos existirem (#390): a tool não oferece o
 * que a API recusaria.
 */
export const REMINDER_TOOL_KINDS = ['WATER', 'MEAL', 'WEIGHT', 'WORKOUT', 'STEPS'] as const;

const hhmm = () => z.string().regex(/^([01]\d|2[0-3]):[0-5][05]$/, 'hh:mm, de 5 em 5 minutos');

export const reminderFields = {
  kind: z
    .enum(REMINDER_TOOL_KINDS)
    .describe(
      'WATER (água), MEAL (refeição: o horário diz qual), WEIGHT (pesagem), WORKOUT (treino), STEPS (passos)',
    ),
  mode: z
    .enum(['INTERVAL', 'TIMES'])
    .describe('INTERVAL = "a cada N h" entre from e to; TIMES = horários fixos em times'),
  everyHours: z
    .number()
    .int()
    .min(EVERY_HOURS_MIN)
    .max(EVERY_HOURS_MAX)
    .optional()
    .describe(`Só no INTERVAL: de ${EVERY_HOURS_MIN} a ${EVERY_HOURS_MAX} horas`),
  from: hhmm().optional().describe('Só no INTERVAL: primeiro aviso, "08:00"'),
  to: hhmm().optional().describe('Só no INTERVAL: último aviso, "20:00"'),
  times: z
    .array(hhmm())
    .min(1)
    .max(TIMES_MAX)
    .optional()
    .describe('Só no TIMES: horários no fuso da pessoa, "12:30"'),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .optional()
    .describe('Dias ISO: 1 = segunda … 7 = domingo. Omitido = todos os dias'),
  stepsBelow: z
    .number()
    .int()
    .min(STEPS_BELOW_MIN)
    .max(STEPS_BELOW_MAX)
    .optional()
    .describe('Só em STEPS: lembra só se o dia estiver abaixo disto. Omitido = a meta de passos'),
  enabled: z.boolean().optional().describe('Ligado (padrão) ou desligado'),
};

/** A entrada das tools de criar e alterar, já com os tipos do Prisma. */
export interface ReminderToolInput {
  kind?: (typeof REMINDER_TOOL_KINDS)[number];
  mode?: 'INTERVAL' | 'TIMES';
  everyHours?: number;
  from?: string;
  to?: string;
  times?: string[];
  weekdays?: number[];
  stepsBelow?: number;
  enabled?: boolean;
}

export const asInput = (i: ReminderToolInput) => ({
  ...i,
  kind: i.kind as ReminderKind | undefined,
  mode: i.mode as ReminderMode | undefined,
});
