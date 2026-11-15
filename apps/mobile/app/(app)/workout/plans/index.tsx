import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CalendarRange, ChevronRight, Play, Plus, Trash2, Users } from 'lucide-react-native';
import { planSummaryLine, workoutApi, type WorkoutPlan } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, ErrorState, LoadingState, useConfirm } from '@/components/ui';
import { PlanMuscleBar } from '@/components/workout/plan-muscle-bar';
import { colors } from '@/theme/colors';

/** Réplica de `apps/web/src/app/(app)/workout/plans/page.tsx` (Al-T6, #378). */

export default function PlansScreen() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const router = useRouter();

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const block = useQuery({
    queryKey: ['workout', 'block'],
    queryFn: () => workoutApi.getActiveBlock(),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => workoutApi.deletePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  const start = useMutation({
    mutationFn: (planId: string) =>
      workoutApi.startSession({ planId, startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${session.id}`);
    },
  });

  function confirmRemove(id: string, name: string) {
    confirm({
      title: `Excluir “${name}”?`,
      description: 'O histórico das sessões continua.',
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: () => remove.mutate(id),
    });
  }

  const activeBlock = block.data ?? null;
  const week = activeBlock?.currentWeek ?? null;

  return (
    <Screen refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()}>
      <View className="gap-5 px-5 pb-4 pt-4">
        {activeBlock ? (
          <View className="gap-1 rounded-2xl border border-border bg-accent p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {activeBlock.kindLabel}
              {activeBlock.planName ? ` · ${activeBlock.planName}` : ''}
            </Text>
            {week ? (
              <>
                <Text className="text-lg font-extrabold text-foreground">
                  Semana {week.weekNumber} de {activeBlock.weeksTotal}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {week.sessionsDone} de {week.sessionsTarget} sessões nesta semana
                </Text>
              </>
            ) : null}
            {activeBlock.planId && activeBlock.planName ? (
              <Button
                className="mt-2 rounded-full"
                loading={start.isPending}
                onPress={() => activeBlock.planId && start.mutate(activeBlock.planId)}
              >
                <Play size={16} color={colors.primaryForeground} fill={colors.primaryForeground} />
                <Text className="font-bold text-primary-foreground">
                  Começar {activeBlock.planName}
                </Text>
              </Button>
            ) : null}
          </View>
        ) : null}

        <Button
          variant="outline"
          className="rounded-2xl"
          onPress={() => router.push('/workout/plans/new')}
        >
          <Plus size={16} color={colors.foreground} />
          <Text className="text-sm font-medium text-foreground">Novo plano</Text>
        </Button>

        {plans.isLoading ? <LoadingState /> : null}
        {plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : null}
        {plans.data && plans.data.length === 0 ? (
          <EmptyState
            title="Nenhum plano criado ainda."
            description="Monte um treino (ex.: Push, Pull, Pernas) para começar mais rápido na academia."
          />
        ) : null}
        {start.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            Não foi possível começar o treino.
          </Text>
        ) : null}

        <View className="gap-3">
          {plans.data?.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              starting={start.isPending}
              onOpen={() => router.push(`/workout/plans/${plan.id}`)}
              onStart={() => start.mutate(plan.id)}
              onDelete={() => confirmRemove(plan.id, plan.name)}
            />
          ))}
        </View>

        <View className="gap-2">
          <Shortcut
            icon={<Users size={18} color={colors.primaryText} />}
            title="Modelos das comunidades"
            subtitle="planos prontos dos seus grupos"
            onPress={() => router.push('/community')}
          />
          <Shortcut
            icon={<CalendarRange size={18} color={colors.primaryText} />}
            title="Bloco de semanas"
            subtitle="organize força, volume e deload"
            onPress={() => router.push('/workout')}
          />
        </View>
      </View>
    </Screen>
  );
}

function PlanCard({
  plan,
  starting,
  onOpen,
  onStart,
  onDelete,
}: {
  plan: WorkoutPlan;
  starting: boolean;
  onOpen: () => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const exercises = [...(plan.exercises ?? [])].sort((a, b) => a.order - b.order);
  const preview = exercises.slice(0, 3);
  const more = exercises.length - preview.length;
  const summary = planSummaryLine(exercises);
  return (
    <View className="rounded-2xl border border-border bg-card p-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${plan.name}, ${summary}`}
        onPress={onOpen}
        className="flex-row items-start gap-3 active:opacity-80"
      >
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className="shrink text-base font-extrabold text-foreground">
              {plan.name}
            </Text>
            <View className="rounded-md bg-muted px-1.5 py-0.5">
              <Text className="text-[10px] font-bold uppercase text-muted-foreground">
                {plan.fromTemplateId ? 'modelo' : 'seu'}
              </Text>
            </View>
          </View>
          <Text className="text-xs text-muted-foreground">{summary}</Text>
        </View>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Pressable>

      {preview.length > 0 ? (
        <View className="mt-3 gap-1">
          {preview.map((pe, i) => (
            <View key={pe.id} className="flex-row items-center gap-2">
              <Text className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</Text>
              <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
                {pe.exercise.name}
              </Text>
            </View>
          ))}
          {more > 0 ? (
            <View className="flex-row items-center gap-2">
              <Text className="w-4 text-xs font-bold text-muted-foreground">+</Text>
              <Text className="text-sm text-muted-foreground">{more} mais</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <PlanMuscleBar exercises={exercises} className="mt-3" />

      <View className="mt-3 flex-row items-center gap-2">
        <Button
          className="h-11 flex-1 rounded-full"
          accessibilityLabel={`Começar ${plan.name}`}
          disabled={starting || exercises.length === 0}
          onPress={onStart}
        >
          <Play size={14} color={colors.primaryForeground} fill={colors.primaryForeground} />
          <Text className="font-bold text-primary-foreground">Começar</Text>
        </Button>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Excluir plano ${plan.name}`}
          onPress={onDelete}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
        >
          <Trash2 size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

function Shortcut({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
    >
      <View className="h-10 w-10 items-center justify-center rounded-field bg-muted">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}
