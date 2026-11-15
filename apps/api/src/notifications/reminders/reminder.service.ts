import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReminderKind, ReminderMode, type Reminder } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import {
  ALL_WEEKDAYS,
  EVERY_HOURS_MAX,
  EVERY_HOURS_MIN,
  formatClock,
  parseClock,
  reminderTitle,
  REMINDERS_MAX,
  TIMES_MAX,
} from './reminder-rules';

export const REMINDER_KINDS = Object.values(ReminderKind);
export const REMINDER_MODES = Object.values(ReminderMode);
export const STEPS_BELOW_MIN = 100;
export const STEPS_BELOW_MAX = 100_000;

/** O que o cliente manda: horários em "hh:mm", dias ISO (1 = segunda). */
export interface ReminderInput {
  kind: ReminderKind;
  habitId?: string | null;
  mode: ReminderMode;
  everyHours?: number | null;
  from?: string | null;
  to?: string | null;
  times?: string[];
  weekdays?: number[];
  stepsBelow?: number | null;
  enabled?: boolean;
}

export interface ReminderView {
  id: string;
  kind: ReminderKind;
  habitId: string | null;
  /** O nome na lista: "Água", "Almoço", "Pesagem". */
  title: string;
  mode: ReminderMode;
  everyHours: number | null;
  from: string | null;
  to: string | null;
  times: string[];
  weekdays: number[];
  stepsBelow: number | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type Normalized = Omit<
  Reminder,
  'id' | 'userId' | 'lastSentAt' | 'sentDate' | 'sentCount' | 'createdAt' | 'updatedAt'
>;

export function toReminderView(r: Reminder): ReminderView {
  return {
    id: r.id,
    kind: r.kind,
    habitId: r.habitId,
    title: reminderTitle(r),
    mode: r.mode,
    everyHours: r.everyHours,
    from: r.fromMinute == null ? null : formatClock(r.fromMinute),
    to: r.toMinute == null ? null : formatClock(r.toMinute),
    times: r.times.map(formatClock),
    weekdays: r.weekdays,
    stepsBelow: r.stepsBelow,
    enabled: r.enabled,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function clock(value: string | null | undefined, campo: string): number {
  const m = value == null ? null : parseClock(value);
  if (m == null) {
    throw new BadRequestException(`${campo} precisa ser um horário hh:mm, de 5 em 5 minutos`);
  }
  return m;
}

/**
 * Confere e normaliza um lembrete inteiro (criação, ou o atual com a mudança
 * por cima). O que não vale para o modo escolhido é apagado, para a linha não
 * guardar um intervalo velho num lembrete de horários fixos.
 */
export function normalizeReminder(input: ReminderInput): Normalized {
  if (!REMINDER_KINDS.includes(input.kind)) throw new BadRequestException('Tipo inválido');
  if (input.kind === ReminderKind.HABIT) {
    // O seletor de hábito da prancha Al-V3c depende dos hábitos (#390): sem a
    // tabela, não há como conferir que o hábito é da pessoa.
    throw new BadRequestException('Lembrete de hábito chega junto com os hábitos.');
  }
  const weekdays = [...new Set(input.weekdays ?? ALL_WEEKDAYS)].sort((a, b) => a - b);
  if (weekdays.length === 0 || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    throw new BadRequestException('Escolha pelo menos um dia (1 = segunda … 7 = domingo)');
  }
  let stepsBelow: number | null = null;
  if (input.stepsBelow != null) {
    if (input.kind !== ReminderKind.STEPS) {
      throw new BadRequestException('"Se abaixo de" só vale para o lembrete de passos');
    }
    if (
      !Number.isInteger(input.stepsBelow) ||
      input.stepsBelow < STEPS_BELOW_MIN ||
      input.stepsBelow > STEPS_BELOW_MAX
    ) {
      throw new BadRequestException(
        `"Se abaixo de" vai de ${STEPS_BELOW_MIN} a ${STEPS_BELOW_MAX} passos`,
      );
    }
    stepsBelow = input.stepsBelow;
  }
  const base = {
    kind: input.kind,
    habitId: null,
    weekdays,
    stepsBelow,
    enabled: input.enabled ?? true,
  };

  if (input.mode === ReminderMode.INTERVAL) {
    const every = input.everyHours;
    if (
      every == null ||
      !Number.isInteger(every) ||
      every < EVERY_HOURS_MIN ||
      every > EVERY_HOURS_MAX
    ) {
      throw new BadRequestException(
        `"A cada" vai de ${EVERY_HOURS_MIN} a ${EVERY_HOURS_MAX} horas`,
      );
    }
    const fromMinute = clock(input.from, 'O primeiro aviso');
    const toMinute = clock(input.to, 'O último aviso');
    if (fromMinute >= toMinute) {
      throw new BadRequestException('O último aviso precisa vir depois do primeiro');
    }
    return { ...base, mode: input.mode, everyHours: every, fromMinute, toMinute, times: [] };
  }
  if (input.mode === ReminderMode.TIMES) {
    const raw = input.times ?? [];
    if (raw.length === 0 || raw.length > TIMES_MAX) {
      throw new BadRequestException(`De 1 a ${TIMES_MAX} horários`);
    }
    const times = [...new Set(raw.map((t) => clock(t, 'Cada horário')))].sort((a, b) => a - b);
    return {
      ...base,
      mode: input.mode,
      everyHours: null,
      fromMinute: null,
      toMinute: null,
      times,
    };
  }
  throw new BadRequestException('Modo inválido');
}

/**
 * Lembretes pessoais (#389). Toda leitura e escrita é amarrada a `userId`: o
 * id de outra pessoa responde como se não existisse. A equipe não tem rota
 * nenhuma para cá.
 */
@Injectable()
export class ReminderService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ReminderView[]> {
    const rows = await this.prisma.reminder.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toReminderView);
  }

  async create(userId: string, input: ReminderInput): Promise<ReminderView> {
    const data = normalizeReminder(input);
    const total = await this.prisma.reminder.count({ where: { userId } });
    if (total >= REMINDERS_MAX) {
      throw new BadRequestException(`Até ${REMINDERS_MAX} lembretes por pessoa`);
    }
    return toReminderView(await this.prisma.reminder.create({ data: { ...data, userId } }));
  }

  async update(userId: string, id: string, patch: Partial<ReminderInput>): Promise<ReminderView> {
    const atual = await this.owned(userId, id);
    const merged: ReminderInput = {
      ...toReminderView(atual),
      // Trocar de tipo sem dizer o "se abaixo de" apaga o do tipo antigo.
      ...(patch.kind && patch.kind !== atual.kind && patch.stepsBelow === undefined
        ? { stepsBelow: null }
        : {}),
      ...stripUndefined(patch),
    };
    const data = normalizeReminder(merged);
    // `updateMany` com o dono no `where`: a escrita só acerta a linha dela.
    await this.prisma.reminder.updateMany({ where: { id, userId }, data });
    return toReminderView(await this.owned(userId, id));
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const r = await this.prisma.reminder.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw new NotFoundException('Reminder not found');
    return { deleted: true };
  }

  private async owned(userId: string, id: string): Promise<Reminder> {
    const r = await this.prisma.reminder.findFirst({ where: { id, userId } });
    if (!r) throw new NotFoundException('Reminder not found');
    return r;
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
