import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Dumbbell, Plus, Trash2 } from 'lucide-react-native';
import { workoutApi } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '@/components/ui';
import { pluralize } from '@/components/workout/workout-stats';

/** Réplica de `apps/web/src/app/(app)/workout/plans/page.tsx`. */

export default function PlansScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const create = useMutation({
    mutationFn: () => workoutApi.createPlan({ name: newName.trim() }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      setNewName('');
      setShowForm(false);
      // Leva direto para o plano recém-criado para adicionar exercícios —
      // criar um plano "vazio" e ficar na lista passava a sensação de que
      // nada tinha sido criado.
      if (created?.id) router.push(`/workout/plans/${created.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => workoutApi.deletePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  // O `confirm()` do PWA não existe no React Native, e apagar um plano sem
  // confirmação a um toque de distância é destrutivo demais.
  function confirmRemove(id: string, name: string) {
    Alert.alert('Excluir plano', `Excluir "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => remove.mutate(id) },
    ]);
  }

  return (
    <Screen
      back
      title="Planos de treino"
      refreshing={plans.isRefetching}
      onRefresh={() => void plans.refetch()}
    >
      <View className="gap-5 px-5 pb-4 pt-4">
        {showForm ? (
          <View className="gap-2">
            <Input
              autoFocus
              value={newName}
              onChangeText={setNewName}
              accessibilityLabel="Nome do plano"
              placeholder="Nome do plano"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (newName.trim()) create.mutate();
              }}
            />
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                size="sm"
                disabled={!newName.trim()}
                loading={create.isPending}
                onPress={() => create.mutate()}
              >
                Salvar
              </Button>
              <Button variant="ghost" size="sm" onPress={() => setShowForm(false)}>
                Cancelar
              </Button>
            </View>
          </View>
        ) : (
          <Button variant="outline" className="rounded-2xl" onPress={() => setShowForm(true)}>
            <Plus size={16} color="#e5e2e1" />
            <Text className="text-sm font-medium text-foreground">Novo plano</Text>
          </Button>
        )}

        {plans.isLoading ? <LoadingState /> : null}
        {plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : null}
        {plans.data && plans.data.length === 0 ? (
          <EmptyState
            title="Nenhum plano criado ainda."
            description="Crie um plano para montar sua sequência de exercícios."
          />
        ) : null}

        <View className="gap-2">
          {plans.data?.map((plan) => {
            const count = plan.exercises?.length ?? 0;
            const countLabel = `${count} ${pluralize(count, 'exercício', 'exercícios')}`;
            return (
              <View
                key={plan.id}
                className="flex-row items-center gap-2 rounded-2xl border border-border bg-card p-4"
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${plan.name}, ${countLabel}`}
                  onPress={() => router.push(`/workout/plans/${plan.id}`)}
                  className="min-h-[44px] min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
                >
                  <View className="h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <Dumbbell size={20} color="#2ce500" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-base font-bold text-foreground">
                      {plan.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{countLabel}</Text>
                  </View>
                  <ChevronRight size={16} color="#baccaf" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Excluir plano ${plan.name}`}
                  onPress={() => confirmRemove(plan.id, plan.name)}
                  className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
                >
                  <Trash2 size={16} color="#baccaf" />
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
