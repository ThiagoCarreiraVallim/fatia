import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react-native';
import { customFoodSummary, nutritionApi, type Food } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ErrorState, LoadingState } from '@/components/ui';
import { AlimentoDrawer } from '@/components/nutrition/alimento-drawer';

/**
 * Réplica de `apps/web/src/app/(app)/nutrition/foods/page.tsx`.
 *
 * `?novo=1` abre o cadastro: chega do card vazio e do "Cadastrar à mão" do
 * scanner. O drawer é irmão do `Screen`, como nas outras telas de nutrição.
 */

/** `null` = fechado; `'novo'` = cadastro; alimento = edição. */
type Editando = Food | 'novo' | null;

export default function MeusAlimentosScreen() {
  const router = useRouter();
  const { novo } = useLocalSearchParams<{ novo?: string }>();
  const [editando, setEditando] = useState<Editando>(novo ? 'novo' : null);
  const alimentos = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
  });

  const fechar = (aberto: boolean) => {
    if (aberto) return;
    setEditando(null);
    if (novo) router.setParams({ novo: undefined });
  };

  return (
    <>
      <Screen
        back
        title="Meus alimentos"
        onRefresh={() => void alimentos.refetch()}
        refreshing={alimentos.isRefetching}
      >
        <View className="gap-5 p-4">
          <Text className="text-sm text-muted-foreground">
            O que não está na busca: produto embalado, receita de casa, o pão da padaria. Cadastre
            uma vez e registre como qualquer alimento.
          </Text>
          <Button onPress={() => setEditando('novo')}>
            <View className="flex-row items-center gap-2">
              <Plus size={16} color="#131313" />
              <Text className="text-sm font-medium text-primary-foreground">Novo alimento</Text>
            </View>
          </Button>

          {alimentos.isLoading ? <LoadingState label="Carregando seus alimentos…" /> : null}
          {alimentos.error ? (
            <ErrorState error={alimentos.error} onRetry={() => void alimentos.refetch()} />
          ) : null}
          {alimentos.data && alimentos.data.length === 0 ? (
            <Text className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum alimento cadastrado ainda.
            </Text>
          ) : null}
          {alimentos.data && alimentos.data.length > 0 ? (
            <View className="rounded-xl border border-border bg-card">
              {alimentos.data.map((food, i) => (
                <Pressable
                  key={food.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${food.name}`}
                  onPress={() => setEditando(food)}
                  className={`min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-accent ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                      {food.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{customFoodSummary(food)}</Text>
                  </View>
                  <ChevronRight size={16} color="#baccaf" />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </Screen>

      <AlimentoDrawer
        open={editando !== null}
        onOpenChange={fechar}
        food={editando === 'novo' ? null : editando}
      />
    </>
  );
}
