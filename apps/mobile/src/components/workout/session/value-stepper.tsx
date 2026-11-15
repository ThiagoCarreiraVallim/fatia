import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Input } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { formatNumber, parseDecimalInput } from './format';
import { stepValue } from './guided-session';
import { colors } from '@/theme/colors';

/**
 * O campo de número da sessão (prancha `Al-T3-Sessao`): −/+ grandes dos lados
 * e o valor no meio, que vira campo de digitar no toque. Digitar ganha do −/+
 * quando o salto é grande (de 20 para 60 kg são 16 toques). O teclado é o
 * decimal com vírgula (`parseDecimalInput`) ou o numérico, para o inteiro.
 */
export function ValueStepper({
  label,
  unit,
  accessibilityLabel,
  value,
  step,
  integer,
  size = 'lg',
  onChange,
}: {
  label: string;
  unit?: string;
  accessibilityLabel: string;
  value: number;
  step: number;
  integer?: boolean;
  size?: 'lg' | 'sm';
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function commit() {
    const parsed = parseDecimalInput(draft);
    if (parsed != null) onChange(Math.max(0, integer ? Math.round(parsed) : parsed));
    setEditing(false);
  }

  const valueClass =
    size === 'lg'
      ? 'text-center font-display-semibold text-[34px] leading-[40px] text-foreground'
      : 'text-center font-display-semibold text-2xl text-foreground';

  return (
    <View className="flex-1 gap-1.5 rounded-3xl bg-card px-2 py-3">
      <Text className="text-center text-[12px] font-sans-bold text-muted-foreground">
        {unit ? `${label} (${unit})` : label}
      </Text>
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Diminuir ${accessibilityLabel}`}
          onPress={() => onChange(stepValue(value, -step))}
          className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-80"
        >
          <Minus size={18} color={colors.foreground} />
        </Pressable>

        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            returnKeyType="done"
            selectTextOnFocus
            keyboardType={integer ? 'number-pad' : 'decimal-pad'}
            accessibilityLabel={accessibilityLabel}
            className="h-12 min-w-[64px] flex-1 border-0 bg-transparent px-0 text-center text-2xl font-extrabold"
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${accessibilityLabel}: ${formatNumber(value)}. Tocar para digitar`}
            onPress={() => {
              setDraft(formatNumber(value));
              setEditing(true);
            }}
            className="min-h-[48px] min-w-[64px] flex-1 justify-center"
          >
            <Text className={valueClass} style={{ fontVariant: ['tabular-nums'] }}>
              {formatNumber(value)}
            </Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aumentar ${accessibilityLabel}`}
          onPress={() => onChange(stepValue(value, step))}
          className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-80"
        >
          <Plus size={18} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}
