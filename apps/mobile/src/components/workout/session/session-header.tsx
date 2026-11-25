import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, MoreHorizontal } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { formatClock } from './format';
import { colors } from '@/theme/colors';

/**
 * O topo da sessão guiada (pranchas `Al-T3` e `Al-T3d`): minimizar à esquerda
 * (o treino segue na barra de baixo, `ActiveWorkoutBar`), o relógio numa
 * pílula no meio e, à direita, o check que finaliza. O "Treino atual" (`Al-T17`)
 * abre pelo "Todas ›" ao lado das séries.
 *
 * O "⋯" ao lado do check (#473) guarda o que é raro e não cabe na prancha:
 * encerrar o exercício sem as séries que faltam e sair sem salvar.
 */
/** Altura do cabeçalho abaixo da área segura: 8 + botão de 44 + 12. */
export const SESSION_HEADER_HEIGHT = 64;

export function SessionHeader({
  startedAt,
  onMinimize,
  onFinish,
  onMore,
  overVideo = false,
}: {
  startedAt: string;
  onMinimize: () => void;
  onFinish: () => void;
  /** Abre o menu "⋯" (encerrar exercício, sair sem salvar). */
  onMore?: () => void;
  /**
   * Prancha `Al-T3`: o vídeo do exercício fica no fundo do topo, e o
   * cabeçalho flutua por cima dele, com os botões escuros translúcidos.
   */
  overVideo?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const clock = useClock(startedAt);
  const button = overVideo ? 'bg-black/60' : 'bg-muted';
  const ink = overVideo ? '#fff' : colors.foreground;
  return (
    <View
      style={{ paddingTop: insets.top + 8 }}
      className={
        overVideo
          ? 'absolute inset-x-0 top-0 z-10 flex-row items-center justify-between gap-2 px-4 pb-3'
          : 'flex-row items-center justify-between gap-2 bg-background px-4 pb-3'
      }
    >
      {/* Os lados com a mesma largura: o relógio fica no meio com o "⋯" à direita. */}
      <View className="w-[96px] flex-row">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Minimizar treino"
          accessibilityHint="O treino continua na barra de baixo"
          onPress={onMinimize}
          className={`h-11 w-11 items-center justify-center rounded-full ${button} active:opacity-80`}
        >
          <ChevronDown size={20} color={ink} />
        </Pressable>
      </View>
      <View
        accessible
        accessibilityLabel={`Tempo de treino ${clock}`}
        className={`h-9 flex-row items-center gap-2 rounded-full ${button} px-3.5`}
      >
        <View className="h-2 w-2 rounded-full bg-primary" />
        <Text
          className={`font-sans-bold text-[15px] ${overVideo ? 'text-white' : 'text-foreground'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {clock}
        </Text>
      </View>
      <View className="w-[96px] flex-row justify-end gap-2">
        {onMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mais opções do treino"
            onPress={onMore}
            className={`h-11 w-11 items-center justify-center rounded-full ${button} active:opacity-80`}
          >
            <MoreHorizontal size={20} color={ink} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Finalizar treino"
          onPress={onFinish}
          className={`h-11 w-11 items-center justify-center rounded-full ${button} active:opacity-80`}
        >
          <Check size={20} color={ink} />
        </Pressable>
      </View>
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
