import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pause, Play } from 'lucide-react-native';
import { Ring } from '@/components/ui';
import { colors } from '@/theme/colors';
import { formatCountdown } from './format';
import type { RestTimer } from './use-rest-timer';

/** Ativo enquanto houver tempo sobrando, inclusive pausado. */
export function isResting(timer: RestTimer): boolean {
  return timer.remaining != null && timer.remaining > 0;
}

/**
 * "Descansando" (prancha `Al-T3-Sessao`): o anel azul com a contagem ao lado
 * da próxima série e do −15 s / +15 s (e a pausa, que a prancha não tem), e
 * o "Pular descanso" azul embaixo. O cronômetro é o global
 * (`RestTimerProvider`), com o aviso agendado do fim (#182) — esta é só a cara.
 */
export function RestPanel({ timer, next }: { timer: RestTimer; next?: string | null }) {
  const seconds = timer.remaining ?? 0;
  return (
    <View className="gap-3">
      <View
        className="flex-row items-center gap-4 rounded-3xl bg-card p-4"
        style={{ borderWidth: 1.5, borderColor: `${colors.water}59` }}
      >
        <Ring
          value={seconds}
          max={Math.max(timer.total, seconds, 1)}
          size={104}
          stroke={7}
          color={colors.water}
          label="Descanso"
        >
          <Text
            accessibilityLiveRegion={timer.running ? 'polite' : 'none'}
            className="font-display text-[26px] leading-[30px] text-foreground"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatCountdown(seconds)}
          </Text>
        </Ring>
        <View className="min-w-0 flex-1 gap-2">
          <View className="gap-0.5">
            <Text className="font-sans-bold text-[12px] text-water">
              {timer.running ? 'Descansando' : 'Pausado'}
            </Text>
            {next ? (
              <Text numberOfLines={2} className="text-[13px] text-foreground">
                Próxima: {next}
              </Text>
            ) : null}
          </View>
          <View className="flex-row gap-1.5">
            <Control label="Menos 15 segundos de descanso" onPress={() => timer.addTime(-15)}>
              −15 s
            </Control>
            <Control
              label={timer.running ? 'Pausar descanso' : 'Retomar descanso'}
              onPress={timer.toggle}
            >
              {timer.running ? (
                <Pause size={16} color={colors.foreground} />
              ) : (
                <Play size={16} color={colors.foreground} />
              )}
            </Control>
            <Control label="Mais 15 segundos de descanso" onPress={() => timer.addTime(15)}>
              +15 s
            </Control>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pular descanso"
        onPress={timer.stop}
        className="h-[60px] items-center justify-center rounded-full bg-water active:opacity-80"
      >
        <Text className="font-sans-bold text-base" style={{ color: '#06121f' }}>
          Pular descanso
        </Text>
      </Pressable>
    </View>
  );
}

function Control({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-10 flex-1 items-center justify-center rounded-full bg-muted active:opacity-80"
    >
      {typeof children === 'string' ? (
        <Text className="font-sans-bold text-[13px] text-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
