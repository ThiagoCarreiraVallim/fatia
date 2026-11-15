import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react-native';
import {
  activeWorkoutBarLabel,
  activeWorkoutBarLines,
  activeWorkoutBarView,
  buildExerciseGroups,
  workoutApi,
  type WorkoutSession,
} from '@fatia/api-client';
import { Icon } from '@/components/ui';
import { setProgress } from '@/components/workout/session/guided-session';
import { useSessionRestTimer } from '@/components/workout/session/rest-timer-provider';
import { colors } from '@/theme/colors';

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * "Treino em andamento" — o `active-workout-bar.tsx` do PWA. Acima da barra de
 * baixo, em toda tela de ver enquanto houver sessão aberta; o toque leva à
 * sessão. No descanso mostra a contagem e o "+30 s".
 */
export function ActiveWorkoutBar({ session, bottom }: { session: WorkoutSession; bottom: number }) {
  const router = useRouter();
  const rest = useSessionRestTimer();
  const now = useNow();
  const view = activeWorkoutBarView(session, rest, now);
  // A sessão não traz o plano; a lista de planos já está em cache na aba Treino.
  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
    enabled: session.planId != null,
  });
  const planName = plans.data?.find((p) => p.id === session.planId)?.name;
  const lines = activeWorkoutBarLines(view, planName);
  const resting = view.mode === 'rest';
  // A linha fina embaixo (prancha `Al-T1b`): séries feitas sobre a meta do plano.
  const progress = setProgress(buildExerciseGroups(session.plannedExercises, session.sets, []));

  return (
    <View
      style={{ bottom, elevation: 10 }}
      className="absolute inset-x-4 z-40 h-14 flex-row items-center gap-1 overflow-hidden rounded-[22px] border border-border bg-muted pr-2"
    >
      {progress.target > 0 ? (
        <View
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-x-0 bottom-0 h-[3px] bg-border"
        >
          <View
            className="h-full bg-primary"
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={
          progress.target > 0
            ? `${activeWorkoutBarLabel(view)}. ${progress.done} de ${progress.target} séries`
            : activeWorkoutBarLabel(view)
        }
        onPress={() => router.push(`/workout/session/${session.id}`)}
        className="h-full min-w-0 flex-1 flex-row items-center gap-3 rounded-[22px] pl-4"
      >
        <View className="w-5 items-center justify-center">
          {resting ? (
            <Icon name="timer" size={16} color={colors.water} />
          ) : (
            <View className="h-2 w-2 rounded-full bg-primary" />
          )}
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-sans-bold text-sm text-foreground">
            {lines.primary}
          </Text>
          <Text
            numberOfLines={1}
            className="text-xs text-muted-foreground"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {lines.secondary}
          </Text>
        </View>
        {resting ? null : (
          <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-primary">
            <Play size={16} color={colors.primaryForeground} fill={colors.primaryForeground} />
          </View>
        )}
      </Pressable>
      {resting ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mais 30 segundos de descanso"
          onPress={() => rest.addTime(30)}
          className="h-10 justify-center rounded-[14px] bg-card px-3"
        >
          <Text className="font-sans-bold text-[13px] text-foreground">+30 s</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
