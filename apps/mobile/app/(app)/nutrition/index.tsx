import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Camera, Copy, Lock, ScanBarcode, Settings } from 'lucide-react-native';
import { aiLock, nutritionApi, planHref, type DayNutrient, type MealType } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import { ErrorState, LoadingState } from '@/components/ui';
import { DateNavigator } from '@/components/nutrition/date-navigator';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { DayMealSources } from '@/components/nutrition/day-meal-sources';
import { DayNutrientsCard } from '@/components/nutrition/day-nutrients-card';
import { MeusAlimentosCard } from '@/components/nutrition/meus-alimentos-card';
import { WeeklyTrendChart } from '@/components/nutrition/weekly-trend-chart';
import { hojeIso } from '@/components/nutrition/helpers';
import { CopiarDiaDrawer } from '@/components/nutrition/copiar-dia-drawer';
import { colors } from '@/theme/colors';

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
  const [copiandoDia, setCopiandoDia] = useState(false);

  const resumo = useQuery({
    queryKey: ['nutrition', 'summary', data],
    queryFn: () => nutritionApi.summary(data),
  });
  /**
   * Se a instância tem IA de visão configurada (#139). Sem ela a entrada por
   * foto **some** em vez de aparecer e falhar — um botão que sempre erra é pior
   * que um botão que não existe, e o registro manual continua inteiro.
   *
   * `staleTime` longo porque a resposta depende de configuração do servidor, não
   * do dia: sem ele, cada visita à tela bateria no agente.
   */
  const fotoDisponivel = useQuery({
    queryKey: ['nutrition', 'photo-recognition'],
    queryFn: () => nutritionApi.photoRecognitionStatus(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const fotoTrava = aiLock(fotoDisponivel.data);

  const atualizar = () => {
    void resumo.refetch();
  };

  const refeicoesDoDia = resumo.data?.meals.filter((m) => m.items.length > 0).length ?? 0;

  const nutrients = resumo.data?.nutrients ?? [];
  const selectedNutrient = nutrientKey ? nutrients.find((n) => n.key === nutrientKey) : undefined;

  return (
    <>
      <Screen
        actions={
          <>
            {fotoTrava === 'open' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Registrar refeição por foto"
                onPress={() => router.push(`/nutrition/photo?date=${data}`)}
                className={TOP_BAR_ACTION}
              >
                <Camera size={20} color={colors.primaryText} />
              </Pressable>
            ) : fotoTrava === 'locked' ? (
              // Free (ADR 024): o botão aparece com cadeado e leva ao plano, em vez
              // de sumir — a pessoa precisa saber que a função existe.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Registrar refeição por foto, do plano PRO"
                onPress={() => router.push(planHref('foto'))}
                className={TOP_BAR_ACTION}
              >
                <Camera size={20} color={colors.primaryText} />
                <View className="absolute bottom-1.5 right-1.5 rounded-full bg-background p-0.5">
                  <Lock size={10} color={colors.mutedForeground} />
                </View>
              </Pressable>
            ) : null}
            {/* Escanear entra no cabeçalho, e não dentro do drawer de busca: o
              caso é "estou com a embalagem na mão", e enterrá-lo atrás de dois
              toques faria a pessoa digitar o nome do produto assim mesmo. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Escanear código de barras"
              onPress={() => router.push(`/nutrition/scan?date=${data}`)}
              className={TOP_BAR_ACTION}
            >
              <ScanBarcode size={20} color={colors.primaryText} />
            </Pressable>
            {refeicoesDoDia > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copiar dia"
                onPress={() => setCopiandoDia(true)}
                className={TOP_BAR_ACTION}
              >
                <Copy size={20} color={colors.primaryText} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Metas"
              onPress={() => router.push('/nutrition/goals')}
              className={TOP_BAR_ACTION}
            >
              <Settings size={20} color={colors.primaryText} />
            </Pressable>
          </>
        }
        onRefresh={atualizar}
        refreshing={resumo.isRefetching}
      >
        <View className="gap-5 px-5 pb-4 pt-4">
          <DateNavigator date={data} onChange={setData} />

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
                onAddMeal={setNovaRefeicao}
              />
              <WeeklyTrendChart today={hojeIso()} />
              <MeusAlimentosCard />
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
      <CopiarDiaDrawer
        open={copiandoDia}
        onOpenChange={setCopiandoDia}
        date={data}
        mealCount={refeicoesDoDia}
        onVerDia={setData}
      />
    </>
  );
}
