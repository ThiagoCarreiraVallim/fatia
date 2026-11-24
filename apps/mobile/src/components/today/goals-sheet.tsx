import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  dailyGoalTarget,
  dailyGoalValue,
  dailyGoalVisual,
  type DailyGoal,
} from '@fatia/api-client';
import { Drawer, DrawerScrollView } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { Bar, ChipIcon, TABULAR, toneInk } from './parts';

/**
 * "Metas de hoje" (prancha Al-H5-Metas), espelho de
 * `apps/web/src/components/today/goals-sheet.tsx`: uma linha por meta com a
 * marca de atingida, e os atalhos Ajustar, Pessoais e Compartilhar meu dia.
 */
export function GoalsSheet({
  open,
  onOpenChange,
  goals,
  onWater,
  onSteps,
  onShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: { met: number; total: number; items: DailyGoal[] };
  onWater: () => void;
  onSteps: () => void;
  onShare: () => void;
}) {
  const router = useRouter();

  function go(goal: DailyGoal) {
    const target = dailyGoalTarget(goal.key);
    onOpenChange(false);
    if (target.kind === 'water') onWater();
    else if (target.kind === 'steps') onSteps();
    else router.push(target.href as Href);
  }

  function link(href: string) {
    onOpenChange(false);
    router.push(href as Href);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, gap: 16 }}
      >
        <View className="flex-row items-center justify-between pt-1">
          <Text accessibilityRole="header" className="font-display text-h2 text-foreground">
            Metas de hoje
          </Text>
          <View
            className="h-[22px] items-center justify-center rounded-pill px-2.5"
            style={{ backgroundColor: `${colors.primary}24` }}
          >
            <Text className="text-[11px] font-extrabold uppercase text-primary">
              {goals.met} de {goals.total}
            </Text>
          </View>
        </View>

        {goals.items.length === 0 ? (
          <View className="rounded-card bg-muted p-5">
            <Text className="text-b2 text-muted-foreground">
              Você ainda não tem metas para hoje. Defina suas metas do dia para acompanhar aqui.
            </Text>
          </View>
        ) : (
          <View className="overflow-hidden rounded-card bg-muted">
            {goals.items.map((g, i) => {
              const v = dailyGoalVisual(g);
              return (
                <Pressable
                  key={g.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.label}: ${dailyGoalValue(g)}${g.met ? ', atingida' : ''}`}
                  onPress={() => go(g)}
                  className={
                    i > 0
                      ? 'min-h-[60px] flex-row items-center gap-3.5 border-t border-border px-[18px] py-3.5'
                      : 'min-h-[60px] flex-row items-center gap-3.5 px-[18px] py-3.5'
                  }
                >
                  <ChipIcon icon={v.icon} tone={v.tone} />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-[15px] font-semibold text-foreground">{g.label}</Text>
                      <Text style={TABULAR} className="text-xs text-faint">
                        {dailyGoalValue(g)}
                      </Text>
                    </View>
                    <Bar
                      percent={g.percent}
                      color={g.key === 'kcal' ? colors.foreground : toneInk(v.tone)}
                      className="mt-2"
                    />
                  </View>
                  {g.met ? <Icon name="check" size={16} color={colors.primaryText} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="link"
            onPress={() => link('/nutrition/goals')}
            className="h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-field bg-muted"
          >
            <Icon name="sliders" size={16} />
            <Text className="text-[15px] font-bold text-foreground">Ajustar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => link('/goals')}
            className="h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-field bg-muted"
          >
            <Icon name="target" size={16} />
            <Text className="text-[15px] font-bold text-foreground">Pessoais</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onOpenChange(false);
            onShare();
          }}
          className="h-[52px] flex-row items-center justify-center gap-2 rounded-field bg-primary"
        >
          <Icon name="share" size={16} color={colors.primaryForeground} />
          <Text className="text-[15px] font-bold text-primary-foreground">
            Compartilhar meu dia
          </Text>
        </Pressable>
      </DrawerScrollView>
    </Drawer>
  );
}
