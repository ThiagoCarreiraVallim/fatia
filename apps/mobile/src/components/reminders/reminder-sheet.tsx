import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { TABULAR } from '@/components/today/parts';
import { Button, Drawer, DrawerContent, DrawerTitle, Segmented, useToast } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';

import { REMINDERS_KEY } from './keys';

/**
 * A folha de lembrete (pranchas Al-V3 e Al-V3b) — réplica de
 * `apps/web/src/components/reminders/reminder-sheet.tsx`. Montada fora do
 * `Screen`, dentro do `DrawerLayer`.
 */
export function ReminderSheet({
  open,
  onOpenChange,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder: Reminder | null;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-6 pb-8">
        {/* O Drawer some fechado: o rascunho nasce de novo a cada abertura. */}
        <ReminderForm reminder={reminder} onClose={() => onOpenChange(false)} />
      </DrawerContent>
    </Drawer>
  );
}

function ReminderForm({ reminder, onClose }: { reminder: Reminder | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const editing = reminder !== null;
  const [draft, setDraft] = useState<ReminderDraft>(() =>
    reminder ? draftFromReminder(reminder) : newReminderDraft(),
  );
  // A edição já abre com o primeiro horário no seletor, como a prancha.
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
    onError: () => toast.show({ message: 'Não deu para salvar. Tente de novo.' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => remindersApi.remove(id),
    onSuccess: () => {
      toast.show({ message: 'Lembrete apagado' });
      done();
    },
    onError: () => toast.show({ message: 'Não deu para apagar. Tente de novo.' }),
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
    <View className="gap-3.5 pt-2">
      <View className="flex-row items-center justify-between">
        <DrawerTitle className="font-display text-h2">
          {editing ? 'Editar lembrete' : 'Novo lembrete'}
        </DrawerTitle>
        {reminder ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apagar lembrete"
            disabled={busy}
            onPress={() => remove.mutate(reminder.id)}
            className="h-11 w-11 items-center justify-center rounded-[14px] bg-muted active:opacity-80"
          >
            <Icon name="trash" size={16} color={colors.destructive} />
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-2" accessibilityLabel="Tipo">
        {reminderTypes({ habits: false, editing }).map((t) => {
          const on = draft.kind === t.kind;
          return (
            <Pressable
              key={t.kind}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setDraft((d) => ({ ...d, kind: t.kind }))}
              className={cn(
                'h-9 flex-row items-center gap-1.5 rounded-chip px-3.5',
                on ? 'bg-foreground' : 'bg-card',
              )}
            >
              <Icon
                name={t.icon as IconName}
                size={16}
                color={on ? colors.background : colors.mutedForeground}
              />
              <Text
                className={cn(
                  'font-sans-semibold text-sm',
                  on ? 'text-background' : 'text-muted-foreground',
                )}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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

      {interval ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-b2 text-muted-foreground">A cada</Text>
          <View className="flex-row items-center gap-1.5 rounded-field bg-muted p-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Menos"
              disabled={draft.everyHours <= EVERY_HOURS_MIN}
              onPress={() =>
                setDraft((d) => ({ ...d, everyHours: Math.max(EVERY_HOURS_MIN, d.everyHours - 1) }))
              }
              className={cn(
                'h-10 w-10 items-center justify-center rounded-[14px] bg-card',
                draft.everyHours <= EVERY_HOURS_MIN && 'opacity-40',
              )}
            >
              <View className="h-0.5 w-3 bg-foreground" />
            </Pressable>
            <Text
              accessibilityLiveRegion="polite"
              className="min-w-14 text-center font-display text-lg text-foreground"
              style={TABULAR}
            >
              {draft.everyHours} h
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mais"
              disabled={draft.everyHours >= EVERY_HOURS_MAX}
              onPress={() =>
                setDraft((d) => ({ ...d, everyHours: Math.min(EVERY_HOURS_MAX, d.everyHours + 1) }))
              }
              className={cn(
                'h-10 w-10 items-center justify-center rounded-[14px] bg-card',
                draft.everyHours >= EVERY_HOURS_MAX && 'opacity-40',
              )}
            >
              <Icon name="plus" size={16} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-1.5">
        <Text className="w-full text-xs text-faint">
          {interval ? 'Janela do dia · toque para mudar' : 'Horários · toque para mudar'}
        </Text>
        {list.map((minute, i) => {
          const on = edit === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setEdit(on ? -1 : i)}
              className={cn(
                'h-10 flex-row items-center gap-1.5 rounded-chip px-3.5',
                on ? 'bg-primary' : 'bg-card',
              )}
            >
              <Icon
                name="clock"
                size={16}
                color={on ? colors.primaryForeground : colors.foreground}
              />
              <Text
                className={cn(
                  'font-sans-extrabold text-sm',
                  on ? 'text-primary-foreground' : 'text-foreground',
                )}
                style={TABULAR}
              >
                {interval ? (i ? 'até ' : 'de ') : ''}
                {clockLabel(minute)}
              </Text>
            </Pressable>
          );
        })}
        {!interval && draft.times.length < TIMES_MAX ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adicionar horário"
            onPress={() => {
              setDraft((d) => ({ ...d, times: [...d.times, NEW_TIME] }));
              setEdit(draft.times.length);
            }}
            className="h-10 flex-row items-center gap-1.5 rounded-chip bg-card px-3.5"
          >
            <Icon name="plus" size={16} color={colors.mutedForeground} />
            <Text className="font-sans-semibold text-sm text-muted-foreground">Horário</Text>
          </Pressable>
        ) : null}
      </View>

      {current !== undefined ? (
        <View className="gap-2 rounded-card bg-muted px-4 py-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-[13px] text-muted-foreground">
              {interval ? (edit ? 'Último aviso' : 'Primeiro aviso') : `Horário ${edit + 1}`}
            </Text>
            {!interval && draft.times.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDraft((d) => ({ ...d, times: d.times.filter((_, j) => j !== edit) }));
                  setEdit(-1);
                }}
                className="p-1"
              >
                <Text className="font-sans-semibold text-[13px] text-destructive">Remover</Text>
              </Pressable>
            ) : null}
          </View>
          <View className="flex-row items-center justify-center gap-2.5">
            <ClockColumn
              value={Math.floor(current / 60)}
              up="Mais uma hora"
              down="Menos uma hora"
              onUp={() => step(1, 0)}
              onDown={() => step(-1, 0)}
            />
            <Text className="font-display text-4xl text-faint">:</Text>
            <ClockColumn
              value={current % 60}
              up="Mais 5 minutos"
              down="Menos 5 minutos"
              onUp={() => step(0, 5)}
              onDown={() => step(0, -5)}
            />
            <Button size="xs" className="ml-3" onPress={() => setEdit(-1)}>
              Ok
            </Button>
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-b2 text-muted-foreground">Dias</Text>
        <View className="flex-row justify-between">
          {WEEKDAY_INITIALS.map((l, i) => {
            const on = draft.weekdays[i];
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={WEEKDAY_NAMES[i]}
                accessibilityState={{ selected: on }}
                onPress={() =>
                  setDraft((d) => ({
                    ...d,
                    weekdays: d.weekdays.map((v, j) => (j === i ? !v : v)),
                  }))
                }
                className={cn(
                  'h-10 w-10 items-center justify-center rounded-full',
                  on ? 'bg-primary' : 'bg-surface-3',
                )}
              >
                <Text
                  className={cn(
                    'font-sans-bold text-sm',
                    on ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {l}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button
        size="xl"
        disabled={busy || days === 0}
        loading={save.isPending}
        onPress={() => save.mutate(draft)}
      >
        {reminderCta(draft, editing)}
      </Button>
    </View>
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
    <View className="items-center gap-0.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={up}
        onPress={onUp}
        className="h-8 w-10 items-center justify-center rounded-full active:bg-surface-3"
      >
        <View style={{ transform: [{ rotate: '180deg' }] }}>
          <Icon name="chevD" size={16} color={colors.foreground} />
        </View>
      </Pressable>
      <Text className="font-display text-[40px] leading-[44px] text-foreground" style={TABULAR}>
        {String(value).padStart(2, '0')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={down}
        onPress={onDown}
        className="h-8 w-10 items-center justify-center rounded-full active:bg-surface-3"
      >
        <Icon name="chevD" size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}
