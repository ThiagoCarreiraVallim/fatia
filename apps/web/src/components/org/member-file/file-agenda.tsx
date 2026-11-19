'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  agendaDayLabel,
  agendaRangeLabel,
  agendaWeek,
  memberFileApi,
  monthGrid,
  type MemberAgendaItem,
  type MemberFile,
} from '@fatia/api-client';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fileKeys } from './keys';

type View = 'week' | 'month';

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const STATE_LABEL: Record<NonNullable<MemberAgendaItem['state']>, string> = {
  planned: 'planejado',
  today: 'hoje',
  done: 'feito',
  missed: 'não feito',
};

function itemLine(i: MemberAgendaItem): string {
  if (i.kind === 'weighin')
    return i.weightKg !== null ? `${String(i.weightKg).replace('.', ',')} kg` : '';
  return i.state ? STATE_LABEL[i.state] : '';
}

/**
 * A agenda da pessoa (Pn-05d): o que a equipe planejou e o que ela fez. Não é
 * agenda de aulas (PRD §5): sem reserva, vaga ou presença. "Feito" só com
 * Treino liberado; a pesagem só com Corpo. Eventos da comunidade com "Vou"
 * chegam com a agenda da comunidade (#397).
 */
export function FileAgenda({ file }: { file: MemberFile }) {
  const [view, setView] = useState<View>('week');
  // O primeiro dos próximos dias é o hoje da pessoa, no fuso dela.
  const [anchor, setAnchor] = useState(
    () => file.nextDays[0]?.date ?? new Date().toISOString().slice(0, 10),
  );
  const range =
    view === 'week' ? { ...agendaWeek(anchor), label: null as string | null } : monthGrid(anchor);
  const agenda = useQuery({
    queryKey: fileKeys.agenda(file.groupId, file.membershipId, range.from, range.to),
    queryFn: () => memberFileApi.agenda(file.groupId, file.membershipId, range.from, range.to),
  });
  const step = (dir: -1 | 1) =>
    setAnchor((a) =>
      view === 'week'
        ? addDays(a, 7 * dir)
        : `${new Date(Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1 + dir, 1))
            .toISOString()
            .slice(0, 10)}`,
    );
  const title = range.label ?? agendaRangeLabel(range.from, range.to);
  const month = anchor.slice(0, 7);

  return (
    <section className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => step(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <h2 className="min-w-28 text-center text-sm font-bold text-foreground">{title}</h2>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => step(1)}
            className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        <Segmented
          label="Ver por"
          value={view}
          onChange={setView}
          options={[
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
          ]}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        o que a equipe planejou e o que ela fez · não é agenda de aulas
      </p>

      {agenda.isLoading && <Skeleton className="h-40 rounded-2xl bg-muted/40" />}
      {agenda.isError && (
        <p className="text-xs text-muted-foreground">Não deu para carregar a agenda.</p>
      )}
      {agenda.data &&
        (view === 'week' ? (
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-7">
            {agenda.data.days.map((d) => {
              const label = agendaDayLabel(d.date);
              return (
                <li
                  key={d.date}
                  className={cn(
                    'min-h-20 rounded-xl bg-muted/40 p-2',
                    d.date === agenda.data.today && 'ring-1 ring-primary',
                  )}
                >
                  <p className="text-[11px] text-muted-foreground">
                    {label.weekday} <b className="text-foreground">{label.day}</b>
                  </p>
                  <ul className="mt-1 space-y-1">
                    {d.items.map((i, k) => (
                      <li
                        key={k}
                        className={cn(
                          'rounded-lg bg-card px-2 py-1',
                          i.state === 'planned' && 'opacity-70',
                        )}
                      >
                        <p className="truncate text-xs font-bold text-foreground">{i.title}</p>
                        <p className="text-[11px] text-muted-foreground">{itemLine(i)}</p>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[420px] grid-cols-7 gap-1 text-center">
              {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((w) => (
                <span key={w} className="text-[11px] text-muted-foreground">
                  {w}
                </span>
              ))}
              {agenda.data.days.map((d) => (
                <div
                  key={d.date}
                  title={d.items.map((i) => `${i.title} ${itemLine(i)}`.trim()).join(' · ')}
                  className={cn(
                    'min-h-14 rounded-lg bg-muted/40 p-1 text-left',
                    !d.date.startsWith(month) && 'opacity-40',
                    d.date === agenda.data.today && 'ring-1 ring-primary',
                  )}
                >
                  <b className="text-xs text-foreground">{Number(d.date.slice(8, 10))}</b>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {d.items.map((i, k) => (
                      <span
                        key={k}
                        aria-label={`${i.title} ${itemLine(i)}`.trim()}
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          i.kind === 'weighin' ? 'bg-amber-500' : 'bg-primary',
                          i.state === 'planned' && 'opacity-50',
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              treino do plano{agenda.data.showsWeighins ? ' · pesagem' : ''} · apagado = planejado
            </p>
          </div>
        ))}
      {agenda.data && !agenda.data.showsDone && (
        <p className="text-[11px] text-muted-foreground">
          Sem Treino liberado, a agenda mostra só o planejado, sem dizer o que foi feito.
        </p>
      )}
    </section>
  );
}
