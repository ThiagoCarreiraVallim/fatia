import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui';
import { colors } from '@/theme/colors';

const INPUT = 'h-[52px] rounded-field bg-card px-[18px] text-base text-foreground';

/** Senha com "Mostrar". `isNew` liga o gerador de senha forte do sistema. */
export function PasswordField({
  value,
  onChange,
  isNew,
  onSubmit,
  label = 'Senha',
}: {
  value: string;
  onChange: (v: string) => void;
  isNew: boolean;
  onSubmit?: () => void;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View className="flex-row items-center rounded-field bg-card">
      <TextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={colors.placeholder}
        secureTextEntry={!visible}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        textContentType={isNew ? 'newPassword' : 'password'}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={256}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
        className="h-[52px] flex-1 px-[18px] text-base text-foreground"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Esconder senha' : 'Mostrar senha'}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        className="px-4"
      >
        <Text className="text-xs font-bold text-muted-foreground">
          {visible ? 'Esconder' : 'Mostrar'}
        </Text>
      </Pressable>
    </View>
  );
}

/** O código de 6 dígitos do e-mail, com o preenchimento automático do sistema. */
export function CodeField({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
}) {
  return (
    <TextInput
      accessibilityLabel="Código do e-mail"
      placeholder="000000"
      placeholderTextColor={colors.placeholder}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={6}
      autoFocus
      value={value}
      onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
      onSubmitEditing={onSubmit}
      className={`${INPUT} text-center text-2xl tracking-[8px]`}
    />
  );
}
