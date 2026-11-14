import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Droplet, MoreHorizontal } from 'lucide-react-native';
import { progressApi, type TodaySummary } from '@fatia/api-client';
import { Button, FormMessage } from '@/components/ui';
import { NUMEROS_TABULARES, formatVolume, percentualDaMeta } from './helpers';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/components/dashboard/water-card.tsx`.
 *
 * O azul é o token `water`, lido no render (muda com o tema). O tom
 * translúcido do PWA (`bg-water/10`) vira o hex com alfa: o modificador de
 * opacidade não funciona nesta paleta, que declara `hsl(var(--x))` sem alfa.
 *
 * O drawer não é montado aqui: bottom sheet nativo não é portal e abriria com a
 * altura deste card. Ver o cabeçalho de `src/components/ui/drawer.tsx`.
 */
const ATALHOS_ML = [250, 500, 750] as const;

export function WaterCard({
  data,
  onLogWater,
}: {
  data: TodaySummary['water'];
  onLogWater: () => void;
}) {
  const queryClient = useQueryClient();
  const percentual = percentualDaMeta(data.todayMl, data.targetMl);

  const adicionar = useMutation({
    mutationFn: (ml: number) => progressApi.createWater({ ml }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress', 'water'] });
      queryClient.invalidateQueries({ queryKey: ['water-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      <View pointerEvents="none" className="bg-water/5" style={StyleSheet.absoluteFill} />

      <View className="gap-4 p-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Droplet size={18} color={colors.water} />
            <Text accessibilityRole="header" className="text-[18px] font-semibold text-foreground">
              Hidratação
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mais opções de hidratação"
            onPress={onLogWater}
            className="h-11 w-11 items-center justify-center rounded-xl bg-muted"
          >
            <MoreHorizontal size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View>
          <View className="flex-row items-baseline gap-2">
            <Text style={NUMEROS_TABULARES} className="text-3xl font-extrabold text-foreground">
              {formatVolume(data.todayMl)}
            </Text>
            {data.targetMl !== null ? (
              <Text style={NUMEROS_TABULARES} className="text-sm text-muted-foreground">
                / {formatVolume(data.targetMl)}
              </Text>
            ) : null}
            {data.goalReached ? (
              <View
                className="ml-auto rounded-full px-2 py-0.5"
                style={{ backgroundColor: `${colors.water}26` }}
              >
                <Text className="text-[10px] font-bold" style={{ color: colors.water }}>
                  META BATIDA
                </Text>
              </View>
            ) : null}
          </View>

          {percentual !== null ? (
            <View
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${percentual}% da meta de água`}
              accessibilityValue={{ min: 0, max: 100, now: percentual }}
            >
              <View
                className="h-full rounded-full"
                style={{ width: `${percentual}%`, backgroundColor: colors.water }}
              />
            </View>
          ) : null}
        </View>

        <View className="flex-row gap-2">
          {ATALHOS_ML.map((ml) => (
            <Button
              key={ml}
              variant="outline"
              size="sm"
              className="flex-1 border-water bg-water/10"
              disabled={adicionar.isPending}
              accessibilityLabel={`Adicionar ${ml} mililitros de água`}
              onPress={() => adicionar.mutate(ml)}
            >
              <Text className="text-sm font-bold" style={{ color: colors.water }}>
                +{ml} mL
              </Text>
            </Button>
          ))}
        </View>

        {/* O PWA engole o erro do atalho; num toque rápido de celular, sem
            resposta a pessoa toca de novo e registra em dobro. */}
        {adicionar.error ? <FormMessage>{(adicionar.error as Error).message}</FormMessage> : null}
      </View>
    </View>
  );
}
