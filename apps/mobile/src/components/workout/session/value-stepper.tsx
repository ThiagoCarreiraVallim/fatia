import { useState, type ReactNode } from 'react';
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
  stacked,
  caption,
  onChange,
}: {
  label: string;
  unit?: string;
  accessibilityLabel: string;
  value: number;
  step: number;
  integer?: boolean;
  size?: 'lg' | 'sm';
  /**
   * O desenho da sessão (prancha `Al-T3`): o rótulo curto em cima, o número
   * grande, a legenda (recorde, meta) e o −/+ embaixo.
   */
  stacked?: { shortLabel: string };
  caption?: ReactNode;
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

  const minus = (big: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Diminuir ${accessibilityLabel}`}
      onPress={() => onChange(stepValue(value, -step))}
      className={
        big
          ? 'h-12 w-12 items-center justify-center rounded-full bg-surface-3 active:opacity-80'
          : 'h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-80'
      }
    >
      <Minus size={18} color={colors.foreground} />
    </Pressable>
  );
  const plus = (big: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Aumentar ${accessibilityLabel}`}
      onPress={() => onChange(stepValue(value, step))}
      className={
        big
          ? 'h-12 w-12 items-center justify-center rounded-full bg-surface-3 active:opacity-80'
          : 'h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-80'
      }
    >
      <Plus size={18} color={colors.foreground} />
    </Pressable>
  );
  const field = editing ? (
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
      className={
        stacked
          ? 'h-12 w-full border-0 bg-transparent px-0 text-center text-[34px] font-extrabold'
          : 'h-12 min-w-[64px] flex-1 border-0 bg-transparent px-0 text-center text-2xl font-extrabold'
      }
    />
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${formatNumber(value)}. Tocar para digitar`}
      onPress={() => {
        setDraft(formatNumber(value));
        setEditing(true);
      }}
      className={
        stacked
          ? 'min-h-[48px] w-full justify-center'
          : 'min-h-[48px] min-w-[64px] flex-1 justify-center'
      }
    >
      <Text
        className={
          stacked
            ? 'text-center font-display text-[40px] leading-[46px] text-foreground'
            : valueClass
        }
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatNumber(value)}
      </Text>
    </Pressable>
  );

  if (stacked) {
    return (
      <View className="flex-1 items-center gap-2 rounded-card bg-card px-2.5 py-3.5">
        <Text className="text-[13px] text-muted-foreground">{stacked.shortLabel}</Text>
        {field}
        {caption}
        <View className="flex-row gap-2">
          {minus(true)}
          {plus(true)}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 gap-1.5 rounded-3xl bg-card px-2 py-3">
      <Text className="text-center text-[12px] font-sans-bold text-muted-foreground">
        {unit ? `${label} (${unit})` : label}
      </Text>
      <View className="flex-row items-center justify-between">
        {minus(false)}
        {field}
        {plus(false)}
      </View>
    </View>
  );
}
