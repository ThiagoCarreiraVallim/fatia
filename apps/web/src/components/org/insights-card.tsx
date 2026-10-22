'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import {
  cellKeyLabel,
  cellValueLabel,
  cutLabel,
  INSIGHTS_PERIODS,
  insightsApi,
  type InsightsPanel,
  type InsightsPeriod,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const BARRA_MAX = 96;

/**
 * Um painel agregado (retenção ou comportamento): escolhe-se um recorte e um
 * período, nomeados, e as células chegam já suprimidas pela API. Célula com
 * menos de 5 pessoas aparece como tal, nunca como zero.
 */
export function InsightsCard({
  groupId,
  panel,
  title,
  exportable = false,
  className,
}: {
  groupId: string;
  panel: InsightsPanel;
  title: string;
  exportable?: boolean;
  className?: string;
}) {
  const recortes = useQuery({
    queryKey: orgKeys.insightsCuts(groupId, panel),
    queryFn: () => insightsApi.cuts(groupId, panel),
  });
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<InsightsPeriod>('last_90_days');
  const recorte = escolhido ?? recortes.data?.cuts[0] ?? null;

  const dados = useQuery({
    queryKey: orgKeys.insights(groupId, panel, recorte ?? '', periodo),
    queryFn: () => insightsApi.aggregate(groupId, panel, recorte as string, periodo),
    enabled: recorte !== null,
  });

  const max = Math.max(1, ...(dados.data?.cells.map((c) => c.value ?? 0) ?? [1]));
  const idBase = `insights-${panel}`;

  return (
    <section
      aria-labelledby={`${idBase}-titulo`}
      className={cn('min-w-0 space-y-3 rounded-2xl border border-subtle bg-card p-4', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${idBase}-titulo`} className="flex-1 text-sm font-semibold">
          {title}
        </h2>
        {exportable && recorte && (
          <a
            href={`/api/proxy${insightsApi.behaviorExportPath(groupId, recorte, periodo).replace(/^\/api/, '')}`}
            download="insights.csv"
            className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary"
          >
            <Download size={14} aria-hidden /> Exportar CSV
          </a>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={recorte ?? undefined} onValueChange={setEscolhido}>
          <SelectTrigger className="h-11" aria-label="Recorte">
            <SelectValue placeholder="Recorte" />
          </SelectTrigger>
          <SelectContent>
            {(recortes.data?.cuts ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                {cutLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as InsightsPeriod)}>
          <SelectTrigger className="h-11" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INSIGHTS_PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(recortes.isPending || dados.isPending) && <Skeleton className="h-32 rounded-xl" />}
      {dados.isError && (
        <p className="text-xs text-muted-foreground">Não deu para carregar este recorte agora.</p>
      )}
      {dados.data?.insufficientSample && (
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          Amostra insuficiente: poucas pessoas aceitaram entrar nas estatísticas para mostrar este
          recorte sem expor ninguém.
        </p>
      )}
      {dados.data && !dados.data.insufficientSample && (
        // Focável: no celular as barras rolam para o lado, e o teclado precisa chegar lá.
        <ul
          tabIndex={0}
          className="flex items-end gap-1 overflow-x-auto pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${cutLabel(dados.data.cut)}, ${INSIGHTS_PERIODS.find((p) => p.value === periodo)?.label.toLowerCase()}`}
        >
          {dados.data.cells.map((c) => {
            const h =
              c.suppressed || c.value === null
                ? BARRA_MAX / 3
                : Math.max(3, Math.round((c.value / max) * BARRA_MAX));
            return (
              <li
                key={c.key}
                className="flex min-w-7 flex-1 flex-col items-center gap-1"
                aria-label={`${cellKeyLabel(c.key)}: ${cellValueLabel(c)}`}
              >
                <span
                  aria-hidden
                  className="text-[10px] font-bold tabular-nums text-muted-foreground"
                >
                  {c.suppressed ? '<5' : cellValueLabel(c)}
                </span>
                <div
                  aria-hidden
                  style={{ height: h }}
                  className={cn(
                    'w-full rounded-t-md',
                    c.suppressed
                      ? 'border border-dashed border-muted-foreground/50 bg-transparent'
                      : 'bg-primary/80',
                  )}
                />
                <span aria-hidden className="whitespace-nowrap text-[10px] text-muted-foreground">
                  {cellKeyLabel(c.key)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Só entra quem aceitou as estatísticas da comunidade. Grupos com menos de 5 pessoas não
        aparecem.
      </p>
    </section>
  );
}
