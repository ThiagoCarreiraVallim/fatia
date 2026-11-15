'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IconName } from '@fatia/design';
import {
  clockLabel,
  draftFromReminder,
  draftToInput,
  EVERY_HOURS_MAX,
  EVERY_HOURS_MIN,
  NEW_TIME,
  newReminderDraft,
  reminderCta,
  remindersApi,
  reminderTypes,
  stepClock,
  TIMES_MAX,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  type Reminder,
  type ReminderDraft,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Chip, Segmented } from '@/components/ui/selection';
import { cn } from '@/lib/utils';
import { REMINDERS_KEY } from './keys';

const ib =
  'inline-flex items-center justify-center rounded-[14px] text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40';

/**
 * A folha de lembrete (pranchas Al-V3 e Al-V3b): tipo, intervalo ou horários
 * fixos, a janela ou os horários com o seletor hh:mm, os dias e o botão que
 * diz quantos avisos saem. Na edição, a lixeira apaga. O tipo "Hábito"
 * (Al-V3c) só aparece quando houver hábitos (#390).
 */
export function ReminderSheet({
  open,
  onOpenChange,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Com lembrete, é a edição (Al-V3b). */
  reminder: Reminder | null;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {/* O conteúdo monta a cada abertura: o rascunho nasce do lembrete da vez. */}
        <ReminderForm
          key={reminder?.id ?? 'new'}
          reminder={reminder}
          onClose={() => onOpenChange(false)}
        />
      </DrawerContent>
    </Drawer>
  );
}

function ReminderForm({ reminder, onClose }: { reminder: Reminder | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = reminder !== null;
  const [draft, setDraft] = useState<ReminderDraft>(() =>
    reminder ? draftFromReminder(reminder) : newReminderDraft(),
  );
  // Qual horário está aberto no seletor; -1 = nenhum. A edição já abre com o
  // primeiro horário no seletor, como a prancha.
  const [edit, setEdit] = useState(reminder ? 0 : -1);

  const done = () => {
    void qc.invalidateQueries({ queryKey: REMINDERS_KEY });
    onClose();
  };
  const save = useMutation({
    mutationFn: (d: ReminderDraft) =>
      reminder
        ? remindersApi.update(reminder.id, draftToInput(d))
        : remindersApi.create(draftToInput(d)),
    onSuccess: done,
    onError: () => toast('Não deu para salvar. Tente de novo.'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => remindersApi.remove(id),
    onSuccess: () => {
      toast('Lembrete apagado');
      done();
    },
    onError: () => toast('Não deu para apagar. Tente de novo.'),
  });

  const interval = draft.mode === 'INTERVAL';
  const list = interval ? [draft.from, draft.to] : draft.times;
  const current = edit >= 0 ? list[edit] : undefined;
  const setCurrent = (minute: number) => {
    if (interval) setDraft((d) => (edit === 0 ? { ...d, from: minute } : { ...d, to: minute }));
    else setDraft((d) => ({ ...d, times: d.times.map((t, i) => (i === edit ? minute : t)) }));
  };
  const step = (dh: number, dm: number) => {
    if (current !== undefined) setCurrent(stepClock(current, dh, dm));
  };
  const days = draft.weekdays.filter(Boolean).length;
  const busy = save.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-3.5 overflow-y-auto px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <DrawerTitle className="font-display text-h2">
          {editing ? 'Editar lembrete' : 'Novo lembrete'}
        </DrawerTitle>
        {reminder && (
          <button
            type="button"
            aria-label="Apagar lembrete"
            disabled={busy}
            onClick={() => remove.mutate(reminder.id)}
            className={cn(ib, 'h-11 w-11 bg-muted text-danger')}
          >
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      <DrawerDescription className="sr-only">
        Escolha o tipo, os horários e os dias do lembrete.
      </DrawerDescription>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo">
        {reminderTypes({ habits: false, editing }).map((t) => (
          <Chip
            key={t.kind}
            selected={draft.kind === t.kind}
            className={draft.kind === t.kind ? undefined : 'bg-card'}
            onClick={() => setDraft((d) => ({ ...d, kind: t.kind }))}
          >
            <Icon name={t.icon as IconName} size={16} />
            {t.label}
          </Chip>
        ))}
      </div>

      <Segmented
        label="Como repete"
        value={draft.mode}
        onChange={(mode) => {
          setDraft((d) => ({ ...d, mode }));
          setEdit(-1);
        }}
        options={[
          { value: 'INTERVAL', label: 'Intervalo' },
          { value: 'TIMES', label: 'Horários fixos' },
        ]}
      />

      {interval && (
        <div className="flex items-center justify-between">
          <span className="text-b2 text-muted-foreground">A cada</span>
          <div className="flex items-center gap-1.5 rounded-field bg-muted p-1">
            <button
              type="button"
              aria-label="Menos"
              className={cn(ib, 'h-10 w-10 bg-card')}
              disabled={draft.everyHours <= EVERY_HOURS_MIN}
              onClick={() =>
                setDraft((d) => ({ ...d, everyHours: Math.max(EVERY_HOURS_MIN, d.everyHours - 1) }))
              }
            >
              <span aria-hidden className="h-0.5 w-3 bg-current" />
            </button>
            <span
              className="min-w-14 text-center font-display text-lg font-bold tabular-nums"
              aria-live="polite"
            >
              {draft.everyHours} h
            </span>
            <button
              type="button"
              aria-label="Mais"
              className={cn(ib, 'h-10 w-10 bg-card')}
              disabled={draft.everyHours >= EVERY_HOURS_MAX}
              onClick={() =>
                setDraft((d) => ({ ...d, everyHours: Math.min(EVERY_HOURS_MAX, d.everyHours + 1) }))
              }
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span className="w-full text-xs text-faint">
          {interval ? 'Janela do dia · toque para mudar' : 'Horários · toque para mudar'}
        </span>
        {list.map((minute, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={edit === i}
            onClick={() => setEdit(edit === i ? -1 : i)}
            className={cn(
              'anim-press inline-flex h-10 items-center gap-1.5 rounded-chip px-3.5 text-sm font-extrabold tabular-nums transition-colors duration-fast',
              edit === i ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
            )}
          >
            <Icon name="clock" size={16} />
            {interval ? (i ? 'até ' : 'de ') : ''}
            {clockLabel(minute)}
          </button>
        ))}
        {!interval && draft.times.length < TIMES_MAX && (
          <button
            type="button"
            aria-label="Adicionar horário"
            onClick={() => {
              setDraft((d) => ({ ...d, times: [...d.times, NEW_TIME] }));
              setEdit(draft.times.length);
            }}
            className="anim-press inline-flex h-10 items-center gap-1.5 rounded-chip bg-card px-3.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <Icon name="plus" size={16} />
            Horário
          </button>
        )}
      </div>

      {current !== undefined && (
        <div className="anim-pop flex flex-col gap-2 rounded-card bg-muted px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">
              {interval ? (edit ? 'Último aviso' : 'Primeiro aviso') : `Horário ${edit + 1}`}
            </span>
            {!interval && draft.times.length > 1 && (
              <button
                type="button"
                className="p-1 text-[13px] font-semibold text-danger"
                onClick={() => {
                  setDraft((d) => ({ ...d, times: d.times.filter((_, j) => j !== edit) }));
                  setEdit(-1);
                }}
              >
                Remover
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <ClockColumn
              value={Math.floor(current / 60)}
              up="Mais uma hora"
              down="Menos uma hora"
              onUp={() => step(1, 0)}
              onDown={() => step(-1, 0)}
            />
            <span aria-hidden className="font-display text-4xl font-bold text-faint">
              :
            </span>
            <ClockColumn
              value={current % 60}
              up="Mais 5 minutos"
              down="Menos 5 minutos"
              onUp={() => step(0, 5)}
              onDown={() => step(0, -5)}
            />
            <Button size="sm" className="ml-3 h-9" onClick={() => setEdit(-1)}>
              Ok
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-b2 text-muted-foreground">Dias</span>
        <div className="flex justify-between">
          {WEEKDAY_INITIALS.map((l, i) => {
            const on = draft.weekdays[i];
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={WEEKDAY_NAMES[i]}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    weekdays: d.weekdays.map((v, j) => (j === i ? !v : v)),
                  }))
                }
                className={cn(
                  'h-10 w-10 rounded-full text-sm font-bold transition-colors duration-fast',
                  on ? 'bg-primary text-primary-foreground' : 'bg-surface-3 text-muted-foreground',
                )}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>

      <Button className="w-full" disabled={busy || days === 0} onClick={() => save.mutate(draft)}>
        {reminderCta(draft, editing)}
      </Button>
    </div>
  );
}

function ClockColumn({
  value,
  up,
  down,
  onUp,
  onDown,
}: {
  value: number;
  up: string;
  down: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" aria-label={up} onClick={onUp} className={cn(ib, 'h-8 w-10')}>
        <Icon name="chevD" size={16} className="rotate-180" />
      </button>
      <span className="font-display text-[40px] font-bold leading-none tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
      <button type="button" aria-label={down} onClick={onDown} className={cn(ib, 'h-8 w-10')}>
        <Icon name="chevD" size={16} />
      </button>
    </div>
  );
}
