import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScanBarcode, Settings } from 'lucide-react-native';
import { nutritionApi, type MealItem, type MealType } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { ErrorState, LoadingState } from '@/components/ui';
import { CaloriesRingCard } from '@/components/nutrition/calories-ring-card';
import { DateNavigator } from '@/components/nutrition/date-navigator';
import { EditMealItemDrawer } from '@/components/nutrition/edit-meal-item-drawer';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { MacroBentoGrid } from '@/components/nutrition/macro-bento-grid';
import { MealTimeline } from '@/components/nutrition/meal-timeline';
import { NutrientTargetsCard } from '@/components/nutrition/nutrient-targets-card';
import { WeeklyTrendChart } from '@/components/nutrition/weekly-trend-chart';
import { hojeIso } from '@/components/nutrition/helpers';

/**
 * Réplica de `apps/web/src/app/(app)/nutrition/page.tsx`.
 *
 * Duas diferenças em relação ao PWA:
 *
 * - o dia visitado é estado da tela, e não query string: no PWA cada seta do
 *   navegador de data é uma entrada no histórico do navegador; aqui isso faria
 *   o botão voltar do Android desfazer dia a dia em vez de sair da tela.
 * - os drawers são irmãos do `Screen`, não filhos. Dentro do `ScrollView` do
 *   `Screen` um bottom sheet se posicionaria em relação ao conteúdo rolável e
 *   subiria junto com a rolagem.
 */
export default function NutritionScreen() {
  const router = useRouter();
  const [data, setData] = useState(hojeIso);
  const [novaRefeicao, setNovaRefeicao] = useState<MealType | null>(null);
  const [adicionandoEm, setAdicionandoEm] = useState<string | null>(null);
  const [editando, setEditando] = useState<MealItem | null>(null);

  const resumo = useQuery({
    queryKey: ['nutrition', 'summary', data],
    queryFn: () => nutritionApi.summary(data),
  });
  const metas = useQuery({
    queryKey: ['nutrition', 'goals'],
    queryFn: () => nutritionApi.goals(),
  });

  const atualizar = () => {
    void resumo.refetch();
    void metas.refetch();
  };

  const drawerDeBuscaAberto = novaRefeicao !== null || adicionandoEm !== null;

  const fecharBusca = () => {
    setNovaRefeicao(null);
    setAdicionandoEm(null);
  };

  return (
    <>
      <Screen
        title="Nutrição"
        onRefresh={atualizar}
        refreshing={resumo.isRefetching || metas.isRefetching}
      >
        <View className="gap-5 px-5 pb-4 pt-4">
          <View className="flex-row items-center justify-end">
            {/* Escanear entra no cabeçalho, e não dentro do drawer de busca: o
                caso é "estou com a embalagem na mão", e enterrá-lo atrás de dois
                toques faria a pessoa digitar o nome do produto assim mesmo. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Escanear código de barras"
              onPress={() => router.push(`/nutrition/scan?date=${data}`)}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
            >
              <ScanBarcode size={18} color="#baccaf" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Metas"
              onPress={() => router.push('/nutrition/goals')}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
            >
              <Settings size={18} color="#baccaf" />
            </Pressable>
          </View>

          <DateNavigator date={data} onChange={setData} />

          {resumo.isLoading || metas.isLoading ? <LoadingState label="Carregando o dia…" /> : null}

          {resumo.error ? (
            <ErrorState error={resumo.error} onRetry={() => void resumo.refetch()} />
          ) : null}

          {resumo.data ? (
            <>
              <CaloriesRingCard totals={resumo.data.totals} goals={metas.data ?? null} />
              <MacroBentoGrid totals={resumo.data.totals} goals={metas.data ?? null} />
              <NutrientTargetsCard date={data} />
              <MealTimeline
                meals={resumo.data.meals}
                date={data}
                onAddMeal={setNovaRefeicao}
                onAddItem={setAdicionandoEm}
                onEditItem={setEditando}
              />
              <WeeklyTrendChart today={hojeIso()} />
            </>
          ) : null}

          {metas.error ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              Não foi possível carregar suas metas.
            </Text>
          ) : null}
        </View>
      </Screen>

      <FoodSearchDrawer
        open={drawerDeBuscaAberto}
        onOpenChange={(aberto) => !aberto && fecharBusca()}
        mealId={adicionandoEm ?? undefined}
        mealType={novaRefeicao ?? undefined}
        date={data}
      />
      <EditMealItemDrawer item={editando} date={data} onClose={() => setEditando(null)} />
    </>
  );
}
