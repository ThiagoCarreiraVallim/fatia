import { Pressable, View } from 'react-native';
import { DrawerTextInput } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { parseAmount } from './parse';

/**
 * O número grande com − e + da prancha Al-G7 — réplica de
 * `apps/web/src/components/progress/value-stepper.tsx`. Continua digitável: o − e o +
 * são para o ajuste fino.
 */
export function ValueStepper({
  label,
  value,
  onChange,
  step,
  base,
  unit,
  decimals,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  /** Ponto de partida do − e + com o campo vazio (o último registro). */
  base: number | null;
  unit: string;
  decimals: number;
  placeholder?: string;
}) {
  const bump = (dir: 1 | -1) => {
    const current = value.trim() === '' ? (base ?? 0) : parseAmount(value);
    if (current === null) return;
    const next = Math.max(0, current + dir * step);
    onChange(decimals ? next.toFixed(decimals).replace('.', ',') : String(Math.round(next)));
  };
  return (
    <View className="flex-row items-center justify-center gap-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Menos"
        onPress={() => bump(-1)}
        className="h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-muted"
      >
        <View style={{ width: 12, height: 2, backgroundColor: colors.foreground }} />
      </Pressable>
      <View className="min-w-[150px] flex-row items-baseline justify-center gap-1">
        <DrawerTextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primary}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          style={{
            minWidth: 110,
            textAlign: 'center',
            fontSize: 44,
            fontWeight: '700',
            color: colors.foreground,
            paddingVertical: 0,
          }}
        />
        <Text className="font-sans-semibold text-base text-muted-foreground">{unit}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mais"
        onPress={() => bump(1)}
        className="h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-muted"
      >
        <Icon name="plus" color={colors.foreground} />
      </Pressable>
    </View>
  );
}
