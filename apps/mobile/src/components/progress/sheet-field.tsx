import { View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { DrawerTextInput, FormMessage, Label } from '@/components/ui';
import { chartColors } from '@/components/charts';

/**
 * Campo numérico dentro de um bottom sheet.
 *
 * Usa `DrawerTextInput` e não `Input`: um `TextInput` comum não avisa o sheet de
 * que o teclado subiu e o campo fica escondido atrás dele (ver o cabeçalho de
 * `components/ui/drawer.tsx`). O estilo vai por `style` em vez de `className`
 * porque o componente vem do `@gorhom/bottom-sheet` e não passa pelo interop do
 * NativeWind.
 */
export function SheetField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'decimal-pad',
  autoFocus,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  error?: string | null;
  hint?: string;
}) {
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      <DrawerTextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        aria-invalid={Boolean(error)}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8a8a8a"
        selectionColor={chartColors.primary}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        style={{
          minHeight: 44,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: chartColors.border,
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 16,
          color: chartColors.foreground,
        }}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
    </View>
  );
}
