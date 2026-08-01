import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Path } from 'react-native-svg';
import { nutritionApi } from '@fatia/api-client';
import { ErrorState, LoadingState, cn } from '@/components/ui';
import { NUMEROS_TABULARES, alturaDaBarra, caminhoDeBarra, inicialDoDia } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/weekly-trend-chart.tsx`.
 *
 * As barras são `react-native-svg` (ADR 012). A largura da coluna depende da
 * largura real do card, que só se conhece depois do layout — daí o `onLayout`;
 * antes disso o gráfico não desenha, em vez de desenhar torto e corrigir.
 */

const ALTURA_MAXIMA = 80;
const ESPACO_ENTRE_BARRAS = 6;

export function WeeklyTrendChart({ today }: { today: string }) {
  const [largura, setLargura] = useState(0);
  const historico = useQuery({
    queryKey: ['nutrition', 'history', 7],
    queryFn: () => nutritionApi.history(7),
  });

  const medir = (evento: LayoutChangeEvent) => setLargura(evento.nativeEvent.layout.width);

  const serie = historico.data?.series ?? [];
  const maiorKcal = Math.max(...serie.map((dia) => dia.kcal), 1);
  const colunas = serie.length;
  const larguraDaColuna =
    colunas > 0 && largura > 0 ? (largura - ESPACO_ENTRE_BARRAS * (colunas - 1)) / colunas : 0;

  return (
    <View className="rounded-xl border border-border bg-card p-5">
      <View className="mb-4 flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-[15px] font-semibold text-foreground">
          Tendência Semanal
        </Text>
        <Text className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          KCAL
        </Text>
      </View>

      {historico.isLoading ? (
        <LoadingState label="Carregando tendência…" />
      ) : historico.error ? (
        <ErrorState error={historico.error} onRetry={() => void historico.refetch()} />
      ) : (
        <View
          accessibilityLabel={`Calorias dos últimos ${colunas} dias: ${serie
            .map((dia) => `${inicialDoDia(dia.date)} ${Math.round(dia.kcal)}`)
            .join(', ')}`}
        >
          <View className="flex-row" style={{ gap: ESPACO_ENTRE_BARRAS }}>
            {serie.map((dia) => (
              <Text
                key={dia.date}
                style={NUMEROS_TABULARES}
                className={cn(
                  'flex-1 text-center text-[10px] font-bold',
                  dia.date === today ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {dia.kcal > 0 ? Math.round(dia.kcal / 100) * 100 : ''}
              </Text>
            ))}
          </View>

          <View onLayout={medir} className="mt-1.5">
            {larguraDaColuna > 0 ? (
              <Svg width={largura} height={ALTURA_MAXIMA}>
                {serie.map((dia, indice) => {
                  const altura = alturaDaBarra(dia.kcal, maiorKcal, ALTURA_MAXIMA);
                  return (
                    <Path
                      key={dia.date}
                      d={caminhoDeBarra(
                        indice * (larguraDaColuna + ESPACO_ENTRE_BARRAS),
                        ALTURA_MAXIMA - altura,
                        larguraDaColuna,
                        altura,
                      )}
                      fill={dia.date === today ? '#2ce500' : '#201f1f'}
                    />
                  );
                })}
              </Svg>
            ) : (
              <View style={{ height: ALTURA_MAXIMA }} />
            )}
          </View>

          <View className="mt-1.5 flex-row" style={{ gap: ESPACO_ENTRE_BARRAS }}>
            {serie.map((dia) => (
              <Text
                key={dia.date}
                className={cn(
                  'flex-1 text-center text-[11px] font-bold',
                  dia.date === today ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {inicialDoDia(dia.date)}
              </Text>
            ))}
          </View>

          {historico.data && historico.data.averages.kcal > 0 ? (
            <Text className="mt-3 text-[11px] text-muted-foreground">
              Média:{' '}
              <Text style={NUMEROS_TABULARES} className="font-bold text-foreground">
                {Math.round(historico.data.averages.kcal)}
              </Text>{' '}
              kcal/dia
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
