import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Ruler, Weight } from 'lucide-react-native';
import { progressApi, usersApi } from '@fatia/api-client';

/**
 * Réplica de `apps/web/src/components/profile/profile-metrics.tsx`.
 *
 * O drawer de estatura não fica aqui, como no PWA: bottom sheet se posiciona
 * sobre o pai e precisa ficar fora do `ScrollView` da tela. Quem o abre é a
 * tela, por `onEditHeight`.
 */
export function ProfileMetrics({ onEditHeight }: { onEditHeight: () => void }) {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const today = useQuery({ queryKey: ['dashboard', 'today'], queryFn: () => progressApi.today() });

  const weight = today.data?.weight.latest?.weightKg;
  const height = me.data?.heightCm;

  return (
    <View className="flex-row gap-3">
      <View className="flex-1 rounded-2xl border border-border bg-card p-4">
        <View className="flex-row items-center gap-1.5">
          <Weight size={12} color="#baccaf" />
          <Text className="text-[11px] font-bold text-muted-foreground">Peso Atual</Text>
        </View>
        <Text
          className="mt-1 text-xl font-extrabold text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {weight !== undefined && weight !== null ? `${weight.toFixed(1)} kg` : '—'}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Editar estatura"
        accessibilityHint={height ? `Atualmente ${Math.round(height)} centímetros` : 'Não informada'}
        onPress={onEditHeight}
        className="min-h-[44px] flex-1 rounded-2xl border border-border bg-card p-4 active:opacity-80"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Ruler size={12} color="#baccaf" />
            <Text className="text-[11px] font-bold text-muted-foreground">Estatura</Text>
          </View>
          <Pencil size={11} color="#baccaf" />
        </View>
        <Text
          className="mt-1 text-xl font-extrabold text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {height ? `${Math.round(height)} cm` : '—'}
        </Text>
      </Pressable>
    </View>
  );
}
