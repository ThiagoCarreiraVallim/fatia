import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { goalsApi } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { MainGoalCard } from '@/components/goals/main-goal-card';
import { NewGoalDrawer } from '@/components/goals/new-goal-drawer';
import { RecentGoalRow } from '@/components/goals/recent-goal-row';
import { SecondaryGoalCard } from '@/components/goals/secondary-goal-card';

export default function GoalsScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();

  // Uma única query traz todas as metas e o agrupamento por status é feito
  // aqui. No PWA a motivação era race no `getAccessToken`; no app o token já é
  // serializado pelo SessionManager, mas a chamada única continua valendo por
  // outro motivo: em rede móvel, três idas e voltas custam mais que o filtro.
  const allGoals = useQuery({
    queryKey: ['goals', 'all'],
    queryFn: () => goalsApi.list(),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => goalsApi.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => goalsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });

  const goals = allGoals.data ?? [];
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const [mainGoal, ...secondaryGoals] = activeGoals;
  const recents = goals
    .filter((goal) => goal.status === 'completed' || goal.status === 'expired')
    .slice(0, 5);

  // Remover é irreversível e, no toque, um erro de alvo custa uma meta. O PWA
  // apaga direto porque o clique de mouse é preciso; aqui vale a confirmação.
  const confirmDelete = (id: string, title: string) => {
    Alert.alert('Remover meta', `Apagar "${title}"? Essa ação não pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const busyId = completeMutation.isPending
    ? completeMutation.variables
    : deleteMutation.isPending
      ? deleteMutation.variables
      : undefined;

  return (
    <>
      <Screen
        back
        title="Metas"
        onRefresh={() => void allGoals.refetch()}
        refreshing={allGoals.isRefetching}
      >
        <View className="gap-5 px-5 pb-4 pt-4">
          <View className="flex-row items-end justify-between gap-3">
            <View className="flex-1">
              <Text className="text-sm text-muted-foreground">
                Acompanhe seus objetivos ativos.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nova meta"
              onPress={() => setDrawerOpen(true)}
              className="min-h-[44px] flex-row items-center gap-1.5 rounded-xl bg-primary px-4 py-3 active:opacity-80"
            >
              <Plus size={14} strokeWidth={3} color="#131313" />
              <Text className="text-[11px] font-extrabold text-primary-foreground">NOVA META</Text>
            </Pressable>
          </View>

          {allGoals.isLoading ? <LoadingState label="Carregando metas…" /> : null}

          {allGoals.isError ? (
            <ErrorState error={allGoals.error} onRetry={() => void allGoals.refetch()} />
          ) : null}

          {!allGoals.isLoading && !allGoals.isError && activeGoals.length === 0 ? (
            <EmptyState
              title="Nenhuma meta ativa"
              description="Crie uma meta pelo botão acima ou peça ao Claude."
            />
          ) : null}

          {mainGoal ? <MainGoalCard goal={mainGoal} /> : null}

          {secondaryGoals.length > 0 ? (
            <View className="gap-3">
              {secondaryGoals.map((goal) => (
                <SecondaryGoalCard
                  key={goal.id}
                  goal={goal}
                  busy={busyId === goal.id}
                  onComplete={() => completeMutation.mutate(goal.id)}
                  onDelete={() => confirmDelete(goal.id, goal.title)}
                />
              ))}
            </View>
          ) : null}

          {recents.length > 0 ? (
            <View className="rounded-2xl border border-border bg-card p-4">
              <Text accessibilityRole="header" className="mb-3 text-sm font-bold text-foreground">
                Metas Recentes
              </Text>
              <View className="gap-2">
                {recents.map((goal) => (
                  <RecentGoalRow key={goal.id} goal={goal} />
                ))}
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Voltar ao perfil"
            onPress={() => router.navigate('/profile')}
            className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
          >
            <Text className="text-sm text-muted-foreground">Voltar ao perfil</Text>
            <ChevronRight size={16} color="#baccaf" />
          </Pressable>
        </View>
      </Screen>

      {/* Fora do `Screen`: o bottom sheet se posiciona em `absoluteFill` sobre o
          pai, e dentro do `ScrollView` ele acompanharia o conteúdo rolado. */}
      <NewGoalDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
