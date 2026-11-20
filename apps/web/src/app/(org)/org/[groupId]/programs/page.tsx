'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Lock, Search, Send } from 'lucide-react';
import {
  filterPlanPrograms,
  panelHref,
  phaseDates,
  planProgramDates,
  planProgramKindLabel,
  planProgramProgressLine,
  planProgramsApi,
  planProgramStatusLabel,
  planProgramTabs,
  type ChipTone,
  type PlanProgramItem,
  type PlanProgramStatus,
  type PlanProgramTab,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { CountTabs, PanelPageHead, PanelTable, StatusChip } from '@/components/org/panel-bits';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TONE: Record<PlanProgramStatus, ChipTone> = {
  SENT: 'neutral',
  SCHEDULED: 'info',
  ACTIVE: 'ok',
  ENDING: 'ok',
  ENDED: 'muted',
};

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/**
 * Programas (#403, Pn-30): os planos com começo e fim que a equipe mandou,
 * por aluno, com o progresso de quem libera Treino. Quem não libera aparece
 * só como "enviado". O plano que termina vai para Para revisar.
 */
export default function OrgProgramsPage() {
  const g = useOrgGroup();
  const [aba, setAba] = useState<PlanProgramTab>('all');
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: orgKeys.planPrograms(g.id),
    queryFn: () => planProgramsApi.list(g.id),
  });

  const cabeca = (
    <PanelPageHead
      title="Programas"
      subtitle="Planos com começo e fim, por aluno. Quando termina, vai para Para revisar."
      action={
        <Link href={panelHref(g.id, 'content')} className={cn(buttonVariants(), 'gap-1.5')}>
          <Send size={16} aria-hidden /> Enviar plano
        </Link>
      }
    />
  );

  if (q.isPending) return <Skeleton className="h-64 rounded-2xl bg-card" />;
  if (q.isError) {
    return (
      <EmptyState
        title="Não deu para carregar os programas"
        action={
          <Button variant="outline" onClick={() => q.refetch()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  const v = q.data;
  if (v.items.length === 0) {
    return (
      <div className="space-y-4">
        {cabeca}
        <EmptyState
          title="Nenhum plano com começo e fim ainda"
          description="Mande um plano de calendário pela seção Planos e dicas: ele aparece aqui, com o progresso de quem compartilha Treino."
        />
      </div>
    );
  }

  const itens = filterPlanPrograms(v.items, aba, busca);
  const comFases = v.items.filter((i) => i.phases.length > 0);
  const sel = comFases.find((i) => i.offerId === selId) ?? comFases[0] ?? null;

  return (
    <div className="space-y-4">
      {cabeca}

      <div className="flex flex-wrap items-center gap-2">
        <CountTabs label="Status" value={aba} onChange={setAba} tabs={planProgramTabs(v.counts)} />
        <label className="relative ml-auto block w-full sm:w-64">
          <span className="sr-only">Buscar aluno ou plano</span>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno ou plano"
            className="pl-9"
          />
        </label>
      </div>

      <PanelTable
        label="Programas por aluno"
        minWidth={860}
        head={['Aluno e plano', 'Tipo', 'Datas', 'Etiquetas', 'Progresso', 'Status']}
      >
        {itens.map((i) => (
          <Linha
            key={i.offerId}
            i={i}
            groupId={g.id}
            selected={sel?.offerId === i.offerId}
            onSelect={i.phases.length > 0 ? () => setSelId(i.offerId) : undefined}
          />
        ))}
      </PanelTable>
      {itens.length === 0 && <p className="text-sm text-muted-foreground">Nada com esse filtro.</p>}

      {sel && (
        <section
          aria-labelledby="fases"
          className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 id="fases" className="min-w-0 flex-1 text-base font-semibold">
              {`Fases do bloco · ${sel.title} (${primeiroNome(sel.name)})`}
            </h2>
            <span className="text-xs text-muted-foreground">{planProgramDates(sel)}</span>
          </div>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {sel.phases.map((f) => (
              <li
                key={f.week}
                className={cn(
                  'rounded-xl border px-3 py-2',
                  f.current
                    ? 'border-[hsl(var(--success)/0.6)] bg-[hsl(var(--success)/0.08)]'
                    : 'border-subtle',
                )}
              >
                <p className="text-sm font-semibold">{`Semana ${f.week} · ${f.focus}`}</p>
                <p className="text-xs text-muted-foreground">
                  {f.current ? `${phaseDates(f)} · agora` : phaseDates(f)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        O progresso só aparece para quem compartilha Treino. Sem isso, a equipe vê só que o plano
        foi enviado.
      </p>
    </div>
  );
}

function Linha({
  i,
  groupId,
  selected,
  onSelect,
}: {
  i: PlanProgramItem;
  groupId: string;
  selected: boolean;
  onSelect?: () => void;
}) {
  const linha = planProgramProgressLine(i);
  const ficha = `${panelHref(groupId, 'members')}/${i.membershipId}`;
  return (
    <tr className={cn(selected && 'bg-muted/50')}>
      <td className="px-3 py-2">
        {onSelect ? (
          <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            className="text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {`${i.name} · ${i.title}`}
          </button>
        ) : (
          <span className="font-semibold">{`${i.name} · ${i.title}`}</span>
        )}
        <span className="block text-xs text-muted-foreground">{i.authorName ?? 'Equipe'}</span>
      </td>
      <td className="px-3 py-2">
        <StatusChip label={planProgramKindLabel(i.schedule)} tone="neutral" />
      </td>
      <td className="whitespace-nowrap px-3 py-2">{planProgramDates(i)}</td>
      <td className="px-3 py-2">
        <span className="flex flex-wrap gap-1">
          {i.tags.map((t) => (
            <StatusChip key={t} label={t} tone="neutral" />
          ))}
        </span>
      </td>
      <td className="min-w-52 px-3 py-2">
        {i.progress?.percent != null && (
          <span className="flex items-center gap-2">
            <span
              role="progressbar"
              aria-label={`Progresso de ${i.name}`}
              aria-valuenow={i.progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn(
                  'block h-full rounded-full',
                  i.status === 'ENDED' ? 'bg-muted-foreground' : 'bg-primary',
                )}
                style={{ width: `${i.progress.percent}%` }}
              />
            </span>
            <span className="text-xs font-semibold tabular-nums">{`${i.progress.percent}%`}</span>
          </span>
        )}
        {i.status === 'ENDED' ? (
          <Link href={ficha} className="text-xs font-semibold text-primary hover:underline">
            revisar e enviar o próximo →
          </Link>
        ) : (
          linha && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {!i.sharesWorkout && <Lock size={12} aria-hidden />}
              {linha}
            </span>
          )
        )}
      </td>
      <td className="px-3 py-2">
        <StatusChip label={planProgramStatusLabel(i.status)} tone={TONE[i.status]} />
      </td>
    </tr>
  );
}
