import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  cellKeyLabel,
  cellValueLabel,
  cutLabel,
  INSIGHTS_PERIODS,
  insightsApi,
  type InsightsPanel,
  type InsightsPeriod,
} from '@fatia/api-client';
import { LoadingState, cn } from '@/components/ui';
import { Choice, orgKeys, PanelCard } from './org-panel';

const BARRA_MAX = 96;

/**
 * Equivalente de `apps/web/src/components/org/insights-card.tsx`: um recorte
 * e um período nomeados, células já suprimidas pela API. Célula com menos de 5
 * pessoas aparece tracejada e dita como tal, nunca como zero.
 */
export function InsightsCard({
  groupId,
  panel,
  title,
}: {
  groupId: string;
  panel: InsightsPanel;
  title: string;
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

  return (
    <PanelCard title={title}>
      {recortes.data ? (
        <Choice
          label="Recorte"
          options={recortes.data.cuts.map((c) => ({ value: c, label: cutLabel(c) }))}
          value={recorte ?? ''}
          onChange={setEscolhido}
        />
      ) : null}
      <Choice label="Período" options={INSIGHTS_PERIODS} value={periodo} onChange={setPeriodo} />
      {recortes.isPending || dados.isPending ? <LoadingState label="Carregando…" /> : null}
      {dados.data?.insufficientSample ? (
        <Text className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          Amostra insuficiente: poucas pessoas aceitaram entrar nas estatísticas para mostrar este
          recorte sem expor ninguém.
        </Text>
      ) : null}
      {dados.data && !dados.data.insufficientSample ? (
        <View className="flex-row items-end gap-1">
          {dados.data.cells.map((c) => {
            const h =
              c.suppressed || c.value === null
                ? BARRA_MAX / 3
                : Math.max(3, Math.round((c.value / max) * BARRA_MAX));
            return (
              <View
                key={c.key}
                accessible
                accessibilityLabel={`${cellKeyLabel(c.key)}: ${cellValueLabel(c)}`}
                className="flex-1 items-center gap-1"
              >
                <Text className="text-[10px] font-bold text-muted-foreground">
                  {c.suppressed ? '<5' : cellValueLabel(c)}
                </Text>
                <View
                  style={{ height: h }}
                  className={cn(
                    'w-full rounded-t-md',
                    c.suppressed ? 'border border-dashed border-muted-foreground' : 'bg-primary',
                  )}
                />
                <Text numberOfLines={1} className="text-[9px] text-muted-foreground">
                  {cellKeyLabel(c.key)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <Text className="text-[11px] text-muted-foreground">
        Só entra quem aceitou as estatísticas da comunidade. Grupos com menos de 5 pessoas não
        aparecem.
      </Text>
    </PanelCard>
  );
}
