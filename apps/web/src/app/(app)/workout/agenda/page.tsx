'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Moon,
  Trophy,
  X,
} from 'lucide-react';
import {
  addDays,
  agendaApi,
  agendaDayLabel,
  agendaItemCopy,
  agendaPlanLabel,
  agendaRangeLabel,
  agendaWeek,
  endedText,
  monthGrid,
  rescheduleDays,
  type Agenda,
  type AgendaItem,
  type AgendaState,
} from '@fatia/api-client';
import { ErrorState } from '@/components/elements/error-state';
import { errorMessage } from '@/components/nutrition/error-message';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useStartSession } from '@/components/workout/cards/workout-cards';
import { hojeIso } from '@/lib/dias';
import { cn } from '@/lib/utils';

type View = 'week' | 'month';

const DOT: Record<AgendaState, string> = {
  done: 'bg-primary',
  missed: 'bg-danger',
  today: 'bg-brand',
  planned: 'bg-protein',
};
const WEEK_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/** Primeiro dia do mês seguinte (ou anterior, com `step` -1). */
const shiftMonth = (day: string, step: 1 | -1) => {
  const [y, m] = [Number(day.slice(0, 4)), Number(day.slice(5, 7))];
  return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 10);
};

/**
 * Agenda de treinos (#379, pranchas Al-T24, T24b e T24c). Informativa (ADR
 * 042): não reserva nada nem marca presença. "Feito" e "não feito" vêm do
 * treino concluído; "Remarcar" move a sessão para qualquer dia de hoje até o
 * fim do plano, nunca depois, e pergunta antes.
 */
export default function AgendaPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(hojeIso);
  const [picked, setPicked] = useState<string | null>(null);
  const [moving, setMoving] = useState<AgendaItem | null>(null);
  const start = useStartSession();

  const grid = view === 'week' ? agendaWeek(anchor) : monthGrid(anchor);
  const q = useQuery({
    queryKey: ['workout', 'agenda', grid.from, grid.to],
    queryFn: () => agendaApi.range(grid.from, grid.to),
  });

  const move = (step: 1 | -1) => {
    setPicked(null);
    setAnchor((a) => (view === 'week' ? addDays(a, 7 * step) : shiftMonth(a, step)));
  };

  const rangeLabel =
    view === 'week' ? agendaRangeLabel(grid.from, grid.to) : monthGrid(anchor).label;

  return (
    <div className="space-y-3.5 px-4 pb-8 pt-2">
      <Segmented<View>
        label="Ver por"
        value={view}
        onChange={(v) => {
          setView(v);
          setPicked(null);
        }}
        options={[
          { value: 'week', label: 'Semana' },
          { value: 'month', label: 'Mês' },
        ]}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={view === 'week' ? 'Semana anterior' : 'Mês anterior'}
          onClick={() => move(-1)}
          className="anim-press flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-muted"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <b className="shrink-0 text-[15px] tabular-nums">{rangeLabel}</b>
        <button
          type="button"
          aria-label={view === 'week' ? 'Próxima semana' : 'Próximo mês'}
          onClick={() => move(1)}
          className="anim-press flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-muted"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
        {q.data && (
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
            {agendaPlanLabel(q.data)}
          </span>
        )}
      </div>

      {q.isLoading && <Skeleton className="h-[72px] rounded-card bg-muted" />}
      {q.isError && (
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar a agenda"
          detail={q.error instanceof Error ? q.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void q.refetch()}
        />
      )}
      {q.data && (
        <AgendaBody
          agenda={q.data}
          view={view}
          month={anchor.slice(0, 7)}
          picked={picked}
          onPick={setPicked}
          starting={start.isPending}
          onOpen={(item) => start.mutate(item.planId, { onSuccess: () => router.push('/workout') })}
          onReschedule={setMoving}
        />
      )}

      {q.data && (
        <RescheduleSheet
          item={moving}
          today={q.data.today}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            void qc.invalidateQueries({ queryKey: ['workout', 'agenda'] });
          }}
        />
      )}
    </div>
  );
}

function AgendaBody({
  agenda,
  view,
  month,
  picked,
  onPick,
  starting,
  onOpen,
  onReschedule,
}: {
  agenda: Agenda;
  view: View;
  month: string;
  picked: string | null;
  onPick: (day: string) => void;
  starting: boolean;
  onOpen: (item: AgendaItem) => void;
  onReschedule: (item: AgendaItem) => void;
}) {
  const inRange = (d: string) => d >= agenda.from && d <= agenda.to;
  const fallback = inRange(agenda.today)
    ? agenda.today
    : view === 'month'
      ? (agenda.days.find((d) => d.date.startsWith(month))?.date ?? agenda.from)
      : agenda.from;
  const selected = picked && inRange(picked) ? picked : fallback;
  const day = agenda.days.find((d) => d.date === selected);
  const label = agendaDayLabel(selected);

  const dayButton = (date: string, items: AgendaItem[], compact: boolean) => {
    const l = agendaDayLabel(date);
    const on = date === selected;
    const outside = compact && !date.startsWith(month);
    const first = items[0];
    return (
      <button
        key={date}
        type="button"
        aria-pressed={on}
        aria-label={`${l.long}${date === agenda.today ? ', hoje' : ''}${
          items.length ? `, ${items.length} ${items.length === 1 ? 'treino' : 'treinos'}` : ''
        }`}
        onClick={() => onPick(date)}
        className={cn(
          'anim-press flex flex-col items-center justify-center gap-1 rounded-[16px]',
          compact ? 'h-12' : 'h-[72px] flex-1',
          on ? 'bg-muted shadow-[inset_0_0_0_1.5px_hsl(var(--border-strong))]' : 'bg-card',
          outside && 'opacity-40',
        )}
      >
        {!compact && (
          <span aria-hidden className="text-[11px] text-muted-foreground">
            {l.weekday}
          </span>
        )}
        <b aria-hidden className={cn('tabular-nums', compact ? 'text-sm' : 'text-base')}>
          {l.day}
        </b>
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 rounded-[3px]',
            first ? DOT[first.state] : agenda.empty ? 'bg-transparent' : 'bg-border-strong',
          )}
        />
      </button>
    );
  };

  return (
    <>
      {view === 'week' ? (
        <div className="flex gap-1">
          {agenda.days.map((d) => dayButton(d.date, d.items, false))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {WEEK_LETTERS.map((w, i) => (
            <span key={i} aria-hidden className="text-center text-[11px] text-faint">
              {w}
            </span>
          ))}
          {agenda.days.map((d) => dayButton(d.date, d.items, true))}
        </div>
      )}

      {agenda.empty && (
        <div className="flex flex-col items-center gap-2 rounded-card bg-card px-5 py-7 text-center">
          <CalendarDays size={22} aria-hidden className="text-faint" />
          <b>Nada planejado</b>
          <span className="text-xs text-muted-foreground">
            Quando a equipe enviar um plano com datas, as sessões aparecem aqui. Planos flexíveis
            seguem no seu ritmo.
          </span>
          <Link
            href="/workout/plans"
            className="anim-press mt-1 inline-flex h-10 items-center rounded-[12px] bg-muted px-4 text-sm font-bold"
          >
            Ver meus planos
          </Link>
        </div>
      )}

      {agenda.ended && <EndedCard ended={agenda.ended} />}

      {/* Como a prancha T24c: com o plano encerrado, só o cartão do fim. */}
      {!agenda.empty && !agenda.ended && (
        <>
          <span className="block text-xs font-bold uppercase tracking-[0.04em] text-faint">
            {label.long}
          </span>
          {day && day.items.length > 0 ? (
            <ul className="space-y-2">
              {day.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  starting={starting}
                  onOpen={() => onOpen(item)}
                  onReschedule={() => onReschedule(item)}
                />
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 rounded-card bg-card px-4 py-3">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-muted text-muted-foreground"
              >
                <Moon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[15px]">Descanso</b>
                <span className="block text-xs text-muted-foreground">sem sessão neste dia</span>
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Plano de calendário: cada sessão tem dia. Plano flexível: aparece só a próxima sessão.
          </p>
        </>
      )}
    </>
  );
}

function EndedCard({ ended }: { ended: NonNullable<Agenda['ended']> }) {
  const text = endedText(ended);
  return (
    <div className="space-y-2 rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]">
      <p className="flex items-center gap-2">
        <Trophy size={16} aria-hidden className="text-steps" />
        <b>{text.title}</b>
      </p>
      <p className="text-sm text-muted-foreground">{text.body}</p>
      <Link
        href={text.action.href}
        className="anim-press flex h-10 w-full items-center justify-center rounded-[12px] bg-muted px-4 text-sm font-bold"
      >
        {text.action.label}
      </Link>
    </div>
  );
}

function ItemCard({
  item,
  starting,
  onOpen,
  onReschedule,
}: {
  item: AgendaItem;
  starting: boolean;
  onOpen: () => void;
  onReschedule: () => void;
}) {
  const copy = agendaItemCopy(item);
  const Icon = copy.tone === 'done' ? Check : copy.tone === 'missed' ? X : Dumbbell;
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-card bg-card px-4 py-3',
        copy.tone === 'today' && 'shadow-[inset_0_0_0_1.5px_hsl(var(--brand))]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]',
          copy.tone === 'done' && 'bg-primary/15 text-primary',
          copy.tone === 'missed' && 'bg-[hsl(var(--danger)/0.14)] text-danger',
          copy.tone === 'today' && 'bg-[hsl(var(--brand)/0.16)] text-brand',
          copy.tone === 'planned' && 'bg-muted text-muted-foreground',
        )}
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px]">{copy.title}</b>
        <span className="block truncate text-xs text-muted-foreground">{copy.subtitle}</span>
      </span>
      {copy.open && (
        <Button size="xs" disabled={starting} onClick={onOpen}>
          Abrir
        </Button>
      )}
      {copy.reschedule && (
        <Button size="xs" variant="secondary" className="bg-muted" onClick={onReschedule}>
          Remarcar
        </Button>
      )}
    </li>
  );
}

/** A folha do "Remarcar": os dias de hoje ao fim do plano, e só grava no botão. */
function RescheduleSheet({
  item,
  today,
  onClose,
  onDone,
}: {
  item: AgendaItem | null;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [day, setDay] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: { id: string; date: string }) => agendaApi.reschedule(v.id, v.date),
    onSuccess: (r) => {
      toast(`${r.planName} remarcado para ${agendaDayLabel(r.date).long}`);
      setDay(null);
      onDone();
    },
    onError: (e) =>
      toast.error(errorMessage(e, { fallback: 'Não deu para remarcar. Tente de novo.' })),
  });
  const days = item?.endDate ? rescheduleDays(today, item.endDate) : [];
  const close = () => {
    setDay(null);
    onClose();
  };

  return (
    <Drawer open={item !== null} onOpenChange={(open) => !open && close()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl font-bold">
            Remarcar {item?.planName}
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground">
            Escolha um dia até o fim do plano. A agenda só informa: nada é reservado.
          </DrawerDescription>
        </DrawerHeader>
        <div
          role="radiogroup"
          aria-label="Novo dia"
          className="grid grid-cols-4 gap-1.5 px-4 sm:grid-cols-7"
        >
          {days.map((d) => {
            const l = agendaDayLabel(d);
            const on = d === day;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={l.long}
                onClick={() => setDay(d)}
                className={cn(
                  'anim-press flex h-14 flex-col items-center justify-center rounded-[14px]',
                  on ? 'bg-foreground text-background' : 'bg-muted',
                )}
              >
                <span aria-hidden className="text-[11px]">
                  {d === today ? 'hoje' : l.weekday}
                </span>
                <b aria-hidden className="tabular-nums">
                  {l.day}
                </b>
              </button>
            );
          })}
        </div>
        <DrawerFooter className="gap-2">
          <Button
            size="xl"
            full
            disabled={!day || !item || save.isPending}
            onClick={() => item && day && save.mutate({ id: item.id, date: day })}
          >
            {save.isPending
              ? 'Remarcando...'
              : day
                ? `Remarcar para ${agendaDayLabel(day).long}`
                : 'Escolha um dia'}
          </Button>
          <Button variant="text" size="xl" full onClick={close}>
            Cancelar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
