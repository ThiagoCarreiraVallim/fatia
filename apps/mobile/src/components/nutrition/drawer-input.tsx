import {
  StyleSheet,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { DrawerTextInput, cn } from '@/components/ui';
import { colors } from '@/theme/colors';

/**
 * Campo de texto com a aparência do `Input` de `@/components/ui`, mas sobre
 * `DrawerTextInput`.
 *
 * Duas razões para existir:
 *
 * - um `TextInput` comum dentro do bottom sheet não avisa o sheet que o teclado
 *   subiu, e o campo fica escondido atrás dele (ver o cabeçalho de
 *   `ui/drawer.tsx`). Como `ui/` pertence a outra fatia, a variante de drawer
 *   mora aqui, onde os dois drawers de nutrição a consomem;
 * - o estilo vai em `style`, e não em `className`. O `@gorhom/bottom-sheet` é
 *   publicado já compilado, então o `className` do NativeWind não chega ao
 *   `TextInput` lá dentro — o campo ficaria com o texto na cor padrão do
 *   sistema, invisível sobre o fundo escuro.
 */

// Layout fixo aqui; as cores entram no render (`drawerFieldStyle`), porque
// mudam com o tema e um StyleSheet de módulo congelaria o tema do carregamento.
const styles = StyleSheet.create({
  field: {
    minHeight: 44,
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
});

export function DrawerInput({
  label,
  style,
  labelClassName,
  ...props
}: Omit<TextInputProps, 'style'> & {
  label: string;
  style?: StyleProp<TextStyle>;
  /** O formulário manual usa rótulos menores nos campos de macro. */
  labelClassName?: string;
}) {
  return (
    <View className="gap-1">
      <Text className={cn('text-sm font-medium text-foreground', labelClassName)}>{label}</Text>
      <DrawerTextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.primaryText}
        style={[drawerFieldStyle(), style]}
        {...props}
      />
    </View>
  );
}

export function drawerFieldStyle(): StyleProp<TextStyle> {
  return [styles.field, { borderColor: colors.border, color: colors.foreground }];
}
