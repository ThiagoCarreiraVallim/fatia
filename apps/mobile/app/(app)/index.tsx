import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { progressApi } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { DrawerLayer, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { LogStepsDrawer, LogWaterDrawer, LogWeightDrawer } from '@/components/progress';
import {
  NextWorkoutCard,
  NutritionMacroCard,
  QuickLogActions,
  StepsCard,
  StreakCard,
  WaterCard,
  saudacao,
} from '@/components/dashboard';

/**
 * Réplica de `apps/web/src/app/(app)/page.tsx`.
 *
 * Os três drawers ficam aqui, irmãos do `<Screen>`, e não dentro dos cards que
 * os abrem como no PWA: o bottom sheet nativo não é portal e abriria com a
 * altura do card, rolando junto com o conteúdo. Ver `src/components/ui/drawer.tsx`.
 */
export default function DashboardScreen() {
  const [aguaAberto, setAguaAberto] = useState(false);
  const [passosAberto, setPassosAberto] = useState(false);
  const [pesoAberto, setPesoAberto] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const queryClient = useQueryClient();

  const hoje = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => progressApi.today(),
  });

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setAtualizando(false);
    }
  }, [queryClient]);

  const dados = hoje.data;

  return (
    <>
      <Screen onRefresh={atualizar} refreshing={atualizando}>
        <View className="gap-5 px-5 pb-4 pt-2">
          <View>
            <Text accessibilityRole="header" className="text-[18px] font-semibold text-foreground">
              {saudacao()}, Atleta.
            </Text>
            <Text className="text-sm text-muted-foreground">Pronto para dominar o dia?</Text>
          </View>

          {hoje.isLoading ? <LoadingState label="Carregando seu dia…" /> : null}

          {hoje.error ? (
            <ErrorState error={hoje.error} onRetry={() => hoje.refetch()} />
          ) : dados ? (
            <>
              <NutritionMacroCard nutrition={dados.nutrition} />
              <NextWorkoutCard workout={dados.workout} />
              <WaterCard data={dados.water} onLogWater={() => setAguaAberto(true)} />
              <StepsCard data={dados.steps} onLogSteps={() => setPassosAberto(true)} />
              <StreakCard streak={dados.streak} achievements={dados.achievements} />
              <QuickLogActions
                onLogWater={() => setAguaAberto(true)}
                onLogWeight={() => setPesoAberto(true)}
              />
            </>
          ) : hoje.isLoading ? null : (
            <EmptyState
              title="Sem resumo para hoje"
              description="Puxe a tela para baixo para tentar de novo."
            />
          )}
        </View>
      </Screen>

      <DrawerLayer>
        <LogWaterDrawer open={aguaAberto} onClose={() => setAguaAberto(false)} />
        <LogStepsDrawer open={passosAberto} onClose={() => setPassosAberto(false)} />
        <LogWeightDrawer open={pesoAberto} onClose={() => setPesoAberto(false)} />
      </DrawerLayer>
    </>
  );
}
