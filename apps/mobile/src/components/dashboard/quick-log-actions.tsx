import { Pressable, Text, View } from 'react-native';
import { Droplets, Scale } from 'lucide-react-native';

/**
 * Réplica de `apps/web/src/components/dashboard/quick-log-actions.tsx`.
 *
 * Duas diferenças em relação ao PWA:
 *
 * 1. O botão "Log Água" de lá abre o drawer de **passos** — rótulo e ícone dizem
 *    água, a ação registra passo. Aqui ele abre o de água.
 * 2. Os drawers são montados pela tela, não por este componente (bottom sheet
 *    nativo não é portal; ver `src/components/ui/drawer.tsx`).
 */
export function QuickLogActions({
  onLogWater,
  onLogWeight,
}: {
  onLogWater: () => void;
  onLogWeight: () => void;
}) {
  return (
    <View className="flex-row gap-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Registrar água"
        onPress={onLogWater}
        className="min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-4 active:opacity-80"
      >
        <Droplets size={20} color="#4b8eff" />
        <Text className="text-[12px] font-bold tracking-wide text-foreground">LOG ÁGUA</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Registrar peso"
        onPress={onLogWeight}
        className="min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-4 active:opacity-80"
      >
        <Scale size={20} color="#baccaf" />
        <Text className="text-[12px] font-bold tracking-wide text-foreground">LOG PESO</Text>
      </Pressable>
    </View>
  );
}
