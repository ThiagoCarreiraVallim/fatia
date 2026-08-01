import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TodaySummary } from '@fatia/api-client';
import { MacroBar } from './macro-bar';
import { NUMEROS_TABULARES, alvoMedio } from './helpers';

/**
 * Réplica de `apps/web/src/components/dashboard/nutrition-macro-card.tsx`.
 *
 * As cores das barras são literais porque nenhuma delas é token do tema — no PWA
 * também são. A gordura foge do `destructive` do tema (`#93000a`): como
 * preenchimento de barra sobre fundo escuro ele praticamente some, o mesmo
 * motivo pelo qual `src/components/nutrition/macro-bar.tsx` escolheu este
 * vermelho.
 */
const CORES = {
  kcal: '#ffb4ab',
  proteina: '#4b8eff',
  carboidrato: '#2ce500',
  gordura: '#f43f5e',
} as const;

export function NutritionMacroCard({ nutrition }: { nutrition: TodaySummary['nutrition'] }) {
  const router = useRouter();
  const { consumed, goals } = nutrition;

  const alvoKcal = goals ? alvoMedio(goals.kcalMin, goals.kcalMax) : 0;
  const kcalRestante = goals ? Math.max(0, alvoKcal - Math.round(consumed.kcal)) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Resumo de nutrição de hoje. Abrir nutrição."
      onPress={() => router.push('/nutrition')}
      className="overflow-hidden rounded-xl border border-border bg-card active:opacity-80"
    >
      {/* Tinta verde do PWA. Lá é um gradiente; sem `expo-linear-gradient` no
          projeto, um véu chapado é a aproximação que não custa dependência. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(44,229,0,0.06)' }]}
      />

      <View className="gap-4 p-5">
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="text-[18px] font-semibold text-foreground">
            Resumo de Nutrição
          </Text>
          <Text className="text-xl">🥗</Text>
        </View>

        <View className="flex-row gap-4">
          <View className="w-24 shrink-0 items-center justify-center gap-1 border-r border-border pr-4">
            {kcalRestante !== null ? (
              <>
                <Text className="text-[11px] font-bold tracking-wide text-muted-foreground">
                  RESTAM
                </Text>
                <Text style={NUMEROS_TABULARES} className="text-2xl font-bold text-foreground">
                  {kcalRestante}
                </Text>
                <Text className="text-[11px] text-muted-foreground">kcal</Text>
              </>
            ) : (
              <Text className="text-center text-xs text-muted-foreground">Sem meta definida</Text>
            )}
          </View>

          <View className="flex-1 gap-3">
            <MacroBar
              label="KCAL"
              atual={consumed.kcal}
              alvo={alvoKcal}
              unidade=""
              cor={CORES.kcal}
            />
            <MacroBar
              label="PROT"
              atual={consumed.proteinG}
              alvo={goals ? alvoMedio(goals.proteinMinG, goals.proteinMaxG) : 0}
              cor={CORES.proteina}
            />
            <MacroBar
              label="CARB"
              atual={consumed.carbsG}
              alvo={goals ? alvoMedio(goals.carbsMinG, goals.carbsMaxG) : 0}
              cor={CORES.carboidrato}
            />
            <MacroBar
              label="GORD"
              atual={consumed.fatG}
              alvo={goals ? alvoMedio(goals.fatMinG, goals.fatMaxG) : 0}
              cor={CORES.gordura}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
