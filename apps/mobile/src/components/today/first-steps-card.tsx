import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { onboardingApi } from '@fatia/api-client';
import { Icon, Ring, Text, cn } from '@/components/ui';
import { colors } from '@/theme/colors';

/**
 * "Primeiros passos" no Hoje (Onb-11), espelho de
 * `apps/web/src/components/today/first-steps-card.tsx`: três tarefas com o anel,
 * riscadas quando feitas (a API confere); com as três, "Tudo pronto!" até o fim
 * do dia, e o cartão some no seguinte. Os caminhos da API são os mesmos no app.
 */
export function FirstStepsCard() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['onboarding', 'first-steps'],
    queryFn: () => onboardingApi.firstSteps(),
  });
  const view = q.data;
  if (!view || !view.visible) return null;

  if (view.allDone) {
    return (
      <View
        accessibilityLabel="Primeiros passos"
        className="flex-row items-center gap-3.5 rounded-card bg-primary p-5"
      >
        <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-primary-foreground">
          <Icon name="check" color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-h3 text-primary-foreground">Tudo pronto!</Text>
          <Text className="text-[13px] font-semibold text-primary-foreground/75">
            Este cartão some amanhã
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/onboarding?refazer=1')}
          className="h-8 justify-center rounded-chip bg-black/10 px-3"
        >
          <Text className="text-xs font-bold text-primary-foreground">Refazer</Text>
        </Pressable>
      </View>
    );
  }

  const total = view.items.length;
  return (
    <View
      accessibilityLabel="Primeiros passos"
      className="gap-3 rounded-card border border-primary/25 bg-card p-5"
    >
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-h3 text-foreground">
          Primeiros passos
        </Text>
        <Ring
          value={view.doneCount}
          max={total}
          size={44}
          stroke={4}
          label="Primeiros passos feitos"
        >
          <Text className="text-[11px] font-bold text-foreground">
            {view.doneCount}/{total}
          </Text>
        </Ring>
      </View>
      {view.items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="link"
          accessibilityLabel={`${item.title}, ${item.done ? 'feito' : 'a fazer'}`}
          onPress={() => router.push(item.href as Href)}
          className={cn('flex-row items-center gap-3 py-1.5', item.done && 'opacity-55')}
        >
          <View
            className={cn(
              'h-6 w-6 items-center justify-center rounded-full',
              item.done ? 'bg-primary' : 'border-2 border-border-strong',
            )}
          >
            {item.done ? <Icon name="check" size={16} color={colors.primaryForeground} /> : null}
          </View>
          <View className="flex-1">
            <Text className={cn('font-bold text-foreground', item.done && 'line-through')}>
              {item.title}
            </Text>
            <Text className="text-xs text-faint">{item.subtitle}</Text>
          </View>
          <Icon name="chevR" color={colors.mutedForeground} />
        </Pressable>
      ))}
    </View>
  );
}
