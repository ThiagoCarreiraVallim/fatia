'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Download } from 'lucide-react';
import {
  ApiError,
  SMALL_SAMPLE,
  activeMembersLine,
  challengeCountLabel,
  challengeFinishedLabel,
  challengeKindShort,
  challengeLiftLine,
  challengeReviewedLabel,
  dayMonth,
  decimalBR,
  deltaPctLabel,
  deltaPtsLabel,
  originRowName,
  panelHref,
  plansLine,
  reportApi,
  reportMonthOption,
  reportTitle,
  reviewsLine,
  sessionsLine,
  teamRoleLabel,
  weeksSummary,
  type MonthReport,
  type ReportSettings,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { linePaths } from '@/components/org/chart-paths';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const cartao =
  'flex flex-col rounded-2xl bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))] md:px-5 md:py-[18px] print:break-inside-avoid';

const MONTH = /^\d{4}-\d{2}$/;
const num = (n: number) => n.toLocaleString('pt-BR');

function apiError(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

interface KpiData {
  label: string;
  value: string | null;
  delta?: string | null;
  line: string;
}

function Kpi({ k }: { k: KpiData }) {
  return (
    <li className={cn(cartao, 'min-h-32 gap-1')}>
      <span className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        {k.label}
        {k.delta && (
          <span className="rounded-full px-2 text-xs font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]">
            {k.delta}
          </span>
        )}
      </span>
      {k.value === null ? (
        <span className="mt-1 text-sm text-muted-foreground">{SMALL_SAMPLE}</span>
      ) : (
        <span className="mt-1 font-display text-[30px] font-semibold tabular-nums">{k.value}</span>
      )}
      <span className="mt-auto pt-2 text-[12.5px] text-muted-foreground">{k.line}</span>
    </li>
  );
}

function kpis(r: MonthReport): KpiData[] {
  const a = r.activeMembers;
  const reviewedValue =
    r.reviews.reviewed === 0
      ? '0'
      : r.reviews.withinDayPercent === null
        ? null
        : `${r.reviews.withinDayPercent}%`;
  return [
    {
      label: 'Membros ativos',
      value: a.percent === null ? null : `${a.percent}%`,
      delta: deltaPtsLabel(a.deltaPts),
      line: activeMembersLine(r),
    },
    {
      label: 'Sessões de treino',
      value: r.sessions.total === null ? null : num(r.sessions.total),
      delta: deltaPctLabel(r.sessions.deltaPct),
      line: sessionsLine(r),
    },
    {
      label: 'Dias com treino',
      value: r.trainingDays.perActive === null ? null : decimalBR(r.trainingDays.perActive),
      delta: deltaPctLabel(r.trainingDays.deltaPct),
      line: 'por membro ativo, em média',
    },
    {
      label: 'Voltaram após 14 dias',
      value: r.returned === null ? null : num(r.returned),
      line: 'pessoas que voltaram a treinar',
    },
    {
      label: `Sem treino há ${r.riskDays}+ dias`,
      value: r.atRisk === null ? null : num(r.atRisk),
      line: 'no fim do mês · só o número, sem nomes',
    },
    {
      label: 'Planos enviados',
      value: r.plans.sent === null ? null : num(r.plans.sent),
      line: plansLine(r.plans),
    },
    {
      label: 'Treinos revisados',
      value: reviewedValue,
      line: reviewsLine(r.reviews),
    },
  ];
}

/** "Sessões por semana" (Pn-03): barras S1…S5 e a linha da meta da equipe. */
function WeeksChart({ r }: { r: MonthReport }) {
  const goal = r.weeklySessionsGoal;
  const max = Math.max(1, goal ?? 0, ...r.weeks.map((w) => w.value ?? 0)) * 1.1;
  const label = r.weeks
    .map(
      (w, i) =>
        `S${i + 1} ${w.value === null ? 'amostra pequena' : num(w.value)}${w.days < 7 ? ` (${w.days} dias)` : ''}`,
    )
    .join(', ');
  const largura = 1000 / Math.max(1, r.weeks.length);
  const summary = weeksSummary(r);
  return (
    <section aria-labelledby="semanas" className={cn(cartao, 'gap-2')}>
      <h2 id="semanas" className="text-sm font-semibold">
        Sessões por semana
      </h2>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {r.weeksAverage !== null && (
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-bold tabular-nums">
              {num(r.weeksAverage)}
            </span>{' '}
            <span className="text-sm text-muted-foreground">média</span>
          </p>
        )}
        {goal && (
          <span className="ml-auto text-xs text-muted-foreground">{`meta da equipe ${num(goal)}`}</span>
        )}
      </div>
      <svg
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Sessões por semana: ${label}`}
        className="h-44 w-full overflow-visible"
      >
        {r.weeks.map((w, i) => {
          if (w.value === null) return null;
          const h = (w.value / max) * 190;
          return (
            <rect
              key={w.key}
              x={i * largura + largura * 0.2}
              y={200 - h}
              width={largura * 0.6}
              height={h}
              rx={6}
              fill="hsl(var(--primary))"
            />
          );
        })}
        {goal && (
          <line
            x1="0"
            x2="1000"
            y1={200 - (goal / max) * 190}
            y2={200 - (goal / max) * 190}
            stroke="hsl(var(--foreground))"
            strokeDasharray="6 6"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="flex text-[11.5px] text-muted-foreground">
        {r.weeks.map((w, i) => (
          <span key={w.key} className="flex-1 text-center">
            {`S${i + 1}`}
            {w.value === null && ' · oculta'}
          </span>
        ))}
      </div>
      {summary && <p className="text-xs font-semibold">{summary}</p>}
      {r.weeks.some((w) => w.value === null) && (
        <p className="text-xs text-muted-foreground">
          Semanas com menos de 5 pessoas de cada lado (treinou e não treinou) ficam em branco.
        </p>
      )}
    </section>
  );
}

/** A área sob um trecho da linha, fechada no chão do `viewBox`. */
function areaPath(d: string): string {
  const xs = [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => m[1]);
  return `${d} L${xs[xs.length - 1]} 200 L${xs[0]} 200 Z`;
}

/** "Membros ativos" (Pn-03): quantos já tinham treinado no mês, dia a dia. */
function ActiveChart({ r }: { r: MonthReport }) {
  const max = Math.max(1, ...r.activeByDay.map((c) => c.value ?? 0)) * 1.1;
  const a = r.activeMembers;
  const delta =
    a.delta === null
      ? null
      : `${a.delta > 0 ? '+' : a.delta < 0 ? '−' : ''}${num(Math.abs(a.delta))}`;
  const paths = linePaths(r.activeByDay, max);
  const cells = r.activeByDay;
  const ticks =
    cells.length > 2
      ? [cells[0]!, cells[Math.floor((cells.length - 1) / 2)]!, cells[cells.length - 1]!]
      : cells;
  return (
    <section aria-labelledby="ativos" className={cn(cartao, 'gap-2')}>
      <h2 id="ativos" className="text-sm font-semibold">
        Membros ativos
      </h2>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {a.value !== null && (
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-bold tabular-nums">{num(a.value)}</span>{' '}
            <span className="text-sm text-muted-foreground">pessoas</span>
          </p>
        )}
        {delta && (
          <span
            aria-label={`${delta} em relação ao mês anterior`}
            className="ml-auto rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-text"
          >
            {`${delta} no mês`}
          </span>
        )}
      </div>
      <svg
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Membros ativos ao longo do mês${a.value === null ? '' : `: ${num(a.value)} no fim`}`}
        className="h-44 w-full overflow-visible"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2="1000"
            y1={190 - f * 175}
            y2={190 - f * 175}
            stroke="hsl(var(--border))"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {paths.map((d, i) => (
          <path key={`a${i}`} d={areaPath(d)} fill="hsl(var(--primary) / 0.14)" stroke="none" />
        ))}
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div aria-hidden className="flex justify-between text-[11.5px] text-muted-foreground">
        {ticks.map((c) => (
          <span key={c.key}>{dayMonth(c.key).replace(/^0/, '')}</span>
        ))}
      </div>
      {r.activeByDay.some((c) => c.value === null) && (
        <p className="text-xs text-muted-foreground">
          Semanas com menos de 5 pessoas de cada lado ficam em branco.
        </p>
      )}
    </section>
  );
}

function Challenges({ r }: { r: MonthReport }) {
  if (!r.challenges.length) return null;
  const lift = challengeLiftLine(r.challengeLift);
  return (
    <section className="space-y-2 print:break-inside-avoid">
      <div className="overflow-x-auto rounded-2xl border border-subtle bg-card">
        <table className="w-full text-sm">
          <caption className="p-3 text-left text-sm font-semibold">
            Desafios do mês{' '}
            <span className="font-normal text-muted-foreground">· ninguém aparece com nome</span>
          </caption>
          <thead>
            <tr className="border-b border-subtle text-left text-xs text-muted-foreground">
              <th className="p-3 font-medium">Desafio</th>
              <th className="p-3 font-medium">Tipo</th>
              <th className="p-3 font-medium">Participantes</th>
              <th className="p-3 font-medium">Terminaram</th>
              <th className="p-3 font-medium">Revisados</th>
            </tr>
          </thead>
          <tbody>
            {r.challenges.map((c) => (
              <tr key={c.id} className="border-b border-subtle last:border-0">
                <td className="p-3 font-semibold">{c.title}</td>
                <td className="p-3 text-muted-foreground">{challengeKindShort(c.kind)}</td>
                <td className="p-3 tabular-nums">{challengeCountLabel(c.participants)}</td>
                <td className="p-3 tabular-nums">{challengeFinishedLabel(c)}</td>
                <td className="p-3 tabular-nums">{challengeReviewedLabel(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lift && <p className="text-sm">{lift}</p>}
    </section>
  );
}

/** O bloco "Origem dos convites · 30 dias" do relatório, com "Abrir" para a tela inteira. */
function OriginsSummary({ groupId }: { groupId: string }) {
  const q = useQuery({
    queryKey: orgKeys.inviteOrigins(groupId, 30),
    queryFn: () => reportApi.origins(groupId, 30),
  });
  const rows = q.data?.rows.slice(0, 4) ?? [];
  return (
    <section aria-labelledby="origens" className={cn(cartao, 'gap-2')}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="origens" className="text-sm font-semibold">
          Origem dos convites{' '}
          <span className="font-normal text-muted-foreground">· 30 dias · dado novo</span>
        </h2>
        <Link
          href={panelHref(groupId, 'origins')}
          className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground print:hidden"
        >
          Abrir <ChevronRight size={14} aria-hidden />
        </Link>
      </div>
      {q.isPending && <Skeleton className="h-16 rounded-xl" />}
      {q.isError && (
        <p className="text-sm text-muted-foreground">Não deu para carregar as origens agora.</p>
      )}
      {q.data && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ainda sem dados. Dê um nome a cada link ou QR ao criar o convite.
        </p>
      )}
      <ul className="divide-y divide-subtle">
        {rows.map((o) => (
          <li key={o.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <b className="block truncate">{originRowName(o)}</b>
              <span className="text-xs text-muted-foreground">
                {o.joined === null
                  ? SMALL_SAMPLE
                  : o.activated === null
                    ? `${num(o.joined)} entraram`
                    : `${num(o.joined)} entraram · ${num(o.activated)} ativaram`}
              </span>
            </span>
            {o.joined !== null &&
              (o.percent === null ? (
                <span className="text-right text-xs text-muted-foreground">{SMALL_SAMPLE}</span>
              ) : (
                <span className="font-display text-lg font-semibold tabular-nums">{`${o.percent}%`}</span>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A meta da equipe; o campo começa do valor salvo (a `key` reinicia ao salvar). */
function GoalForm({
  initial,
  pending,
  onSave,
}: {
  initial: number | null;
  pending: boolean;
  onSave: (goal: number | null) => void;
}) {
  const [goal, setGoal] = useState(initial === null ? '' : String(initial));
  const goalNumber = goal.trim() === '' ? null : Number(goal);
  const goalValid =
    goalNumber === null ||
    (Number.isInteger(goalNumber) && goalNumber >= 1 && goalNumber <= 100_000);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (goalValid) onSave(goalNumber);
      }}
    >
      <div className="space-y-1">
        <label htmlFor="meta-semanal" className="text-sm font-medium">
          Meta de sessões por semana
        </label>
        <Input
          id="meta-semanal"
          type="number"
          inputMode="numeric"
          min={1}
          max={100_000}
          value={goal}
          placeholder="sem meta"
          onChange={(e) => setGoal(e.target.value)}
          className="w-40"
        />
      </div>
      <Button type="submit" variant="outline" disabled={!goalValid || pending}>
        Salvar meta
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Aparece como linha no gráfico de sessões por semana. Deixe vazio para tirar.
      </p>
    </form>
  );
}

/** Meta da equipe e e-mail mensal: só o dono muda (`group.update`). */
function Settings({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: orgKeys.reportSettings(groupId),
    queryFn: () => reportApi.settings(groupId),
  });
  const done = (s: ReportSettings) => {
    qc.setQueryData(orgKeys.reportSettings(groupId), s);
    void qc.invalidateQueries({ queryKey: ['community', 'org', groupId, 'report'] });
  };
  const fail = (err: unknown) => toast(apiError(err, 'Não deu para salvar agora.'));
  const update = useMutation({
    mutationFn: (body: { weeklySessionsGoal?: number | null; reportEmailEnabled?: boolean }) =>
      reportApi.updateSettings(groupId, body),
    onSuccess: (s, body) => {
      done(s);
      if ('weeklySessionsGoal' in body) toast('Meta salva.');
    },
    onError: fail,
  });
  const recipient = useMutation({
    mutationFn: (v: { membershipId: string; enabled: boolean }) =>
      reportApi.setRecipient(groupId, v.membershipId, v.enabled),
    onSuccess: done,
    onError: fail,
  });

  const s = q.data;
  return (
    <section aria-labelledby="ajustes-relatorio" className={cn(cartao, 'gap-4 print:hidden')}>
      <h2 id="ajustes-relatorio" className="text-sm font-semibold">
        E-mail mensal e meta
      </h2>
      {q.isPending && <Skeleton className="h-24 rounded-xl" />}
      {q.isError && (
        <p className="text-sm text-muted-foreground">Não deu para carregar os ajustes agora.</p>
      )}
      {s && (
        <>
          <GoalForm
            key={String(s.weeklySessionsGoal)}
            initial={s.weeklySessionsGoal}
            pending={update.isPending}
            onSave={(weeklySessionsGoal) => update.mutate({ weeklySessionsGoal })}
          />

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                Mandar o relatório por e-mail no 1º dia útil do mês
              </p>
              <p className="text-xs text-muted-foreground">
                {s.emailAvailable
                  ? 'Sai às 8 h no fuso da comunidade, com o mês que acabou. Só números agregados.'
                  : 'O envio de e-mail não está ligado neste servidor: o relatório fica só no painel.'}
              </p>
            </div>
            <Switch
              label="Mandar o relatório por e-mail no 1º dia útil do mês"
              checked={s.reportEmailEnabled && s.emailAvailable}
              disabled={!s.emailAvailable || update.isPending}
              onCheckedChange={(v) => update.mutate({ reportEmailEnabled: v })}
            />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">Quem recebe</p>
            <ul className="divide-y divide-subtle">
              {s.team.map((m) => (
                <li key={m.membershipId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{m.name}</b>
                    <span className="text-xs text-muted-foreground">{teamRoleLabel(m.role)}</span>
                  </span>
                  {m.role === 'OWNER' ? (
                    <span className="text-xs text-muted-foreground">sempre recebe</span>
                  ) : (
                    <Checkbox
                      label={`${m.name} recebe o relatório`}
                      checked={m.reportEmail}
                      onCheckedChange={(enabled) =>
                        recipient.mutate({ membershipId: m.membershipId, enabled })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Cada pessoa pode parar de receber pelo link no fim do e-mail.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Relatório do mês (#400, Pn-03). Só agregado: a base de todo número é quem
 * aceitou entrar nas estatísticas, e o que tem menos de 5 pessoas sai como
 * "amostra pequena". "Baixar PDF" é a impressão do navegador (`@media print`).
 * Visitas e avaliações ficam de fora até existirem (#390, #383).
 */
export default function ReportPage() {
  const g = useOrgGroup();
  // O mês do link do e-mail (`?month=YYYY-MM`); o resto a API valida.
  const fromLink = useSearchParams().get('month');
  const [month, setMonth] = useState<string | undefined>(() =>
    fromLink && MONTH.test(fromLink) ? fromLink : undefined,
  );
  const q = useQuery({
    queryKey: orgKeys.monthReport(g.id, month),
    queryFn: () => reportApi.report(g.id, month),
    placeholderData: keepPreviousData,
  });
  const r = q.data;

  if (q.isPending) return <Skeleton className="h-96 rounded-2xl bg-card" />;
  if (!r) {
    return (
      <ErrorState
        message={apiError(q.error, 'Não deu para carregar o relatório agora.')}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const current = r.months[0] ?? r.month;
  return (
    <div id="month-report" className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-64 flex-1">
          <h1 className="font-display text-xl font-bold">{reportTitle(r.month, current)}</h1>
          <p className="text-sm text-muted-foreground">
            Agregado da comunidade · ninguém aparece com nome
          </p>
        </div>
        <label className="print:hidden">
          <span className="sr-only">Mês do relatório</span>
          <select
            aria-label="Mês do relatório"
            value={r.month}
            onChange={(e) => setMonth(e.target.value)}
            className="min-h-10 rounded-xl border border-subtle bg-background px-3 text-sm"
          >
            {r.months.map((m) => (
              <option key={m} value={m}>
                {reportMonthOption(m, current)}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" className="gap-1 print:hidden" onClick={() => window.print()}>
          <Download size={16} aria-hidden /> Baixar PDF
        </Button>
      </div>

      <ul
        aria-label="Resumo do mês"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4"
      >
        {kpis(r).map((k) => (
          <Kpi key={k.label} k={k} />
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2">
        <WeeksChart r={r} />
        <ActiveChart r={r} />
      </div>

      <Challenges r={r} />

      <OriginsSummary groupId={g.id} />

      <p className="text-xs text-muted-foreground">
        {`A base é quem aceitou entrar nas estatísticas. Grupos com menos de 5 pessoas não aparecem. "Sem treino" conta ${r.riskDays} dias ou mais sem registrar treino.`}
      </p>

      <Settings groupId={g.id} />
    </div>
  );
}
