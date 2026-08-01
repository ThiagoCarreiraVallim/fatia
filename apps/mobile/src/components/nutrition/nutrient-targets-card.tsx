import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, SlidersHorizontal } from 'lucide-react-native';
import { nutritionApi, type NutrientProgress, type NutrientStatus } from '@fatia/api-client';
import { ErrorState, LoadingState, cn } from '@/components/ui';
import { NUMEROS_TABULARES, percentualDaMeta } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/nutrient-targets-card.tsx`.
 *
 * Âmbar e vermelho não são tokens do tema; são os mesmos tons do PWA, pelo
 * mesmo motivo do `macro-bar` — o vermelho do tema desaparece como preenchimento
 * de barra sobre fundo escuro.
 */

const COR_DA_BARRA: Record<NutrientStatus, string> = {
  over: 'bg-[#f43f5e]',
  under: 'bg-[#facc15]',
  ok: 'bg-primary',
  none: 'bg-muted-foreground',
};

const COR_DA_ETIQUETA: Record<NutrientStatus, string> = {
  over: 'text-[#fb7185]',
  under: 'text-[#facc15]',
  ok: 'text-primary',
  none: 'text-muted-foreground',
};

const ROTULO_DO_STATUS: Record<NutrientStatus, string> = {
  over: 'acima',
  under: 'abaixo',
  ok: 'na meta',
  none: '—',
};

export function NutrientTargetsCard({ date }: { date: string }) {
  const router = useRouter();
  const resumo = useQuery({
    queryKey: ['nutrition', 'nutrient-summary', date],
    queryFn: () => nutritionApi.nutrientSummary(date),
  });

  const nutrientes = resumo.data?.nutrients ?? [];
  const irParaGerenciar = () => router.push('/nutrition/nutrient-targets');

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <SlidersHorizontal size={15} color="#2ce500" />
          <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
            Metas personalizadas
          </Text>
        </View>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Gerenciar metas personalizadas"
          onPress={irParaGerenciar}
          hitSlop={12}
          className="min-h-[44px] flex-row items-center gap-1"
        >
          <Text className="text-[11px] font-bold text-primary">Gerenciar</Text>
          <ChevronRight size={12} color="#2ce500" />
        </Pressable>
      </View>

      {resumo.isLoading ? (
        <LoadingState label="Carregando metas…" />
      ) : resumo.error ? (
        <ErrorState error={resumo.error} onRetry={() => void resumo.refetch()} />
      ) : nutrientes.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Criar uma meta personalizada"
          onPress={irParaGerenciar}
          className="rounded-xl border border-dashed border-border p-4"
        >
          <Text className="text-center text-xs text-muted-foreground">
            Acompanhe sódio, açúcar, fibra e outros. Toque para criar uma meta.
          </Text>
        </Pressable>
      ) : (
        <View className="gap-3">
          {nutrientes.map((nutriente) => (
            <NutrientBar key={nutriente.nutrientKey} nutriente={nutriente} />
          ))}
        </View>
      )}
    </View>
  );
}

function NutrientBar({ nutriente }: { nutriente: NutrientProgress }) {
  // A barra se mede pelo limite (max) ou, quando só há piso, pela meta (min).
  const referencia = nutriente.max ?? nutriente.min ?? 0;
  const percentual = percentualDaMeta(nutriente.total, referencia);
  const alvo =
    nutriente.min != null && nutriente.max != null
      ? `${nutriente.min}–${nutriente.max}`
      : nutriente.max != null
        ? `máx ${nutriente.max}`
        : nutriente.min != null
          ? `mín ${nutriente.min}`
          : '—';

  return (
    <View
      accessibilityLabel={`${nutriente.label}: ${nutriente.total} de ${alvo} ${nutriente.unit}, ${ROTULO_DO_STATUS[nutriente.status]}`}
    >
      <View className="flex-row items-baseline justify-between">
        <Text className="text-xs font-bold text-foreground">{nutriente.label}</Text>
        <View className="flex-row items-baseline gap-2">
          <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
            {nutriente.total} / {alvo} {nutriente.unit}
          </Text>
          <Text
            className={cn(
              'rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold',
              COR_DA_ETIQUETA[nutriente.status],
            )}
          >
            {ROTULO_DO_STATUS[nutriente.status]}
          </Text>
        </View>
      </View>
      <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <View
          className={cn('h-full rounded-full', COR_DA_BARRA[nutriente.status])}
          style={{ width: `${percentual}%` }}
        />
      </View>
    </View>
  );
}
