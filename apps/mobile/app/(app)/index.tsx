import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Target } from 'lucide-react-native';
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
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/app/(app)/page.tsx`.
 *
 * Os drawers ficam aqui, irmãos do `<Screen>`, e não dentro dos cards que
 * os abrem como no PWA: o bottom sheet nativo não é portal e abriria com a
 * altura do card, rolando junto com o conteúdo. Ver `src/components/ui/drawer.tsx`.
 */
/** "Sáb, 14 nov", do relógio do aparelho. */
function todayLabel(): string {
  return new Date()
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
}

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
          {/* Topo do Hoje (ADR 040 revisada): data, saudação, metas, o sino dos
              avisos e a pessoa. O sino leva às notificações até a caixa de avisos
              da #389; o avatar abre a aba Você. */}
          <View className="flex-row items-center gap-1">
            <View className="flex-1">
              <Text className="text-b2 capitalize text-muted-foreground">{todayLabel()}</Text>
              <Text accessibilityRole="header" className="font-display text-h2 text-foreground">
                {greetingLine(eu.data?.name)}
              </Text>
            </View>
            {/* As metas do dia a um toque: antes eram Progresso → Perfil → Metas. */}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Metas do dia"
              onPress={() => router.push('/nutrition/goals')}
              className="h-11 w-11 items-center justify-center rounded-full"
            >
              <Target size={20} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Avisos"
              onPress={() => router.push('/profile/notifications')}
              className="h-11 w-11 items-center justify-center rounded-full"
            >
              <Bell size={20} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Você"
              onPress={() => router.navigate('/you')}
              className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
            >
              <Text className="font-display text-sm text-foreground">
                {(eu.data?.name ?? '?').trim().slice(0, 1).toUpperCase() || '?'}
              </Text>
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
