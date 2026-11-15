import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button, Ring } from '@/components/ui';
import { formatCountdown } from './format';
import type { RestTimer } from './use-rest-timer';

/** Ativo enquanto houver tempo sobrando, inclusive pausado. */
export function isResting(timer: RestTimer): boolean {
  return timer.remaining != null && timer.remaining > 0;
}

/**
 * "Descansando" (prancha `Al-T3-Sessao`): o anel com a contagem, a próxima
 * série, −15 s / +15 s e "Pular descanso". O cronômetro é o global
 * (`RestTimerProvider`), com o aviso agendado do fim (#182) — esta é só a cara.
 */
export function RestPanel({ timer, next }: { timer: RestTimer; next?: string | null }) {
  const seconds = timer.remaining ?? 0;
  return (
    <View className="items-center gap-4 rounded-3xl bg-card px-4 py-5">
      <Ring value={seconds} max={Math.max(timer.total, seconds, 1)} size={168} label="Descanso">
        <Text
          accessibilityLiveRegion={timer.running ? 'polite' : 'none'}
          className="font-display-semibold text-[40px] leading-[46px] text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatCountdown(seconds)}
        </Text>
        <Text className="text-[12px] font-sans-bold text-muted-foreground">
          {timer.running ? 'Descansando' : 'Pausado'}
        </Text>
      </Ring>
      {next ? (
        <Text className="text-center text-[13px] text-muted-foreground">Próxima: {next}</Text>
      ) : null}
      <View className="w-full flex-row gap-2">
        <Control label="Menos 15 segundos de descanso" onPress={() => timer.addTime(-15)}>
          −15 s
        </Control>
        <Control
          label={timer.running ? 'Pausar descanso' : 'Retomar descanso'}
          onPress={timer.toggle}
        >
          {timer.running ? 'Pausar' : 'Retomar'}
        </Control>
        <Control label="Mais 15 segundos de descanso" onPress={() => timer.addTime(15)}>
          +15 s
        </Control>
      </View>
      <Button
        variant="outline"
        className="h-12 w-full rounded-full"
        accessibilityLabel="Pular descanso"
        onPress={timer.stop}
      >
        Pular descanso
      </Button>
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
      className="h-12 flex-1 items-center justify-center rounded-full bg-muted active:opacity-80"
    >
      <Text className="font-sans-bold text-sm text-foreground">{children}</Text>
    </Pressable>
  );
}
