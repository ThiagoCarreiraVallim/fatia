import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Camera, Copy, Lock, ScanBarcode, Settings } from 'lucide-react-native';
import {
  aiLock,
  nutritionApi,
  planHref,
  type Meal,
  type MealItem,
  type MealType,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import { ErrorState, LoadingState } from '@/components/ui';
import { CaloriesRingCard } from '@/components/nutrition/calories-ring-card';
import { DateNavigator } from '@/components/nutrition/date-navigator';
import { EditMealItemDrawer } from '@/components/nutrition/edit-meal-item-drawer';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { MacroBentoGrid } from '@/components/nutrition/macro-bento-grid';
import { MealTimeline } from '@/components/nutrition/meal-timeline';
import { NutrientTargetsCard } from '@/components/nutrition/nutrient-targets-card';
import { MeusAlimentosCard } from '@/components/nutrition/meus-alimentos-card';
import { WeeklyTrendChart } from '@/components/nutrition/weekly-trend-chart';
import { hojeIso } from '@/components/nutrition/helpers';
import { AcoesDaRefeicaoDrawer } from '@/components/nutrition/acoes-da-refeicao-drawer';
import { CopiarDiaDrawer } from '@/components/nutrition/copiar-dia-drawer';
import { cores } from '@/theme/cores';

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
  const [agindoEm, setAgindoEm] = useState<Meal | null>(null);
  const [copiandoDia, setCopiandoDia] = useState(false);

  const resumo = useQuery({
    queryKey: ['nutrition', 'summary', data],
    queryFn: () => nutritionApi.summary(data),
  });
  const metas = useQuery({
    queryKey: ['nutrition', 'goals'],
    queryFn: () => nutritionApi.goals(),
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
    void metas.refetch();
  };

  const refeicoesDoDia = resumo.data?.meals.filter((m) => m.items.length > 0).length ?? 0;

  const drawerDeBuscaAberto = novaRefeicao !== null || adicionandoEm !== null;

  const fecharBusca = () => {
    setNovaRefeicao(null);
    setAdicionandoEm(null);
  };

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
                <Camera size={20} color={cores.primary} />
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
                <Camera size={20} color={cores.primary} />
                <View className="absolute bottom-1.5 right-1.5 rounded-full bg-background p-0.5">
                  <Lock size={10} color={cores.mutedForeground} />
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
              <ScanBarcode size={20} color={cores.primary} />
            </Pressable>
            {refeicoesDoDia > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copiar dia"
                onPress={() => setCopiandoDia(true)}
                className={TOP_BAR_ACTION}
              >
                <Copy size={20} color={cores.primary} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Metas"
              onPress={() => router.push('/nutrition/goals')}
              className={TOP_BAR_ACTION}
            >
              <Settings size={20} color={cores.primary} />
            </Pressable>
          </>
        }
        onRefresh={atualizar}
        refreshing={resumo.isRefetching || metas.isRefetching}
      >
        <View className="gap-5 px-5 pb-4 pt-4">
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
                onMealActions={setAgindoEm}
              />
              <WeeklyTrendChart today={hojeIso()} />
              <MeusAlimentosCard />
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
      <AcoesDaRefeicaoDrawer
        meal={agindoEm}
        date={data}
        onClose={() => setAgindoEm(null)}
        onVerDia={setData}
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
