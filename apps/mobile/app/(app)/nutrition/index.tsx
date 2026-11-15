import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { nutritionApi, type DayNutrient, type MealType } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { ErrorState, Icon, LoadingState } from '@/components/ui';
import { HeaderButton, TabHeader } from '@/components/layout/tab-header';
import { colors } from '@/theme/colors';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { DayMealSources } from '@/components/nutrition/day-meal-sources';
import { DayNutrientsCard } from '@/components/nutrition/day-nutrients-card';
import { NutritionWeekStrip } from '@/components/nutrition/week-strip';
import { hojeIso } from '@/components/nutrition/helpers';

/**
 * Réplica de `apps/web/src/app/(app)/nutrition/page.tsx`.
 *
 * Duas diferenças em relação ao PWA:
 *
 * - o dia visitado é estado da tela, e não query string: no PWA cada seta do
 *   dia escolhido é uma entrada no histórico do navegador; aqui isso faria
 *   o botão voltar do Android desfazer dia a dia em vez de sair da tela.
 * - os drawers são irmãos do `Screen`, não filhos. Dentro do `ScrollView` do
 *   `Screen` um bottom sheet se posicionaria em relação ao conteúdo rolável e
 *   subiria junto com a rolagem.
 */
/** Uma API sem a faixa do dia (de antes da #374) ainda mostra as calorias. */
function kcalFallback(kcal: number): DayNutrient {
  return {
    key: 'kcal',
    label: 'Calorias',
    unit: 'kcal',
    value: kcal,
    min: null,
    max: null,
    status: 'none',
  };
}

export default function NutritionScreen() {
  const router = useRouter();
  const [data, setData] = useState(hojeIso);
  const [novaRefeicao, setNovaRefeicao] = useState<MealType | null>(null);
  // O chip escolhido vale para o cartão e para o "De onde veio".
  const [nutrientKey, setNutrientKey] = useState<string | null>(null);

  const resumo = useQuery({
    queryKey: ['nutrition', 'summary', data],
    queryFn: () => nutritionApi.summary(data),
  });

  const atualizar = () => {
    void resumo.refetch();
  };

  const nutrients = resumo.data?.nutrients ?? [];
  const selectedNutrient = nutrientKey ? nutrients.find((n) => n.key === nutrientKey) : undefined;

  return (
    <>
      <Screen onRefresh={atualizar} refreshing={resumo.isRefetching}>
        <View className="gap-4 px-5 pb-4 pt-2">
          {/* Cabeçalho da prancha Al-N1: o título grande e três atalhos
            quadrados — leitor (Al-N4), plano alimentar (Al-N5) e metas do dia
            (Al-N6). Escanear fica aqui, e não dentro da busca: o caso é "estou
            com a embalagem na mão". A foto da refeição fica no menu da IA. */}
          <TabHeader title="Nutrição">
            <HeaderButton
              label="Ler código ou rótulo"
              onPress={() => router.push(`/nutrition/scan?date=${data}`)}
            >
              <Icon name="scan" size={20} color={colors.foreground} />
            </HeaderButton>
            <HeaderButton label="Plano alimentar" onPress={() => router.push('/nutrition/plan')}>
              <Icon name="book" size={20} color={colors.foreground} />
            </HeaderButton>
            <HeaderButton label="Metas do dia" onPress={() => router.push('/nutrition/goals')}>
              <Icon name="target" size={20} color={colors.foreground} />
            </HeaderButton>
          </TabHeader>

          <NutritionWeekStrip date={data} today={hojeIso()} onChange={setData} />

          {resumo.isLoading ? <LoadingState label="Carregando o dia…" /> : null}

          {resumo.error ? (
            <ErrorState error={resumo.error} onRetry={() => void resumo.refetch()} />
          ) : null}

          {resumo.data ? (
            <>
              <DayNutrientsCard
                nutrients={nutrients}
                selected={selectedNutrient?.key ?? null}
                onSelect={setNutrientKey}
              />
              <DayMealSources
                meals={resumo.data.meals}
                nutrient={selectedNutrient ?? nutrients[0] ?? kcalFallback(resumo.data.totals.kcal)}
                date={data}
                all={!selectedNutrient}
                onAddMeal={setNovaRefeicao}
              />
            </>
          ) : null}
        </View>
      </Screen>

      <FoodSearchDrawer
        open={novaRefeicao !== null}
        onOpenChange={(aberto) => !aberto && setNovaRefeicao(null)}
        mealType={novaRefeicao ?? undefined}
        date={data}
      />
    </>
  );
}
