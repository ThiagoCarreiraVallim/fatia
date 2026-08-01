import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Droplet, MoreHorizontal } from 'lucide-react-native';
import { progressApi, type TodaySummary } from '@fatia/api-client';
import { Button, FormMessage } from '@/components/ui';
import { NUMEROS_TABULARES, formatarVolume, percentualDaMeta } from './helpers';

/**
 * Réplica de `apps/web/src/components/dashboard/water-card.tsx`.
 *
 * O azul da hidratação não é token do tema, então vem literal — e os tons
 * translúcidos do PWA (`bg-blue-500/10`) viram cores chapadas: o modificador de
 * opacidade não funciona nesta paleta, que declara `hsl(var(--x))` sem canal
 * alfa.
 *
 * O drawer não é montado aqui: bottom sheet nativo não é portal e abriria com a
 * altura deste card. Ver o cabeçalho de `src/components/ui/drawer.tsx`.
 */
const AZUL = '#4b8eff';
const AZUL_FUNDO = '#16233d';
const AZUL_TEXTO = '#8ab4ff';
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
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(75,142,255,0.06)' }]}
      />

      <View className="gap-4 p-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Droplet size={18} color={AZUL} />
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
            <MoreHorizontal size={16} color="#baccaf" />
          </Pressable>
        </View>

        <View>
          <View className="flex-row items-baseline gap-2">
            <Text style={NUMEROS_TABULARES} className="text-3xl font-extrabold text-foreground">
              {formatarVolume(data.todayMl)}
            </Text>
            {data.targetMl !== null ? (
              <Text style={NUMEROS_TABULARES} className="text-sm text-muted-foreground">
                / {formatarVolume(data.targetMl)}
              </Text>
            ) : null}
            {data.goalReached ? (
              <View
                className="ml-auto rounded-full px-2 py-0.5"
                style={{ backgroundColor: AZUL_FUNDO }}
              >
                <Text className="text-[10px] font-bold" style={{ color: AZUL_TEXTO }}>
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
                style={{ width: `${percentual}%`, backgroundColor: AZUL }}
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
              className="flex-1 border-[#4b8eff] bg-[#16233d]"
              disabled={adicionar.isPending}
              accessibilityLabel={`Adicionar ${ml} mililitros de água`}
              onPress={() => adicionar.mutate(ml)}
            >
              <Text className="text-sm font-bold" style={{ color: AZUL_TEXTO }}>
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
