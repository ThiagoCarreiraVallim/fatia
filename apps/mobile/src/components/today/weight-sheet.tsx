import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatDecimal,
  progressApi,
  weightDeltaSinceLabel,
  weightSheetBase,
  weightSheetSeries,
  weightSparkPath,
  WEIGHT_STEP_KG,
} from '@fatia/api-client';
import { hojeIso } from '@/components/nutrition/helpers';
import { Drawer, DrawerScrollView } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';
import { dsEase } from '@/theme/motion';
import { TABULAR } from './parts';
import { polylineLength } from './spark';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const round1 = (n: number) => Math.round(n * 10) / 10;
const SPARK_W = 300;
const SPARK_H = 60;

/** O traço de 30 dias se desenha da esquerda para a direita (1,4 s). */
function Spark({ d }: { d: string }) {
  const length = polylineLength(d);
  const drawn = useSharedValue(0);
  useEffect(() => {
    drawn.value = 0;
    drawn.value = withTiming(1, {
      duration: 1400,
      easing: dsEase,
      reduceMotion: ReduceMotion.System,
    });
  }, [drawn]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.value) }));
  return (
    <Svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
      <AnimatedPath
        d={d}
        fill="none"
        stroke={colors.primary}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={length}
        animatedProps={props}
      />
    </Svg>
  );
}

/**
 * Peso (prancha Al-H4-Peso), espelho de
 * `apps/web/src/components/today/weight-sheet.tsx`: − e + de 0,1 kg em torno do
 * último registro, a diferença para a pesagem anterior e o traço de 30 dias.
 * Salvar no mesmo dia corrige o registro de hoje em vez de duplicar.
 */
export function WeightSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = hojeIso();
  const qc = useQueryClient();
  const toast = useToast();
  const progress = useQuery({
    queryKey: ['progress', 'weight', 30],
    queryFn: () => progressApi.weight(30),
    enabled: open,
  });
  const base = weightSheetBase(progress.data, today);
  const loggedToday = base.todayLogId !== null;

  const [kg, setKg] = useState<number | null>(null);
  // Fechar descarta o ajuste: a próxima abertura parte do último registro.
  const close = (o: boolean) => {
    if (!o) setKg(null);
    onOpenChange(o);
  };
  const value = kg ?? base.startKg;

  const save = useMutation({
    mutationFn: () =>
      base.todayLogId
        ? progressApi.updateWeight(base.todayLogId, { weightKg: value })
        : progressApi.createWeight({ weightKg: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['progress', 'weight'] });
      void qc.invalidateQueries({ queryKey: ['weight-logs'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.show({ message: `Peso salvo: ${formatDecimal(value)} kg` });
      close(false);
    },
    onError: () => toast.show({ message: 'Não deu para salvar o peso. Tente de novo.' }),
  });

  const reference = base.reference;
  const delta = reference ? round1(value - reference.weightKg) : null;
  const shown = formatDecimal(value);
  const path = weightSparkPath(
    weightSheetSeries(base.points, value, loggedToday),
    SPARK_W,
    SPARK_H,
  );
  const ok = delta !== null && delta <= 0;

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, gap: 16 }}
      >
        <View className="flex-row items-center justify-between pt-1">
          <Text accessibilityRole="header" className="font-display text-h2 text-foreground">
            Peso
          </Text>
          <View className="h-8 flex-row items-center gap-1.5 rounded-pill bg-muted px-3">
            <Icon name="cal" size={16} />
            <Text className="text-[13px] font-semibold text-foreground">Hoje</Text>
          </View>
        </View>

        <View className="flex-row items-center justify-between py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Menos 0,1 kg"
            onPress={() => setKg(round1(value - WEIGHT_STEP_KG))}
            className="h-14 w-14 items-center justify-center rounded-full bg-muted"
          >
            <View className="h-0.5 w-4 rounded-[1px] bg-foreground" />
          </Pressable>
          <View className="items-center gap-1">
            <Text
              accessibilityLiveRegion="polite"
              style={[TABULAR, { fontSize: 72, lineHeight: 76, letterSpacing: -3.6 }]}
              className="font-display text-foreground"
            >
              {shown}
              <Text className="text-[22px] text-muted-foreground"> kg</Text>
            </Text>
            {delta !== null && reference ? (
              <View
                className="h-[22px] items-center justify-center rounded-pill px-2.5"
                style={{ backgroundColor: `${ok ? colors.primary : colors.warning}24` }}
              >
                <Text
                  className="text-[11px] font-extrabold"
                  style={{ color: ok ? colors.primaryText : colors.warning }}
                >
                  {weightDeltaSinceLabel(delta, reference.date, today)}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mais 0,1 kg"
            onPress={() => setKg(round1(value + WEIGHT_STEP_KG))}
            className="h-14 w-14 items-center justify-center rounded-full bg-primary"
          >
            <Icon name="plus" size={24} color={colors.primaryForeground} />
          </Pressable>
        </View>

        {base.points.length > 0 ? (
          <View className="gap-2 rounded-card bg-muted px-[18px] py-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-b2 text-foreground">30 dias</Text>
              <Text style={TABULAR} className="text-xs text-muted-foreground">
                {formatDecimal(base.points[0]!)} → {shown}
              </Text>
            </View>
            {open ? <Spark d={path} /> : null}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={save.isPending || progress.isLoading}
          onPress={() => save.mutate()}
          className="h-[52px] items-center justify-center rounded-field bg-primary"
          style={{ opacity: save.isPending || progress.isLoading ? 0.5 : 1 }}
        >
          <Text className="text-[15px] font-bold text-primary-foreground">Salvar {shown} kg</Text>
        </Pressable>
      </DrawerScrollView>
    </Drawer>
  );
}
