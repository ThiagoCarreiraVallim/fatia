import type { ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  daysAgoLabel,
  feelingOf,
  formatDecimal,
  lastSessionSummary,
  lastWorkoutWhen,
  muscleGroupLabel,
  musclesByRestTone,
  MUSCLE_TONE_LEGEND,
  restedHeadline,
  weeklySetsBars,
  workoutApi,
  type MuscleTone,
  type WeeklyMuscleSummary,
  type WorkoutSession,
} from '@fatia/api-client';
import { Carousel, LoadingState } from '@/components/ui';
import { MuscleDiagram } from '@/components/workout/muscle-diagram';
import { useStartSession } from '@/components/workout/use-start-session';
import { restToneColors } from '@/components/workout/workout-home';
import { colors } from '@/theme/colors';

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

/** O tom da legenda: o mesmo que o diagrama pinta (`restToneColors`). */
function toneSwatch(tone: MuscleTone): { color: string; opacity: number } {
  if (tone === 'rested') return { color: colors.primary, opacity: 1 };
  if (tone === 'recovering') return { color: colors.steps, opacity: 1 };
  return { color: colors.foreground, opacity: 0.2 };
}

function BodyToneLegend() {
  return (
    <View accessibilityLabel="Legenda" className="gap-1">
      {MUSCLE_TONE_LEGEND.map((item) => {
        const { color, opacity } = toneSwatch(item.tone);
        return (
          <View key={item.tone} className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: color, opacity }} />
            <Text className="text-[13px] text-muted-foreground">{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function RestedMusclesCard({ summary }: { summary: WeeklyMuscleSummary }) {
  const router = useRouter();
  const start = useStartSession();
  const plan = summary.suggestedPlan;
  const tones = restToneColors(musclesByRestTone(summary.rested), {
    primary: colors.primary,
    steps: colors.steps,
  });
  const label = summary.rested.length
    ? summary.rested
        .map((r) => `${muscleGroupLabel(r.group)} · ${daysAgoLabel(r.daysSince)}`)
        .join(', ')
    : 'Nenhum grupo descansado';
  return (
    <Card label="Seus músculos hoje">
      <Eyebrow>Seus músculos hoje</Eyebrow>
      <View className="flex-row items-center gap-3.5">
        <MuscleDiagram primaryMuscles={[]} colors={tones} width={52} accessibilityLabel={label} />
        <View className="min-w-0 flex-1 gap-2">
          <Text className="font-sans-bold text-base text-foreground">
            {restedHeadline(summary.rested)}
          </Text>
          <BodyToneLegend />
        </View>
      </View>
      <View className="mt-auto flex-row gap-2">
        {plan ? (
          <CardButton
            primary
            label={plan.name}
            disabled={start.isPending}
            onPress={() => start.mutate({ planId: plan.id })}
          />
        ) : null}
        <CardButton label="Outro plano" onPress={() => router.push('/workout/plans')} />
      </View>
    </Card>
  );
}

function RepeatLastCard({ session }: { session: WorkoutSession }) {
  const router = useRouter();
  const start = useStartSession();
  const summary = lastSessionSummary(session);
  const feeling = feelingOf(session.feeling);
  const facts = [
    summary.durationMinutes !== null ? `${summary.durationMinutes} min` : null,
    `${summary.sets} ${summary.sets === 1 ? 'série' : 'séries'}`,
    `${formatDecimal(summary.volumeTons)} t`,
    feeling ? `${feeling.emoji} ${feeling.label}` : null,
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
          onPress={() => start.mutate({ planId: session.planId })}
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
