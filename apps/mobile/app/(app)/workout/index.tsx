import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Dumbbell, HeartPulse, History, Plus } from 'lucide-react-native';
import {
  planCardInfo,
  planMuscleBars,
  QUICK_TEMPLATES,
  trainingWeekLabel,
  workoutApi,
  type QuickTemplate,
  type TrainingWeek,
  type WorkoutPlan,
} from '@fatia/api-client';
import { WorkoutCardsCarousel } from '@/components/workout/cards/workout-cards';
import { Screen } from '@/components/layout/screen';
import { Carousel, ErrorState, LoadingState } from '@/components/ui';
import { BlockTimeline } from '@/components/workout/block-timeline';
import { quickVisual } from '@/components/workout/quick-template-visual';
import { useStartSession } from '@/components/workout/use-start-session';
import { groupColorName, weekChips } from '@/components/workout/workout-home';
import { colors } from '@/theme/colors';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';

/**
 * A aba Treino do redesign (prancha `Al-T1-Treino`, #377): a semana, os cards,
 * os planos da pessoa e os outros jeitos de treinar.
 *
 * O treino em andamento não tem mais aviso aqui: a barra acima da navegação
 * (`ActiveWorkoutBar`, prancha `Al-T1b`) já leva a ele em qualquer tela. E
 * começar outro com um aberto cai no aberto (`useStartSession`, 409).
 */

function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text accessibilityRole="header" className="font-sans-bold text-lg text-foreground">
        {children}
      </Text>
      {action}
    </View>
  );
}

function WeekRow({ week, activeSessionId }: { week: TrainingWeek; activeSessionId?: string }) {
  const router = useRouter();
  const chips = weekChips(week);
  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline justify-between">
        <Text accessibilityRole="header" className="font-sans-bold text-lg text-foreground">
          Semana
        </Text>
        <Text className="text-[13px] text-muted-foreground">{trainingWeekLabel(week)}</Text>
      </View>
      <View className="flex-row justify-between gap-1.5">
        {chips.map((chip) => {
          const target =
            chip.state === 'active' && activeSessionId
              ? `/workout/session/${activeSessionId}`
              : chip.state === 'trained'
                ? '/workout/history'
                : null;
          const bg =
            chip.state === 'trained'
              ? colors.primary
              : chip.state === 'active'
                ? colors.foreground
                : colors.muted;
          const fg =
            chip.state === 'trained'
              ? colors.primaryForeground
              : chip.state === 'active'
                ? colors.background
                : colors.mutedForeground;
          return (
            <Pressable
              key={chip.date}
              accessibilityRole={target ? 'button' : 'text'}
              accessibilityLabel={chip.label}
              disabled={!target}
              onPress={() => target && router.push(target as never)}
              className="h-14 min-w-[40px] flex-1 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: bg,
                borderWidth: chip.today ? 2 : 0,
                borderColor: colors.foreground,
              }}
            >
              <Text className="text-[11px] font-sans-bold" style={{ color: fg }}>
                {chip.letter}
              </Text>
              <Text className="font-display-semibold text-base" style={{ color: fg }}>
                {chip.day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MuscleShareBar({ plan }: { plan: WorkoutPlan }) {
  const bars = planMuscleBars(plan);
  if (bars.length === 0) return <View className="h-1.5 rounded-full bg-muted" />;
  return (
    <View className="h-1.5 flex-row gap-0.5 overflow-hidden rounded-full">
      {bars.map((b) => (
        <View
          key={b.group}
          style={{ flex: b.share, backgroundColor: colors[groupColorName(b.group)] }}
        />
      ))}
    </View>
  );
}

function PlanCard({ plan, width }: { plan: WorkoutPlan; width: number }) {
  const router = useRouter();
  const info = planCardInfo(plan);
  const names = (plan.exercises ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map((e) => e.exercise?.name)
    .filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${plan.name}, ${info}`}
      onPress={() => router.push(`/workout/plans/${plan.id}`)}
      style={{ width }}
      className="min-h-[168px] gap-2 rounded-3xl bg-card p-4 active:opacity-80"
    >
      <Text numberOfLines={1} className="font-display text-[22px] leading-[26px] text-foreground">
        {plan.name}
      </Text>
      <Text numberOfLines={1} className="text-[12px] text-muted-foreground">
        {info}
      </Text>
      <View className="gap-0.5">
        {names.map((name) => (
          <Text key={name} numberOfLines={1} className="text-[13px] text-foreground">
            {name}
          </Text>
        ))}
      </View>
      <View className="mt-auto">
        <MuscleShareBar plan={plan} />
      </View>
    </Pressable>
  );
}

function NewPlanCard({ width }: { width: number }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Novo plano"
      onPress={() => router.push('/workout/plans')}
      style={{ width }}
      className="min-h-[168px] items-center justify-center gap-2 rounded-3xl border border-dashed border-border active:opacity-80"
    >
      <Plus size={22} color={colors.foreground} />
      <Text className="font-sans-bold text-sm text-foreground">Novo plano</Text>
    </Pressable>
  );
}

function WayCard({
  title,
  subtitle,
  icon: Icon,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: typeof Plus;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-[88px] flex-1 justify-between rounded-3xl bg-card p-4 active:opacity-80"
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <Icon size={20} color={colors.foreground} />
      <View>
        <Text className="font-sans-bold text-sm text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function QuickCard({ template, width }: { template: QuickTemplate; width: number }) {
  const router = useRouter();
  const { tint, icon: Icon } = quickVisual(template.id);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${template.title}. ${template.level}, ${template.duration}, ${template.location}`}
      onPress={() => router.push(`/workout/quick/${template.id}`)}
      style={{ width, backgroundColor: tint }}
      className="h-36 justify-end overflow-hidden rounded-3xl p-4 active:opacity-80"
    >
      <View className="absolute right-3 top-3 opacity-30">
        <Icon size={56} color={colors.foreground} />
      </View>
      <Text className="text-[11px] font-sans-bold text-muted-foreground">{template.level}</Text>
      <Text className="mt-1 text-base font-sans-bold leading-tight text-foreground">
        {template.title}
      </Text>
      <Text className="mt-1 text-[12px] text-muted-foreground">
        {template.duration} · {template.location}
      </Text>
    </Pressable>
  );
}

export default function WorkoutScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const start = useStartSession();

  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // A mesma chave do carrossel: uma ida ao servidor para os dois.
  const summary = useQuery({
    queryKey: ['workout', 'muscles', 'week'],
    queryFn: () => workoutApi.getWeeklyMuscleSummary(),
  });

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const planWidth = Math.round((width - 40) * 0.62);
  const quickCardWidth = Math.round((width - 40) * 0.7);

  return (
    <Screen
      actions={
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Histórico de treinos"
            onPress={() => router.push('/workout/history')}
            className={TOP_BAR_ACTION}
          >
            <History size={20} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Novo plano"
            onPress={() => router.push('/workout/plans')}
            className={TOP_BAR_ACTION}
          >
            <Plus size={22} color={colors.foreground} />
          </Pressable>
        </>
      }
      refreshing={active.isRefetching || plans.isRefetching || summary.isRefetching}
      onRefresh={() => {
        void active.refetch();
        void plans.refetch();
        void summary.refetch();
      }}
    >
      <View className="gap-6 px-5 pb-4 pt-4">
        {/* TODO(#379): o aviso "<treinador> enviou um plano · toque para ver e
            aceitar" entra aqui, acima da semana, quando houver plano recebido. */}

        {summary.data?.week ? (
          <WeekRow week={summary.data.week} activeSessionId={active.data?.id} />
        ) : null}

        <WorkoutCardsCarousel />

        <View className="gap-3">
          <SectionTitle
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver todos os planos"
                onPress={() => router.push('/workout/plans')}
                className="min-h-[44px] justify-center px-1"
              >
                <Text className="font-sans-bold text-[13px] text-primary-text">Ver todos</Text>
              </Pressable>
            }
          >
            Seus planos
          </SectionTitle>

          {plans.isLoading ? <LoadingState /> : null}
          {plans.isError ? (
            <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
          ) : null}

          {plans.data ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
            >
              {plans.data.map((plan) => (
                <PlanCard key={plan.id} plan={plan} width={planWidth} />
              ))}
              <NewPlanCard width={plans.data.length ? Math.round(planWidth * 0.6) : planWidth} />
            </ScrollView>
          ) : null}
        </View>

        <View className="gap-3">
          <SectionTitle>Outros jeitos de treinar</SectionTitle>
          <View className="flex-row gap-3">
            <WayCard
              title="Livre"
              subtitle="monte na hora"
              icon={Dumbbell}
              disabled={start.isPending}
              onPress={() => start.mutate({})}
            />
            <WayCard
              title="Só cardio"
              subtitle="esteira, bike…"
              icon={HeartPulse}
              disabled={start.isPending}
              onPress={() => start.mutate({ then: 'cardio' })}
            />
          </View>
          <Carousel
            data={QUICK_TEMPLATES}
            itemWidth={quickCardWidth}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => <QuickCard template={item} width={quickCardWidth} />}
          />
        </View>

        <View className="gap-3">
          <SectionTitle>Periodização</SectionTitle>
          <BlockTimeline />
        </View>
      </View>
    </Screen>
  );
}
