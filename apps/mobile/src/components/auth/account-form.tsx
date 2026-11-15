import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { savePendingName } from '@/auth/pending-name';
import { Button, Segmented, Text } from '@/components/ui';
import { colors } from '@/theme/colors';

const APPLE_BUTTON = { background: '#e5e2e1', text: '#111111' } as const;

const INPUT = 'h-[52px] rounded-field bg-card px-[18px] text-base text-foreground';

/**
 * A etapa 1 do onboarding (Onb-01a e Onb-01b), igual à do PWA: nome, e-mail,
 * Google e Apple. A senha é digitada na tela do Logto, no navegador do sistema;
 * o app nunca a vê (ADR 008). O e-mail vai como `login_hint` e o nome fica no
 * cofre até o onboarding gravá-lo no perfil.
 */
export function AccountForm({
  showModeSwitch = true,
  brandCta = false,
}: {
  showModeSwitch?: boolean;
  /** O botão principal na cor da comunidade (Onb-01a). */
  brandCta?: boolean;
}) {
  const { status, signIn, error } = useAuth();
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const create = mode === 'create';
  const busy = status === 'loading';

  const submit = async () => {
    if (create) await savePendingName(name);
    await signIn(create ? 'register' : undefined, { loginHint: email });
  };

  return (
    <View className="gap-3.5">
      {showModeSwitch ? (
        <Segmented
          label="Conta"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'create', label: 'Criar conta' },
            { value: 'login', label: 'Entrar' },
          ]}
        />
      ) : null}
      {create ? (
        <TextInput
          accessibilityLabel="Seu nome"
          placeholder="Seu nome"
          placeholderTextColor={colors.placeholder}
          autoComplete="name"
          textContentType="name"
          maxLength={80}
          value={name}
          onChangeText={setName}
          className={INPUT}
        />
      ) : null}
      <TextInput
        accessibilityLabel="E-mail"
        placeholder="E-mail"
        placeholderTextColor={colors.placeholder}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        className={INPUT}
      />
      <Text className="text-xs text-faint">
        A senha você digita na próxima tela, a de login segura.
      </Text>
      <Button
        size="xl"
        variant={brandCta ? 'brand' : 'default'}
        loading={busy}
        onPress={() => void submit()}
      >
        {create ? 'Criar conta' : 'Entrar'}
      </Button>
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <Text className="text-xs text-faint">ou</Text>
        <View className="h-px flex-1 bg-border" />
      </View>
      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void signIn(undefined, { social: 'google' })}
          className="h-12 flex-1 items-center justify-center rounded-lg bg-card"
        >
          <Text className="text-sm font-bold text-foreground">Google</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void signIn(undefined, { social: 'apple' })}
          // O botão claro da prancha, igual nos dois temas (as cores da Apple).
          style={{ backgroundColor: APPLE_BUTTON.background }}
          className="h-12 flex-1 items-center justify-center rounded-lg"
        >
          <Text className="text-sm font-bold" style={{ color: APPLE_BUTTON.text }}>
            Apple
          </Text>
        </Pressable>
      </View>
      {!create ? (
        <Button variant="link" disabled={busy} onPress={() => void signIn('reset_password')}>
          Esqueci minha senha
        </Button>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="text-center text-xs text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
