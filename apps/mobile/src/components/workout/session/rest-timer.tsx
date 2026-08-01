import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Pause, Play, Plus, SkipForward, Timer } from 'lucide-react-native';
import { formatCountdown } from './format';
import type { RestTimer as RestTimerState } from './use-rest-timer';

/**
 * Bloco de descanso do card de série — o mesmo lugar do PWA, com os controles
 * que só fazem sentido no celular: `+30s`, pausar e pular, todos com 44pt de
 * alvo porque a mão que os toca acabou de largar a barra.
 */
export function RestTimer({ timer }: { timer: RestTimerState }) {
  const idle = timer.remaining == null;
  const seconds = timer.remaining ?? timer.total;
  const elapsedRatio = timer.total > 0 ? 1 - Math.min(1, seconds / timer.total) : 0;

  return (
    <View className="mt-4 rounded-xl bg-muted px-4 py-3">
      <View className="flex-row items-center justify-center gap-2">
        <Timer size={16} color="#2ce500" />
        <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">
          TEMPO DE DESCANSO
        </Text>
      </View>

      <Text
        accessibilityLiveRegion={timer.running ? 'polite' : 'none'}
        accessibilityLabel={`Descanso: ${formatCountdown(seconds)}`}
        className="mt-1 text-center text-3xl font-extrabold text-primary"
      >
        {formatCountdown(seconds)}
      </Text>

      <View className="mt-2 h-1 overflow-hidden rounded-full bg-background">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(elapsedRatio * 100)}%` }}
        />
      </View>

      {timer.finished ? (
        <Text className="mt-2 text-center text-[11px] font-bold text-primary">
          Descanso terminado
        </Text>
      ) : null}

      <View className="mt-2 flex-row items-center justify-center gap-2">
        {idle ? (
          <Control label="Iniciar descanso" onPress={() => timer.start()}>
            <Play size={16} color="#e5e2e1" />
          </Control>
        ) : (
          <>
            <Control label="Somar 30 segundos ao descanso" onPress={() => timer.addTime(30)}>
              <Plus size={16} color="#e5e2e1" />
              <Text className="text-xs font-bold text-foreground">30s</Text>
            </Control>
            <Control
              label={timer.running ? 'Pausar descanso' : 'Retomar descanso'}
              disabled={timer.finished}
              onPress={timer.toggle}
            >
              {timer.running ? (
                <Pause size={16} color="#e5e2e1" />
              ) : (
                <Play size={16} color="#e5e2e1" />
              )}
            </Control>
            <Control label="Pular descanso" onPress={timer.stop}>
              <SkipForward size={16} color="#e5e2e1" />
            </Control>
          </>
        )}
      </View>
    </View>
  );
}

function Control({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={disabled ? { opacity: 0.5 } : undefined}
      className="min-h-[44px] min-w-[44px] flex-row items-center justify-center gap-1 rounded-full bg-background px-3 active:opacity-80"
    >
      {children}
    </Pressable>
  );
}
