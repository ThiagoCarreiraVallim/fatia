import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Dumbbell, Play } from 'lucide-react-native';
import type { TodaySummary } from '@fatia/api-client';
import { horaDoDia } from './helpers';

/**
 * Réplica de `apps/web/src/components/dashboard/next-workout-card.tsx`.
 *
 * A faixa superior do PWA é um gradiente com textura de academia. Sem
 * `expo-linear-gradient`, aqui ela é uma faixa `bg-muted` com o haltere como
 * marca d'água — o papel dela é sustentar o selo de estado, não ilustrar.
 */
export function NextWorkoutCard({ workout }: { workout: TodaySummary['workout'] }) {
  const router = useRouter();
  const { plannedToday, sessionInProgress, completedToday } = workout;

  const selo = completedToday
    ? 'Treino concluído'
    : sessionInProgress
      ? 'Em andamento'
      : 'Próximo treino';

  const titulo = sessionInProgress
    ? 'Retomar sessão'
    : completedToday
      ? 'Ver histórico'
      : (plannedToday?.name ?? 'Treino livre');

  const subtitulo = completedToday
    ? 'Parabéns!'
    : sessionInProgress
      ? `Iniciado às ${horaDoDia(sessionInProgress.startedAt)}`
      : plannedToday
        ? 'Plano de treino'
        : 'Sem plano configurado';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${selo}: ${titulo}. ${subtitulo}.`}
      onPress={() =>
        router.push(sessionInProgress ? `/workout/session/${sessionInProgress.id}` : '/workout')
      }
      className="overflow-hidden rounded-xl border border-border bg-card active:opacity-80"
    >
      <View className="h-24 w-full justify-end bg-muted p-4">
        <View className="absolute right-4 top-4" style={{ opacity: 0.25 }}>
          <Dumbbell size={48} color="#baccaf" />
        </View>
        <View className="self-start rounded bg-background px-2 py-1">
          <Text className="text-[11px] font-bold tracking-wide text-foreground">
            {selo.toUpperCase()}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between px-5 py-4">
        <View className="flex-1 gap-1 pr-3">
          <Text accessibilityRole="header" className="text-[18px] font-semibold text-foreground">
            {titulo}
          </Text>
          <Text className="text-[14px] text-muted-foreground">{subtitulo}</Text>
        </View>
        <View className="h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary">
          <Play size={16} color="#131313" fill="#131313" />
        </View>
      </View>
    </Pressable>
  );
}
