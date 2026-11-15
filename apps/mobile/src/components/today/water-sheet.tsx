import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatInteger,
  progressApi,
  shiftDay,
  waterLeftLabel,
  waterSheetAddedToast,
  WATER_DELETED_TOAST,
  WATER_QUICK_ML,
  type WaterLog,
} from '@fatia/api-client';
import { hojeIso } from '@/components/nutrition/helpers';
import { horaDoDia } from '@/components/dashboard/helpers';
import { Drawer, DrawerScrollView } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/selection';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';
import { dsSpring } from '@/theme/motion';
import { TABULAR } from './parts';

type Day = 'y' | 't';

/**
 * Água (prancha Al-H3-Agua), espelho de
 * `apps/web/src/components/today/water-sheet.tsx`: Ontem/Hoje, o copo que enche
 * com mola (.6 s), o total sobre a meta, os atalhos e os registros do dia.
 * Desfazer é apagar na lista; cada ação confirma com um toast.
 */
export function WaterSheet({
  open,
  onOpenChange,
  targetMl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetMl: number;
}) {
  const [day, setDay] = useState<Day>('t');
  const today = hojeIso();
  const date = day === 't' ? today : shiftDay(today, -1);
  const qc = useQueryClient();
  const toast = useToast();

  const logs = useQuery({
    queryKey: ['water-logs', 'day', date],
    queryFn: () => progressApi.listWater({ from: date, to: date }),
    enabled: open,
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['water-logs'] });
    void qc.invalidateQueries({ queryKey: ['progress', 'water'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const add = useMutation({
    mutationFn: (ml: number) =>
      progressApi.createWater({ ml, ...(date !== today ? { date } : {}) }),
    onSuccess: (_d, ml) => {
      invalidate();
      toast.show({ message: waterSheetAddedToast(ml) });
    },
    onError: () => toast.show({ message: 'Não deu para registrar a água. Tente de novo.' }),
  });

  const remove = useMutation({
    mutationFn: (log: WaterLog) => progressApi.deleteWater(log.id),
    onSuccess: () => {
      invalidate();
      toast.show({ message: WATER_DELETED_TOAST });
    },
    onError: () => toast.show({ message: 'Não deu para apagar. Tente de novo.' }),
  });

  const list = logs.data?.logs ?? [];
  const total = list.reduce((a, l) => a + l.ml, 0);
  const fill = Math.min(100, (total / targetMl) * 100);

  const height = useSharedValue(0);
  useEffect(() => {
    height.value = withTiming(fill, {
      duration: 600,
      easing: dsSpring,
      reduceMotion: ReduceMotion.System,
    });
  }, [fill, height]);
  const fillStyle = useAnimatedStyle(() => ({ height: `${height.value}%` }));

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) setDay('t');
        onOpenChange(o);
      }}
    >
      <DrawerScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, gap: 16 }}
      >
        <View className="flex-row items-center justify-between gap-3 pt-1">
          <Text accessibilityRole="header" className="font-display text-h2 text-foreground">
            Água
          </Text>
          <Segmented
            label="Dia"
            value={day}
            onChange={setDay}
            options={[
              { value: 'y', label: 'Ontem' },
              { value: 't', label: 'Hoje' },
            ]}
            className="w-[170px]"
          />
        </View>

        <View className="flex-row items-center gap-4">
          <View
            importantForAccessibility="no-hide-descendants"
            className="h-[132px] w-24 justify-end overflow-hidden bg-muted"
            style={{
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderBottomLeftRadius: 28,
              borderBottomRightRadius: 28,
              borderWidth: 2,
              borderColor: colors.borderStrong,
            }}
          >
            <Animated.View style={[{ backgroundColor: colors.water }, fillStyle]} />
          </View>
          <View className="flex-1 gap-1" accessibilityLiveRegion="polite">
            <Text style={TABULAR} className="font-display text-d1 text-foreground">
              {formatInteger(total)}
            </Text>
            <Text className="text-b2 text-muted-foreground">
              de {formatInteger(targetMl)} mL · {waterLeftLabel(total, targetMl)}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          {WATER_QUICK_ML.map((ml) => (
            <Pressable
              key={ml}
              accessibilityRole="button"
              accessibilityLabel={`Adicionar ${ml} mililitros`}
              disabled={add.isPending}
              onPress={() => add.mutate(ml)}
              className="h-14 flex-1 items-center justify-center rounded-field"
              style={{ backgroundColor: `${colors.water}24`, opacity: add.isPending ? 0.5 : 1 }}
            >
              <Text className="text-[15px] font-bold" style={{ color: colors.water }}>
                {ml >= 1000 ? `+${ml / 1000} L` : `+${ml}`}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="overflow-hidden rounded-card bg-muted">
          {logs.isLoading ? (
            <View className="px-[18px] py-4">
              <ActivityIndicator color={colors.mutedForeground} />
            </View>
          ) : logs.isError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void logs.refetch()}
              className="px-[18px] py-4"
            >
              <Text className="text-b2 text-danger">Não deu para carregar. Tentar de novo</Text>
            </Pressable>
          ) : list.length === 0 ? (
            <Text className="px-[18px] py-4 text-b2 text-muted-foreground">
              Nenhum registro {day === 't' ? 'hoje' : 'ontem'}.
            </Text>
          ) : (
            list.map((log, i) => (
              <View
                key={log.id}
                className={
                  i > 0
                    ? 'min-h-[52px] flex-row items-center gap-3.5 border-t border-border px-[18px]'
                    : 'min-h-[52px] flex-row items-center gap-3.5 px-[18px]'
                }
              >
                <Text style={TABULAR} className="font-bold text-foreground">
                  {formatInteger(log.ml)} mL
                </Text>
                <Text className="flex-1 text-xs text-faint">{horaDoDia(log.loggedAt)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Apagar registro de ${log.ml} mL das ${horaDoDia(log.loggedAt)}`}
                  disabled={remove.isPending}
                  onPress={() => remove.mutate(log)}
                  className="h-11 w-11 items-center justify-center"
                >
                  <Icon name="trash" size={16} color={colors.faintForeground} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenChange(false)}
          className="h-[52px] items-center justify-center rounded-field bg-primary"
        >
          <Text className="text-[15px] font-bold text-primary-foreground">Pronto</Text>
        </Pressable>
      </DrawerScrollView>
    </Drawer>
  );
}
