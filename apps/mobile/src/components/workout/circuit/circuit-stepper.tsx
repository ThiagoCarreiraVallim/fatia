import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

/**
 * O −/+ do Novo circuito (Al-T22), com o número digitável no meio. Réplica de
 * `apps/web/src/components/workout/circuit/circuit-stepper.tsx`.
 */
export function CircuitStepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const round = 'h-9 w-9 items-center justify-center rounded-full bg-surface-3 active:opacity-80';

  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Diminuir ${label}`}
        accessibilityState={{ disabled: value <= min }}
        disabled={value <= min}
        onPress={() => onChange(clamp(value - step))}
        className={round}
        style={value <= min ? { opacity: 0.4 } : undefined}
      >
        <Minus size={14} color={colors.foreground} />
      </Pressable>
      <View className="min-w-[64px] flex-row items-baseline justify-center">
        <TextInput
          accessibilityLabel={label}
          keyboardType="number-pad"
          value={text}
          onChangeText={(t) => {
            const raw = t.replace(/\D/g, '').slice(0, 4);
            setText(raw);
            const n = Number(raw);
            if (raw && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => {
            const n = clamp(Number(text) || min);
            setText(String(n));
            if (n !== value) onChange(n);
          }}
          className="min-w-[28px] p-0 text-center font-sans-bold text-[15px] text-foreground"
        />
        {suffix ? (
          <Text className="ml-1 font-sans-bold text-[15px] text-foreground">{suffix}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Aumentar ${label}`}
        accessibilityState={{ disabled: value >= max }}
        disabled={value >= max}
        onPress={() => onChange(clamp(value + step))}
        className={round}
        style={value >= max ? { opacity: 0.4 } : undefined}
      >
        <Plus size={14} color={colors.foreground} />
      </Pressable>
    </View>
  );
}
