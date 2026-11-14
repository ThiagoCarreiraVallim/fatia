import type { ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  daysAgoLabel,
  formatDecimal,
  lastSessionSummary,
  lastWorkoutWhen,
  muscleGroupLabel,
  musclesOfGroups,
  restedHeadline,
  weeklySetsBars,
  workoutApi,
  type WeeklyMuscleSummary,
  type WorkoutSession,
} from '@fatia/api-client';
import { Carousel, LoadingState } from '@/components/ui';
import { MuscleDiagram } from '@/components/workout/muscle-diagram';

/**
 * Os cards da aba Treino (prancha `Al-T-Cards-treino`) — réplica de
 * `apps/web/src/components/workout/cards/workout-cards.tsx`, com os textos e
 * as contas de `workout-cards.ts` do api-client.
 */

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View accessibilityLabel={label} className="flex-1 gap-3.5 rounded-3xl bg-card p-[18px]">
      {children}
    </View>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" className="font-sans-bold text-[13px] text-muted-foreground">
      {children}
    </Text>
  );
}

function CardButton({
  label,
  primary,
  disabled,
  onPress,
}: {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={
        primary
          ? 'h-11 flex-1 items-center justify-center rounded-full bg-primary px-3'
          : 'h-11 flex-1 items-center justify-center rounded-full bg-muted px-3'
      }
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <Text
        numberOfLines={1}
        className={
          primary
            ? 'font-sans-bold text-sm text-primary-foreground'
            : 'font-sans-bold text-sm text-foreground'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Começa uma sessão com o plano e abre a tela dela. */
function useStartPlan() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (planId: string | null) =>
      workoutApi.startSession({ planId: planId ?? undefined, startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${session.id}`);
    },
  });
}

function RestedMusclesCard({ summary }: { summary: WeeklyMuscleSummary }) {
  const router = useRouter();
  const start = useStartPlan();
  const plan = summary.suggestedPlan;
  const groups = summary.rested.map((r) => r.group);
  return (
    <Card label="Seus músculos hoje">
      <Eyebrow>Seus músculos hoje</Eyebrow>
      <View className="flex-row items-center gap-3.5">
        <MuscleDiagram primaryMuscles={musclesOfGroups(groups)} view="front" width={64} />
        <View className="min-w-0 flex-1 gap-1.5">
          <Text className="font-sans-bold text-base text-foreground">
            {restedHeadline(summary.rested)}
          </Text>
          {summary.rested.slice(0, 3).map((r) => (
            <Text key={r.group} className="text-[13px] text-muted-foreground">
              {muscleGroupLabel(r.group)} · {daysAgoLabel(r.daysSince)}
            </Text>
          ))}
        </View>
      </View>
      <View className="mt-auto flex-row gap-2">
        {plan ? (
          <CardButton
            primary
            label={plan.name}
            disabled={start.isPending}
            onPress={() => start.mutate(plan.id)}
          />
        ) : null}
        <CardButton label="Outro plano" onPress={() => router.push('/workout/plans')} />
      </View>
    </Card>
  );
}

function RepeatLastCard({ session }: { session: WorkoutSession }) {
  const router = useRouter();
  const start = useStartPlan();
  const summary = lastSessionSummary(session);
  const facts = [
    summary.durationMinutes !== null ? `${summary.durationMinutes} min` : null,
    `${summary.sets} ${summary.sets === 1 ? 'série' : 'séries'}`,
    `${formatDecimal(summary.volumeTons)} t`,
  ].filter(Boolean);
  return (
    <Card label="Repetir o último treino">
      <Eyebrow>Último treino · {lastWorkoutWhen(session.startedAt)}</Eyebrow>
      <View className="gap-1.5">
        <Text numberOfLines={2} className="font-display text-[28px] leading-[30px] text-foreground">
          {summary.name}
        </Text>
        <Text className="text-[13px] text-muted-foreground">{facts.join(' · ')}</Text>
      </View>
      <View className="mt-auto flex-row gap-2">
        <CardButton
          label="Repetir"
          disabled={start.isPending}
          onPress={() => start.mutate(session.planId)}
        />
        <CardButton primary label="Escolher outro" onPress={() => router.push('/workout/plans')} />
      </View>
    </Card>
  );
}

function WeeklySetsByMuscleCard({ summary }: { summary: WeeklyMuscleSummary }) {
  const bars = weeklySetsBars(summary);
  return (
    <Card label="Séries por músculo na semana">
      <View className="flex-row items-center justify-between">
        <Eyebrow>Séries por músculo · semana</Eyebrow>
        <Text className="text-[13px] text-muted-foreground">meta {summary.target}</Text>
      </View>
      <View className="gap-2">
        {bars.map((b) => (
          <View
            key={b.group}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${b.label}: ${b.sets} de ${summary.target} séries`}
            accessibilityValue={{
              min: 0,
              max: summary.target,
              now: Math.min(b.sets, summary.target),
            }}
            className="gap-1"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] text-foreground">{b.label}</Text>
              <Text className="text-[13px] text-muted-foreground">{b.sets}</Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${b.ratio * 100}%` }}
              />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

type CardKey = 'rested' | 'last' | 'weekly';

/** O carrossel: card sem dado não entra (sem treino nenhum, o "Repetir" não tem o que repetir). */
export function WorkoutCardsCarousel() {
  const { width } = useWindowDimensions();
  const muscles = useQuery({
    queryKey: ['workout', 'muscles', 'week'],
    queryFn: () => workoutApi.getWeeklyMuscleSummary(),
  });
  const last = useQuery({
    queryKey: ['workout', 'sessions', 'last'],
    queryFn: () => workoutApi.getLastSession(),
  });

  if (muscles.isLoading || last.isLoading) return <LoadingState />;

  const keys: CardKey[] = [
    ...(muscles.data ? (['rested'] as const) : []),
    ...(last.data ? (['last'] as const) : []),
    ...(muscles.data ? (['weekly'] as const) : []),
  ];
  if (keys.length === 0) return null;

  return (
    <Carousel
      data={keys}
      keyExtractor={(k) => k}
      itemWidth={Math.round((width - 40) * 0.86)}
      renderItem={({ item }) => (
        <View style={{ width: Math.round((width - 40) * 0.86) }} className="min-h-[220px]">
          {item === 'rested' && muscles.data ? <RestedMusclesCard summary={muscles.data} /> : null}
          {item === 'last' && last.data ? <RepeatLastCard session={last.data} /> : null}
          {item === 'weekly' && muscles.data ? (
            <WeeklySetsByMuscleCard summary={muscles.data} />
          ) : null}
        </View>
      )}
    />
  );
}
