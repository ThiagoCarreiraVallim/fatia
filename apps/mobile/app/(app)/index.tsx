import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Target } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { greetingLine, progressApi, usersApi } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { DrawerLayer, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { LogStepsDrawer, LogWaterDrawer } from '@/components/progress';
import {
  NextWorkoutCard,
  NutritionMacroCard,
  StepsCard,
  StreakCard,
  WaterCard,
} from '@/components/dashboard';

/**
 * Réplica de `apps/web/src/app/(app)/page.tsx`.
 *
 * Os drawers ficam aqui, irmãos do `<Screen>`, e não dentro dos cards que
 * os abrem como no PWA: o bottom sheet nativo não é portal e abriria com a
 * altura do card, rolando junto com o conteúdo. Ver `src/components/ui/drawer.tsx`.
 */
export default function DashboardScreen() {
  const [aguaAberto, setAguaAberto] = useState(false);
  const [passosAberto, setPassosAberto] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const eu = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const hoje = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => progressApi.today(),
  });

  // O `today()` só LÊ as conquistas; quem desbloqueia é esta chamada (ver a mesma nota no PWA).
  const conquistas = useQuery({
    queryKey: ['achievements', 'refresh'],
    queryFn: () => progressApi.refreshAchievements(),
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
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text
                accessibilityRole="header"
                className="text-[18px] font-semibold text-foreground"
              >
                {greetingLine(eu.data?.name)}
              </Text>
              <Text className="text-sm text-muted-foreground">Pronto para dominar o dia?</Text>
            </View>
            {/* As metas do dia a um toque: antes eram Progresso → Perfil → Metas. */}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Metas do dia"
              onPress={() => router.push('/nutrition/goals')}
              className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-border px-4"
            >
              <Target size={16} color="#2ce500" />
              <Text className="text-sm font-semibold text-foreground">Metas</Text>
            </Pressable>
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
              <StreakCard
                streak={dados.streak}
                achievements={conquistas.data ?? dados.achievements}
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
      </DrawerLayer>
    </>
  );
}
