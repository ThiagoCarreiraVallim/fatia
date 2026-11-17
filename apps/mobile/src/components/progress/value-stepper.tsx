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
  size = 'lg',
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
  /** `lg`: o número grande do G7. `sm`: o `.stepper` compacto do G10 (− 68 kg +). */
  size?: 'lg' | 'sm';
}) {
  const bump = (dir: 1 | -1) => {
    const current = value.trim() === '' ? (base ?? 0) : parseAmount(value);
    if (current === null) return;
    const next = Math.max(0, current + dir * step);
    onChange(decimals ? next.toFixed(decimals).replace('.', ',') : String(Math.round(next)));
  };
  const field = (fontSize: number) => (
    <DrawerTextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      selectionColor={colors.primary}
      keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
      style={{
        minWidth: fontSize,
        // No grande, colado na unidade (70,2kg); no compacto, no meio da pílula.
        textAlign: fontSize > 20 ? 'right' : 'center',
        fontSize,
        fontFamily: 'Sora_700Bold',
        color: colors.foreground,
        paddingVertical: 0,
      }}
    />
  );
  if (size === 'sm') {
    return (
      <View className="flex-row items-center gap-1.5 rounded-[14px] bg-muted p-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Menos"
          onPress={() => bump(-1)}
          className="h-10 w-10 items-center justify-center rounded-[12px] bg-card"
        >
          <View style={{ width: 12, height: 2, backgroundColor: colors.foreground }} />
        </Pressable>
        <View className="min-w-[56px] flex-row items-baseline justify-center gap-1">
          {field(18)}
          <Text className="font-display text-[18px] text-foreground">{unit}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mais"
          onPress={() => bump(1)}
          className="h-10 w-10 items-center justify-center rounded-[12px] bg-card"
        >
          <Icon name="plus" size={16} color={colors.foreground} />
        </Pressable>
      </View>
    );
  }
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
      {/* A unidade colada no número (70,2kg), como na prancha. */}
      <View className="min-w-[150px] flex-row items-baseline justify-center">
        {field(44)}
        <Text className="font-display text-[22px] text-muted-foreground">{unit}</Text>
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
