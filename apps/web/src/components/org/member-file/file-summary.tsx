'use client';

import { Check, ChevronRight, Lock } from 'lucide-react';
import {
  agendaDayLabel,
  fileAccessLine,
  memberPlanProgress,
  memberPlanStatus,
  memberWeekCards,
  SHARE_SCOPES,
  SHARE_SCOPE_LABEL,
  type MemberFile,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { MemberNotes } from './member-notes';

const STATE_LABEL = { planned: 'planejado', today: 'hoje', done: 'feito', missed: 'não feito' };

function Card({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-subtle bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * Resumo da ficha (Pn-05): o que ela compartilha com quem olha, planos ativos,
 * a semana (só das categorias liberadas), próximos dias, anotações e quem
 * abriu a ficha. Visitas (QR da recepção) chegam com a #390.
 */
export function FileSummary({
  file,
  firstName,
  now,
  onTab,
}: {
  file: MemberFile;
  firstName: string;
  now: Date;
  onTab: (key: 'plans' | 'agenda') => void;
}) {
  const cards = memberWeekCards(file.week);
  const ativos = file.plans.workout.filter((p) => p.status !== 'ENDED');
  const proximos = file.nextDays.filter((d) => d.items.length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`O que a ${firstName} compartilha com você`} className="lg:col-span-2">
        <ul className="flex flex-wrap gap-2">
          {SHARE_SCOPES.map((s) => {
            const on = file.grantedToMe.includes(s);
            return (
              <li
                key={s}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl bg-muted/40 px-3 py-1.5 text-xs',
                  on ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {on ? (
                  <Check size={14} aria-hidden className="text-primary" />
                ) : (
                  <Lock size={14} aria-hidden />
                )}
                {SHARE_SCOPE_LABEL[s]}
                <span className="sr-only">{on ? 'compartilha' : 'não compartilha'}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {`Só a ${firstName} muda isso, no app. Planos e agenda planejada aparecem sempre.`}
        </p>
      </Card>

      <Card
        title="Planos ativos"
        action={
          <button
            type="button"
            onClick={() => onTab('plans')}
            className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-muted"
          >
            Gerenciar <ChevronRight size={14} aria-hidden />
          </button>
        }
      >
        {ativos.length === 0 && file.plans.nutrition.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum plano mandado ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {ativos.map((p) => (
              <li key={p.offerId} className="rounded-xl bg-muted/40 px-3 py-2">
                <b className="block text-sm text-foreground">{p.title}</b>
                <span className="text-xs text-muted-foreground">
                  {`${memberPlanStatus(p.status).label} · ${memberPlanProgress(p, file.name)}`}
                </span>
              </li>
            ))}
            {file.plans.nutrition.map((n) => (
              <li key={n.id} className="rounded-xl bg-muted/40 px-3 py-2">
                <b className="block text-sm text-foreground">{n.title}</b>
                <span className="text-xs text-muted-foreground">
                  {n.status === 'ACCEPTED' ? 'ativo' : 'aguardando aceite'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Esta semana">
        {cards.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {`A ${firstName} não compartilha Treino, Alimentação nem Corpo com você.`}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {cards.map((c) => (
              <li key={c.key} className="rounded-xl bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{c.label}</p>
                <p className="text-base font-bold text-foreground tabular-nums">{c.value}</p>
                <p className="text-[11px] text-muted-foreground">{c.sub}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">Só aparece o que ela compartilha.</p>
      </Card>

      <Card
        title="Próximos dias"
        action={
          <button
            type="button"
            onClick={() => onTab('agenda')}
            className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-muted"
          >
            Agenda <ChevronRight size={14} aria-hidden />
          </button>
        }
      >
        {proximos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nada planejado nos próximos 7 dias.</p>
        ) : (
          <ul className="space-y-1">
            {proximos.flatMap((d) =>
              d.items.map((i, k) => {
                const dia = agendaDayLabel(d.date);
                return (
                  <li key={`${d.date}-${k}`} className="flex items-baseline gap-3 text-sm">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">{`${dia.weekday} ${dia.day}`}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{i.title}</span>
                    {i.state && (
                      <span className="text-[11px] text-muted-foreground">
                        {STATE_LABEL[i.state]}
                      </span>
                    )}
                  </li>
                );
              }),
            )}
          </ul>
        )}
      </Card>

      <MemberNotes file={file} now={now} />

      <Card title="Histórico de acesso à ficha" className="lg:col-span-2">
        {file.accessLog.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Ninguém da equipe abriu uma categoria dela ainda.
          </p>
        ) : (
          <ul className="space-y-1">
            {file.accessLog.map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                className={cn('text-xs', e.denied ? 'text-muted-foreground' : 'text-foreground')}
              >
                {fileAccessLine(e, now, file.timezone)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {`Cada categoria aberta aqui entra em "Quem olhou seus dados", no app da ${firstName}.`}
        </p>
      </Card>
    </div>
  );
}
