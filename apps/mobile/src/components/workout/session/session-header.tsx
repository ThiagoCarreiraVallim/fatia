import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { formatClock } from './format';
import { colors } from '@/theme/colors';

/**
 * O topo da sessão guiada (pranchas `Al-T3` e `Al-T3d`): minimizar à esquerda
 * (o treino segue na barra de baixo, `ActiveWorkoutBar`), o relógio numa
 * pílula no meio e, à direita, o check que finaliza. O "Treino atual" (`Al-T17`)
 * abre pelo "Todas ›" ao lado das séries.
 */
export function SessionHeader({
  startedAt,
  onMinimize,
  onFinish,
}: {
  startedAt: string;
  onMinimize: () => void;
  onFinish: () => void;
}) {
  const insets = useSafeAreaInsets();
  const clock = useClock(startedAt);
  return (
    <View
      style={{ paddingTop: insets.top + 8 }}
      className="flex-row items-center justify-between gap-2 bg-background px-4 pb-3"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Minimizar treino"
        accessibilityHint="O treino continua na barra de baixo"
        onPress={onMinimize}
        className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-80"
      >
        <ChevronDown size={20} color={colors.foreground} />
      </Pressable>
      <View
        accessible
        accessibilityLabel={`Tempo de treino ${clock}`}
        className="h-9 flex-row items-center gap-2 rounded-full bg-muted px-3.5"
      >
        <View className="h-2 w-2 rounded-full bg-primary" />
        <Text
          className="font-sans-bold text-[15px] text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {clock}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Finalizar treino"
        onPress={onFinish}
        className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-80"
      >
        <Check size={20} color={colors.foreground} />
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
