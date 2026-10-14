import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react-native';
import { nutritionApi } from '@fatia/api-client';

/** Réplica de `apps/web/src/components/nutrition/custom-foods-card.tsx`. */

const PREVIA = 3;

export function MeusAlimentosCard() {
  const router = useRouter();
  const alimentos = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
  });
  const lista = alimentos.data ?? [];
  const resto = lista.length - PREVIA;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Package size={15} color="#2ce500" />
          <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
            Meus alimentos
          </Text>
        </View>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Gerenciar meus alimentos"
          onPress={() => router.push('/nutrition/foods')}
          hitSlop={12}
          className="min-h-[44px] flex-row items-center gap-1"
        >
          <Text className="text-[11px] font-bold text-primary">Gerenciar</Text>
          <ChevronRight size={12} color="#2ce500" />
        </Pressable>
      </View>
      {lista.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cadastrar um alimento"
          onPress={() => router.push('/nutrition/foods?novo=1')}
          className="rounded-xl border border-dashed border-border p-4"
        >
          <Text className="text-center text-xs text-muted-foreground">
            Produto embalado ou receita de casa que não está na busca? Toque para cadastrar.
          </Text>
        </Pressable>
      ) : (
        <Text className="text-xs text-muted-foreground">
          {lista
            .slice(0, PREVIA)
            .map((f) => f.name)
            .join(', ')}
          {resto > 0 ? ` e mais ${resto}` : ''}
        </Text>
      )}
    </View>
  );
}
