import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ListChecks } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { formatClock } from './format';
import { colors } from '@/theme/colors';

/**
 * O topo da sessão guiada (prancha `Al-T3-Sessao`): minimizar à esquerda (o
 * treino segue na barra de baixo, `ActiveWorkoutBar`), o relógio no meio e,
 * à direita, o "Treino atual" (`Al-T17`) e o "Finalizar".
 */
export function SessionHeader({
  startedAt,
  onMinimize,
  onOverview,
  onFinish,
}: {
  startedAt: string;
  onMinimize: () => void;
  onOverview: () => void;
  onFinish: () => void;
}) {
  const insets = useSafeAreaInsets();
  const clock = useClock(startedAt);
  return (
    <View
      style={{ paddingTop: insets.top + 6 }}
      className="flex-row items-center gap-1 bg-background px-3 pb-2"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Minimizar treino"
        accessibilityHint="O treino continua na barra de baixo"
        onPress={onMinimize}
        className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
      >
        <ChevronDown size={24} color={colors.foreground} />
      </Pressable>
      <Text
        accessibilityLabel={`Tempo de treino ${clock}`}
        className="flex-1 text-center font-display-semibold text-xl text-foreground"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {clock}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Treino atual: ver e editar os exercícios"
        onPress={onOverview}
        className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
      >
        <ListChecks size={22} color={colors.foreground} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Finalizar treino"
        onPress={onFinish}
        className="h-11 justify-center rounded-full bg-muted px-4 active:opacity-80"
      >
        <Text className="font-sans-bold text-sm text-foreground">Finalizar</Text>
      </Pressable>
    </View>
  );
}

/** "24:18": o tempo desde o início, a cada segundo, contado pelo relógio e não por tique. */
function useClock(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return formatClock(Math.max(0, Math.floor((now - start) / 1000)));
}
