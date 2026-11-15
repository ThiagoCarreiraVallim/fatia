import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Moon,
  Trophy,
  X,
} from 'lucide-react-native';
import {
  agendaApi,
  agendaDayLabel,
  agendaItemCopy,
  agendaPlanLabel,
  endedText,
  type Agenda,
  type AgendaItem,
  type AgendaState,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerLayer,
  DrawerTitle,
  ErrorState,
  FormMessage,
  LoadingState,
  Segmented,
  cn,
  useToast,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { mensagemDeErro } from '@/components/nutrition/helpers';
import { useStartSession } from '@/components/workout/use-start-session';
import {
  agendaWindow,
  dayDot,
  defaultSelectedDay,
  localToday,
  rescheduleChoices,
  shiftAnchor,
  type AgendaMode,
} from '@/components/workout/agenda-view';
import { colors } from '@/theme/colors';

/**
 * Agenda de treinos (#379, pranchas Al-T24, T24b e T24c; ADR 042). Réplica de
 * `apps/web/src/app/(app)/workout/agenda/page.tsx`. Informativa: não reserva
 * nem marca presença. "Remarcar" move a sessão para um dia de hoje até o fim
 * do plano, e pergunta antes.
 */

/** Função, não constante: os tokens de cor são getters do tema claro/escuro. */
const dotColor = (state: AgendaState) =>
  ({
    done: colors.primary,
    missed: colors.danger,
    today: colors.brand,
    planned: colors.protein,
  })[state];

const MODES = [
  { value: 'week' as const, label: 'Semana' },
  { value: 'month' as const, label: 'Mês' },
];

export default function AgendaScreen() {
  const router = useRouter();
  const today = useMemo(() => localToday(), []);
  const [mode, setMode] = useState<AgendaMode>('week');
  const [anchor, setAnchor] = useState(today);
  const [picked, setPicked] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ item: AgendaItem; date: string } | null>(null);
  const range = agendaWindow(mode, anchor);

  const q = useQuery({
    queryKey: ['workout', 'agenda', range.from, range.to],
    queryFn: () => agendaApi.range(range.from, range.to),
    placeholderData: keepPreviousData,
  });
  const agenda = q.data && q.data.from === range.from ? q.data : null;
  const selected =
    picked && agenda?.days.some((d) => d.date === picked)
      ? picked
      : agenda
        ? defaultSelectedDay(agenda)
        : null;
  const day = agenda?.days.find((d) => d.date === selected) ?? null;

  const go = (dir: 1 | -1) => {
    setPicked(null);
    setAnchor((a) => shiftAnchor(mode, a, dir));
  };

  return (
    <>
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        <View className="gap-4 px-5 pt-2">
          <Segmented
            label="Ver por"
            options={MODES}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setPicked(null);
              setAnchor(selected ?? today);
            }}
          />

          <View className="flex-row items-center gap-2">
            <NavButton label="Anterior" onPress={() => go(-1)}>
              <ChevronLeft size={18} color={colors.foreground} />
            </NavButton>
            <Text className="font-sans-bold text-[15px] text-foreground">{range.label}</Text>
            <NavButton label="Próximo" onPress={() => go(1)}>
              <ChevronRight size={18} color={colors.foreground} />
            </NavButton>
            {agenda ? (
              <Text numberOfLines={1} className="ml-auto min-w-0 flex-shrink text-xs text-faint">
                {agendaPlanLabel(agenda)}
              </Text>
            ) : null}
          </View>

          {q.isLoading ? <LoadingState /> : null}
          {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}

          {agenda ? (
            mode === 'week' ? (
              <WeekStrip agenda={agenda} selected={selected} onSelect={setPicked} />
            ) : (
              <MonthGrid agenda={agenda} anchor={anchor} selected={selected} onSelect={setPicked} />
            )
          ) : null}

          {agenda?.empty ? (
            <View className="items-center gap-2 rounded-card bg-card px-5 py-8">
              <CalendarDays size={28} color={colors.faintForeground} />
              <Text className="font-sans-bold text-[15px] text-foreground">Nada planejado</Text>
              <Text className="text-center text-sm text-muted-foreground">
                Quando a equipe enviar um plano com datas, as sessões aparecem aqui. Planos
                flexíveis seguem no seu ritmo.
              </Text>
              <Button
                variant="secondary"
                size="xs"
                className="mt-1"
                onPress={() => router.push('/workout/plans' as Href)}
              >
                Ver meus planos
              </Button>
            </View>
          ) : null}

          {agenda?.ended ? <EndedCard ended={agenda.ended} /> : null}

          {day && !agenda?.empty && !agenda?.ended ? (
            <View className="gap-2">
              <Text
                accessibilityRole="header"
                className="font-sans-bold text-xs uppercase tracking-wide text-faint"
              >
                {agendaDayLabel(day.date).long}
              </Text>
              {day.items.length === 0 ? (
                <RestCard />
              ) : (
                day.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onReschedule={() => setMoving({ item, date: day.date })}
                  />
                ))
              )}
            </View>
          ) : null}

          {agenda && !agenda.empty && !agenda.ended ? (
            <Text className="pb-4 text-xs text-muted-foreground">
              Plano de calendário: cada sessão tem dia. Plano flexível: aparece só a próxima sessão.
            </Text>
          ) : null}
        </View>
      </Screen>

      <DrawerLayer>
        <RescheduleDrawer
          moving={moving}
          today={agenda?.today ?? today}
          onClose={() => setMoving(null)}
        />
      </DrawerLayer>
    </>
  );
}

function NavButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-[12px] bg-muted active:opacity-80"
    >
      {children}
    </Pressable>
  );
}

/** Sem sessão no dia: ponto cinza (descanso) enquanto há plano; nada sem plano. */
function Dot({ state, rest }: { state: AgendaState | null; rest: boolean }) {
  return (
    <View
      className="h-1.5 w-1.5 rounded-[3px]"
      style={{
        backgroundColor: state ? dotColor(state) : rest ? colors.borderStrong : 'transparent',
      }}
    />
  );
}

function WeekStrip({
  agenda,
  selected,
  onSelect,
}: {
  agenda: Agenda;
  selected: string | null;
  onSelect: (d: string) => void;
}) {
  return (
    <View className="flex-row gap-1">
      {agenda.days.map((d) => {
        const label = agendaDayLabel(d.date);
        const on = d.date === selected;
        const isToday = d.date === agenda.today;
        const dot = dayDot(d.items);
        return (
          <Pressable
            key={d.date}
            accessibilityRole="button"
            accessibilityLabel={`${label.long}${isToday ? ', hoje' : ''}, ${d.items.length} ${d.items.length === 1 ? 'sessão' : 'sessões'}`}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(d.date)}
            className={cn(
              'h-[72px] flex-1 items-center justify-center gap-1 rounded-[16px]',
              on ? 'bg-muted' : 'bg-card',
            )}
            style={on ? { borderWidth: 1.5, borderColor: colors.borderStrong } : undefined}
          >
            <Text className="text-[11px] text-muted-foreground">{label.weekday}</Text>
            <Text
              className="font-sans-bold text-base text-foreground"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {label.day}
            </Text>
            <Dot state={dot} rest={!agenda.empty} />
          </Pressable>
        );
      })}
    </View>
  );
}

function MonthGrid({
  agenda,
  anchor,
  selected,
  onSelect,
}: {
  agenda: Agenda;
  anchor: string;
  selected: string | null;
  onSelect: (d: string) => void;
}) {
  const month = anchor.slice(0, 7);
  const rows: Agenda['days'][] = [];
  for (let i = 0; i < agenda.days.length; i += 7) rows.push(agenda.days.slice(i, i + 7));
  return (
    <View className="gap-1">
      <View className="flex-row gap-1">
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((l, i) => (
          <Text key={i} className="flex-1 text-center text-[11px] text-faint">
            {l}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row[0]!.date} className="flex-row gap-1">
          {row.map((d) => {
            const on = d.date === selected;
            const inMonth = d.date.startsWith(month);
            const isToday = d.date === agenda.today;
            return (
              <Pressable
                key={d.date}
                accessibilityRole="button"
                accessibilityLabel={`${agendaDayLabel(d.date).long}, ${d.items.length} ${d.items.length === 1 ? 'sessão' : 'sessões'}`}
                accessibilityState={{ selected: on }}
                onPress={() => onSelect(d.date)}
                className={cn(
                  'h-12 flex-1 items-center justify-center gap-1 rounded-[16px]',
                  on ? 'bg-muted' : 'bg-card',
                  !inMonth && 'opacity-40',
                )}
                style={on ? { borderWidth: 1.5, borderColor: colors.borderStrong } : undefined}
              >
                <Text
                  className={cn('font-sans-bold text-sm text-foreground', isToday && 'underline')}
                >
                  {Number(d.date.slice(8, 10))}
                </Text>
                <Dot state={dayDot(d.items)} rest={!agenda.empty} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** O quadrado do ícone, como no web e na prancha (chipic). */
function toneChip(tone: AgendaState) {
  if (tone === 'done') return { bg: `${colors.primary}26`, fg: colors.primary, Icon: Check };
  if (tone === 'missed') return { bg: `${colors.danger}24`, fg: colors.danger, Icon: X };
  if (tone === 'today') return { bg: `${colors.brand}29`, fg: colors.brand, Icon: Dumbbell };
  return { bg: colors.muted, fg: colors.mutedForeground, Icon: Dumbbell };
}

function ChipIcon({ bg, fg, Icon }: ReturnType<typeof toneChip>) {
  return (
    <View
      className="h-10 w-10 items-center justify-center rounded-[12px]"
      style={{ backgroundColor: bg }}
    >
      <Icon size={16} color={fg} />
    </View>
  );
}

function ItemCard({ item, onReschedule }: { item: AgendaItem; onReschedule: () => void }) {
  const copy = agendaItemCopy(item);
  const start = useStartSession();
  return (
    <View
      className="flex-row items-center gap-3 rounded-card bg-card px-4 py-3"
      style={copy.tone === 'today' ? { borderWidth: 1.5, borderColor: colors.brand } : undefined}
    >
      <ChipIcon {...toneChip(copy.tone)} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-sans-bold text-[15px] text-foreground">
          {copy.title}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {copy.subtitle}
        </Text>
      </View>
      {copy.open ? (
        <Button
          size="xs"
          loading={start.isPending}
          onPress={() => start.mutate({ planId: item.planId })}
        >
          Abrir
        </Button>
      ) : null}
      {copy.reschedule ? (
        <Button size="xs" variant="secondary" onPress={onReschedule}>
          Remarcar
        </Button>
      ) : null}
    </View>
  );
}

/** Dia sem sessão: descanso (prancha Al-T24). */
function RestCard() {
  return (
    <View className="flex-row items-center gap-3 rounded-card bg-card px-4 py-3">
      <ChipIcon bg={colors.muted} fg={colors.mutedForeground} Icon={Moon} />
      <View className="min-w-0 flex-1">
        <Text className="font-sans-bold text-[15px] text-foreground">Descanso</Text>
        <Text className="text-xs text-muted-foreground">sem sessão neste dia</Text>
      </View>
    </View>
  );
}

function EndedCard({ ended }: { ended: NonNullable<Agenda['ended']> }) {
  const router = useRouter();
  const copy = endedText(ended);
  return (
    <View
      className="gap-2 rounded-card bg-card p-4"
      style={{ borderWidth: 1, borderColor: `${colors.primary}59` }}
    >
      <View className="flex-row items-center gap-2">
        <Trophy size={16} color={colors.steps} />
        <Text className="min-w-0 flex-1 font-sans-bold text-[15px] text-foreground">
          {copy.title}
        </Text>
      </View>
      <Text className="text-sm text-muted-foreground">{copy.body}</Text>
      <Button
        variant="secondary"
        className="h-10 min-h-0 rounded-[12px]"
        onPress={() => router.push(copy.action.href as Href)}
      >
        {copy.action.label}
      </Button>
    </View>
  );
}

function RescheduleDrawer({
  moving,
  today,
  onClose,
}: {
  moving: { item: AgendaItem; date: string } | null;
  today: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState<string | null>(null);
  const choices = moving ? rescheduleChoices(today, moving.item.endDate, moving.date) : [];

  const move = useMutation({
    mutationFn: (v: { id: string; date: string }) => agendaApi.reschedule(v.id, v.date),
  });

  const close = () => {
    setTarget(null);
    move.reset();
    onClose();
  };

  const confirm = (id: string, date: string) =>
    move.mutate(
      { id, date },
      {
        onSuccess: (r) => {
          toast.show({ message: `${r.planName} remarcado para ${agendaDayLabel(r.date).long}` });
          void qc.invalidateQueries({ queryKey: ['workout', 'agenda'] });
          close();
        },
      },
    );

  return (
    <Drawer open={moving != null} onOpenChange={(open) => !open && close()} snapPoints={['85%']}>
      <DrawerContent className="px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle>Remarcar {moving?.item.planName ?? ''}</DrawerTitle>
          <DrawerDescription>
            Escolha um dia até o fim do plano. A agenda só informa: nada é reservado.
          </DrawerDescription>
        </DrawerHeader>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-1.5 py-2">
          {choices.map((c) => {
            const on = c.date === target;
            const label = agendaDayLabel(c.date);
            return (
              <Pressable
                key={c.date}
                accessibilityRole="radio"
                accessibilityLabel={`${c.label}${c.today ? ', hoje' : ''}`}
                accessibilityState={{ checked: on }}
                onPress={() => setTarget(c.date)}
                className={cn(
                  'h-14 w-[13%] items-center justify-center rounded-[12px]',
                  on ? 'bg-foreground' : 'bg-muted',
                )}
              >
                <Text className={cn('text-[11px]', on ? 'text-background' : 'text-faint')}>
                  {c.today ? 'hoje' : label.weekday}
                </Text>
                <Text
                  className={cn(
                    'font-sans-bold text-[15px]',
                    on ? 'text-background' : 'text-foreground',
                  )}
                >
                  {label.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {choices.length === 0 ? (
          <Text className="text-sm text-faint">O plano já terminou: não há dia para remarcar.</Text>
        ) : null}
        {move.error ? (
          <FormMessage>
            {mensagemDeErro(move.error, { alternativa: 'Não deu para remarcar. Tente de novo.' })}
          </FormMessage>
        ) : null}
        <DrawerFooter className="px-0 pb-8 pt-4">
          <Button
            disabled={!target}
            loading={move.isPending}
            onPress={() => moving && target && confirm(moving.item.id, target)}
          >
            {target ? `Remarcar para ${agendaDayLabel(target).long}` : 'Escolha um dia'}
          </Button>
          <Button variant="ghost" onPress={close}>
            Cancelar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
