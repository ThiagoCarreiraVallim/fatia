import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import {
  activeWorkoutBarLabel,
  activeWorkoutBarView,
  buildExerciseGroups,
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
  const resting = view.mode === 'rest';
  // A linha fina embaixo (prancha `Al-T1b`): séries feitas sobre a meta do plano.
  const progress = setProgress(buildExerciseGroups(session.plannedExercises, session.sets, []));

  return (
    <View
      style={{ bottom, elevation: 10 }}
      className="absolute inset-x-4 z-40 h-14 flex-row items-center gap-1 overflow-hidden rounded-[22px] border border-border bg-muted pr-1.5"
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
        className="h-full min-w-0 flex-1 flex-row items-center gap-3 rounded-[22px] pl-3"
      >
        <View
          className={
            resting
              ? 'h-9 w-9 items-center justify-center rounded-full bg-foreground'
              : 'h-9 w-9 items-center justify-center rounded-full bg-primary'
          }
        >
          <Icon
            name={resting ? 'timer' : view.mode === 'cardio' ? 'steps' : 'dumbbell'}
            size={16}
            color={resting ? colors.background : colors.primaryForeground}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-sans-bold text-sm text-foreground">
            {view.title}
          </Text>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {view.detail}
          </Text>
        </View>
        <Text
          importantForAccessibility="no"
          className="pr-2 font-display-semibold text-base text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {view.clock}
        </Text>
      </Pressable>
      {resting ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mais 30 segundos de descanso"
          onPress={() => rest.addTime(30)}
          className="h-11 justify-center rounded-full bg-card px-3"
        >
          <Text className="font-sans-bold text-[13px] text-foreground">+30 s</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
